import { createHash } from 'node:crypto';
import { createActor, type ActorRefFrom } from 'xstate';

import { parseRestartReceiptV1, type RestartReceiptV1 } from './contracts';
import {
  createRawBootstrapProvedV1,
  createRawOperationalLedgerAuthorityV1,
  isRawBootstrapRetentionAckV1,
  type RawBootstrapProvedV1,
  type RawBootstrapRetentionAckV1,
} from './raw-operational-authority';
import { rawWorkerRestartMachine, type RawWorkerRestartEvent } from './raw-worker-restart.machine';
import type {
  RawCdpClient,
  RawCdpCloseReceipt,
  RawCdpCommand,
  RawCdpCommandReceipt,
  RawCdpEvent,
} from './raw-cdp-client';

const PAGE_FILTER = Object.freeze([
  Object.freeze({ type: 'page', exclude: false }),
  Object.freeze({ exclude: true }),
]);
const SERVICE_WORKER_FILTER = Object.freeze([
  Object.freeze({ type: 'service_worker', exclude: false }),
  Object.freeze({ exclude: true }),
]);
const IDENTITY_EXPRESSION =
  '(() => ({ workerUrl: globalThis.location.href, registrationScope: globalThis.registration.scope }))()';
const MAX_CONTEXT_AUTHORITIES = 4_096;

type EventListener = (event: RawCdpEvent) => void | Promise<void>;

export interface RawCdpClientPort {
  readonly closed: Promise<RawCdpCloseReceipt>;
  close(): void;
  onEvent(listener: EventListener): () => void;
  sendCleanupCommand(command: RawCdpCommand): Promise<RawCdpCommandReceipt>;
  sendCommand(command: RawCdpCommand): Promise<RawCdpCommandReceipt>;
  sendCommandBatch(commands: readonly RawCdpCommand[]): readonly Promise<RawCdpCommandReceipt>[];
}

export interface RawWorkerAuthority {
  readonly extensionId: string;
  readonly registrationId: string;
  readonly versionId: string;
  readonly scopeURL: string;
  readonly scriptURL: string;
  readonly targetId: string;
  readonly sessionId: string;
  readonly attachmentGeneration: number;
  readonly attachmentOrigin: 'auto' | 'manual';
  readonly uniqueContextId: string;
}

export interface RawReleaseReceipt {
  readonly schemaVersion: 1;
  readonly processGeneration: number;
  readonly leaseEpoch: number;
  readonly transportId: string;
  readonly released: true;
  readonly deadline: {
    readonly timeoutMs: number;
    readonly completedWithinDeadline: true;
  };
  readonly commandLedger: readonly RawReleaseCommandLedgerEntry[];
  readonly attachmentInventory: readonly RawReleaseAttachmentEvidence[];
  readonly proofs: RawReleaseProofs;
  readonly close: RawCdpCloseReceipt;
}

export interface RawReleaseCommandLedgerEntry {
  readonly ordinal: number;
  readonly kind: 'cleanup' | 'operational';
  readonly commandId: number | null;
  readonly method: string;
  readonly sessionId: string | null;
  readonly paramsSha256: string;
  readonly status: 'fulfilled' | 'rejected';
  readonly resultSha256: string | null;
  readonly rejectionSha256: string | null;
}

export interface RawReleaseAttachmentEvidence {
  readonly attachmentGeneration: number;
  readonly origin: 'auto' | 'manual';
  readonly sessionId: string;
  readonly targetId: string;
  readonly url: string;
  readonly waitingForDebugger: boolean;
  readonly detached: boolean;
}

export interface RawReleaseProofs {
  readonly resumeReceipts: readonly RawCdpCommandReceipt[];
  readonly autoAttachDisarm: RawCdpCommandReceipt;
  readonly attachFence: {
    readonly receipt: RawCdpCommandReceipt;
    readonly targets: readonly TargetRecord[];
  };
  readonly manualDetachReceipts: readonly RawCdpCommandReceipt[];
  readonly workerDetachEvents: readonly RawReleaseDetachEventEvidence[];
  readonly zeroAttachedFence: {
    readonly receipt: RawCdpCommandReceipt;
    readonly targets: readonly TargetRecord[];
  };
  readonly serviceWorkerDisable: RawCdpCommandReceipt;
  readonly controlDetach: RawCdpCommandReceipt;
  readonly controlDetachEvent: RawReleaseDetachEventEvidence;
  readonly sentinelFence: {
    readonly receipt: RawCdpCommandReceipt;
    readonly targets: readonly TargetRecord[];
  };
  readonly discoveryDisable: RawCdpCommandReceipt;
  readonly close: RawCdpCloseReceipt;
}

export interface RawReleaseDetachEventPreimage {
  readonly schemaVersion: 1;
  readonly processGeneration: number;
  readonly leaseEpoch: number;
  readonly transportId: string;
  readonly attachmentGeneration: number | null;
  readonly targetId: string;
  readonly sessionId: string;
  readonly method: 'Target.detachedFromTarget';
}

export interface RawReleaseDetachEventEvidence extends RawReleaseDetachEventPreimage {
  readonly preimage: RawReleaseDetachEventPreimage;
  readonly eventSha256: string;
}

export interface RawWorkerEpochResult {
  readonly applicationDiagnostics: readonly RawApplicationDiagnostic[];
  readonly authority: RawWorkerAuthority;
  readonly restartReceipt: RestartReceiptV1;
  readonly restartProof: RawWorkerRestartPrivateProof;
  readonly releaseReceipt: RawReleaseReceipt;
}

export interface RawBootstrapCommandLedgerEntry {
  readonly ordinal: number;
  readonly commandId: number;
  readonly method: 'Runtime.runIfWaitingForDebugger' | 'Runtime.evaluate';
  readonly sessionId: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly paramsSha256: string;
  readonly result: Readonly<Record<string, unknown>>;
  readonly resultSha256: string;
}

export interface RawWorkerRestartPrivateProof {
  readonly schemaVersion: 1;
  readonly processGeneration: number;
  readonly leaseEpoch: number;
  readonly transportId: string;
  readonly restartGeneration: number;
  readonly bootstrapCommandBatchSha256: string;
  readonly authorityPreimage: Readonly<Record<string, unknown>>;
  readonly bootstrapPreimage: Readonly<Record<string, unknown>>;
  readonly receiptPreimage: Readonly<Record<string, unknown>>;
  readonly bootstrapCommandBatchPreimage: Readonly<Record<string, unknown>>;
  readonly commandLedger: readonly RawBootstrapCommandLedgerEntry[];
  readonly batchSettlements: readonly RawBootstrapBatchSettlement[];
}

export interface RawBootstrapBatchSettlement {
  readonly ordinal: number;
  readonly method: 'Runtime.runIfWaitingForDebugger' | 'Runtime.evaluate';
  readonly status: 'fulfilled' | 'rejected';
  readonly commandId: number | null;
  readonly resultSha256: string | null;
  readonly rejectionSha256: string | null;
}

export class RawWorkerEpochFailure extends Error {
  readonly schemaVersion = 1 as const;
  readonly commandLedger: readonly RawBootstrapCommandLedgerEntry[];
  readonly batchSettlements: readonly RawBootstrapBatchSettlement[];
  readonly releaseReceipt: RawReleaseReceipt;
  override readonly cause: unknown;

  constructor(
    cause: unknown,
    commandLedger: readonly RawBootstrapCommandLedgerEntry[],
    batchSettlements: readonly RawBootstrapBatchSettlement[],
    releaseReceipt: RawReleaseReceipt
  ) {
    super(cause instanceof Error ? cause.message : 'Raw worker epoch failed.');
    this.name = 'RawWorkerEpochFailure';
    this.cause = cause;
    this.commandLedger = freezeEvidence(commandLedger);
    this.batchSettlements = freezeEvidence(batchSettlements);
    this.releaseReceipt = freezeEvidence(releaseReceipt);
  }
}

export interface RawApplicationDiagnostic {
  readonly kind: 'Runtime.consoleAPICalled' | 'Runtime.exceptionThrown' | 'probe.exceptionDetails';
  readonly message: string;
}

export interface RunRawWorkerEpochOptions {
  readonly client: RawCdpClientPort;
  readonly expectedWorkerPath: string;
  readonly leaseEpoch: number;
  readonly operationTimeoutMs: number;
  readonly onBootstrapProved: (
    proof: RawBootstrapProvedV1
  ) => Promise<RawBootstrapRetentionAckV1> | RawBootstrapRetentionAckV1;
  readonly playwrightEpoch: number;
  readonly processGeneration: number;
  readonly probeExpression?: string;
  readonly releaseTimeoutMs: number;
  readonly restartGeneration: number;
  readonly transportId: string;
}

interface RegistrationRecord {
  readonly registrationId: string;
  readonly scopeURL: string;
  readonly isDeleted: boolean;
}

interface VersionRecord {
  readonly registrationId: string;
  readonly versionId: string;
  readonly scriptURL: string;
  readonly status: string;
  readonly runningStatus: string;
  readonly targetId?: string;
}

interface TargetRecord {
  readonly targetId: string;
  readonly type: string;
  readonly url: string;
  readonly attached: boolean;
}

interface AttachmentRecord {
  readonly attachmentGeneration: number;
  readonly origin: 'auto' | 'manual';
  readonly sessionId: string;
  readonly targetId: string;
  readonly url: string;
  waitingForDebugger: boolean;
  detached: boolean;
}

interface NativeDetachObservation {
  readonly targetId: string;
  readonly sessionId: string;
  readonly preimage: {
    readonly targetId: string;
    readonly sessionId: string;
  };
  readonly eventSha256: string;
}

interface AuthorityCandidate {
  readonly extensionId: string;
  readonly registration: RegistrationRecord;
  readonly version: VersionRecord;
}

interface RuntimeEvaluationResult {
  readonly result: Readonly<Record<string, unknown>>;
  readonly exceptionDetails?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown, ancestors = new Set<object>()): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Canonical evidence numbers must be finite.');
    }
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new TypeError(`Unsupported canonical evidence value: ${typeof value}.`);
  }
  if (ancestors.has(value)) {
    throw new TypeError('Cyclic canonical evidence is forbidden.');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalize(item, ancestors)).join(',')}]`;
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key], ancestors)}`)
      .join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}

function freezeEvidence<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    const record = value as Record<PropertyKey, unknown>;
    for (const key of Reflect.ownKeys(record)) {
      freezeEvidence(record[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function cloneEvidence<T>(value: T): T {
  return freezeEvidence(structuredClone(value));
}

function assertPositiveSafeInteger(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
}

function assertNonNegativeSafeInteger(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

function normalizedErrorEvidence(error: unknown): Readonly<Record<string, unknown>> {
  return Object.freeze({
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
  });
}

function appendReleaseSettlement(
  ledger: RawReleaseCommandLedgerEntry[],
  kind: RawReleaseCommandLedgerEntry['kind'],
  command: RawCdpCommand,
  settlement:
    | { readonly status: 'fulfilled'; readonly receipt: RawCdpCommandReceipt }
    | { readonly status: 'rejected'; readonly error: unknown }
): void {
  const params = command.params ?? Object.freeze({});
  if (settlement.status === 'fulfilled') {
    ledger.push(
      cloneEvidence({
        ordinal: ledger.length,
        kind,
        commandId: settlement.receipt.id,
        method: command.method,
        sessionId: command.sessionId ?? null,
        paramsSha256: sha256Canonical(params),
        status: 'fulfilled' as const,
        resultSha256: sha256Canonical(settlement.receipt.result),
        rejectionSha256: null,
      })
    );
    return;
  }
  ledger.push(
    cloneEvidence({
      ordinal: ledger.length,
      kind,
      commandId: null,
      method: command.method,
      sessionId: command.sessionId ?? null,
      paramsSha256: sha256Canonical(params),
      status: 'rejected' as const,
      resultSha256: null,
      rejectionSha256: sha256Canonical(normalizedErrorEvidence(settlement.error)),
    })
  );
}

function parseTargetRecords(result: Readonly<Record<string, unknown>>): readonly TargetRecord[] {
  if (!Array.isArray(result.targetInfos)) {
    throw new Error('Target.getTargets returned no targetInfos array.');
  }
  const ids = new Set<string>();
  return result.targetInfos.map((value) => {
    if (
      !isRecord(value) ||
      typeof value.targetId !== 'string' ||
      value.targetId.length === 0 ||
      typeof value.type !== 'string' ||
      typeof value.url !== 'string' ||
      typeof value.attached !== 'boolean'
    ) {
      throw new Error('Target.getTargets returned a malformed target identity.');
    }
    if (ids.has(value.targetId)) {
      throw new Error('Target.getTargets returned a duplicate target.');
    }
    ids.add(value.targetId);
    return Object.freeze({
      targetId: value.targetId,
      type: value.type,
      url: value.url,
      attached: value.attached,
    });
  });
}

function parseSessionId(result: Readonly<Record<string, unknown>>, stage: string): string {
  if (
    typeof result.sessionId !== 'string' ||
    result.sessionId.length === 0 ||
    /[\0\r\n]/u.test(result.sessionId)
  ) {
    throw new Error(`${stage} returned an invalid session identity.`);
  }
  return result.sessionId;
}

function workerPathMatches(url: string, expectedPath: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'chrome-extension:' &&
      parsed.pathname === expectedPath &&
      parsed.search === '' &&
      parsed.hash === ''
    );
  } catch {
    return false;
  }
}

class Deadline {
  readonly #expiresAt: number;

  constructor(timeoutMs: number) {
    assertPositiveSafeInteger('Raw worker deadline', timeoutMs);
    this.#expiresAt = performance.now() + timeoutMs;
  }

  async wait<T>(operation: Promise<T>, stage: string): Promise<T> {
    const remaining = this.#expiresAt - performance.now();
    if (remaining <= 0) {
      throw new Error(`Raw worker ${stage} exceeded its absolute deadline.`);
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`Raw worker ${stage} exceeded its absolute deadline.`)),
            Math.ceil(remaining)
          );
        }),
      ]);
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }
}

class RawWorkerObservations {
  readonly registrations = new Map<string, RegistrationRecord>();
  readonly versions = new Map<string, VersionRecord>();
  readonly attachments = new Map<string, AttachmentRecord>();
  readonly contexts = new Map<string, Set<string>>();
  readonly contextIds = new Map<string, Map<number, string>>();
  readonly contextOrigins = new Map<string, Map<string, string>>();
  readonly preCrashContextIds = new Map<string, Set<string>>();
  readonly revokedContextIds = new Map<string, Set<string>>();
  readonly postCrashDestroyedContextIds = new Map<string, Set<string>>();
  readonly contextGenerations = new Map<string, number>();
  readonly revokedContextIdsHashes = new Map<string, string>();
  readonly postCrashDestroyedContextIdsHashes = new Map<string, string>();
  readonly retiredContextEvidenceCounts = new Map<string, number>();
  readonly crashedSessions = new Set<string>();
  readonly reloadedSessions = new Set<string>();
  readonly contextsClearedSessions = new Set<string>();
  readonly crashEventHashes = new Map<string, string>();
  readonly reloadEventHashes = new Map<string, string>();
  readonly contextEventHashes = new Map<string, Map<string, string>>();
  readonly diagnostics: RawApplicationDiagnostic[] = [];
  readonly detachEvents = new Map<string, NativeDetachObservation>();
  readonly controlTargets = new Map<string, string>();

  #attachmentGeneration = 0;
  #failure: Error | undefined;
  #waiters = new Set<() => void>();

  readonly consume = (event: RawCdpEvent): Error | undefined => {
    try {
      this.#reduce(event);
      return undefined;
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.#failure ??= failure;
      return failure;
    } finally {
      this.#wake();
    }
  };

  assertHealthy(): void {
    if (this.#failure !== undefined) {
      throw this.#failure;
    }
  }

  recordFailure(error: unknown): void {
    if (this.#failure === undefined) {
      this.#failure = error instanceof Error ? error : new Error(String(error));
    }
    this.#wake();
  }

  async waitFor(predicate: () => boolean, deadline: Deadline, stage: string): Promise<void> {
    while (true) {
      this.assertHealthy();
      if (predicate()) {
        return;
      }
      let wake!: () => void;
      const signal = new Promise<void>((resolve) => {
        wake = resolve;
        this.#waiters.add(resolve);
      });
      this.assertHealthy();
      if (predicate()) {
        this.#waiters.delete(wake);
        return;
      }
      try {
        await deadline.wait(signal, stage);
      } finally {
        this.#waiters.delete(wake);
      }
    }
  }

  rememberManualAttachment(sessionId: string, targetId: string, url: string): AttachmentRecord {
    const existing = this.attachments.get(sessionId);
    if (existing !== undefined) {
      if (existing.targetId !== targetId || existing.url !== url) {
        throw new Error('Manual worker attachment response crossed an observed attachment.');
      }
      return existing;
    }
    const attachment: AttachmentRecord = {
      attachmentGeneration: ++this.#attachmentGeneration,
      origin: 'manual',
      sessionId,
      targetId,
      url,
      waitingForDebugger: true,
      detached: false,
    };
    this.attachments.set(sessionId, attachment);
    return attachment;
  }

  rememberControlAttachment(sessionId: string, targetId: string): void {
    const existing = this.controlTargets.get(sessionId);
    if (existing !== undefined && existing !== targetId) {
      throw new Error('Control attachment response crossed its target identity.');
    }
    this.controlTargets.set(sessionId, targetId);
  }

  #wake(): void {
    for (const wake of this.#waiters) {
      wake();
    }
    this.#waiters.clear();
  }

  #reduce(event: RawCdpEvent): void {
    switch (event.method) {
      case 'ServiceWorker.workerRegistrationUpdated': {
        if (!Array.isArray(event.params.registrations)) {
          throw new Error('ServiceWorker registration update is malformed.');
        }
        for (const value of event.params.registrations) {
          if (
            !isRecord(value) ||
            typeof value.registrationId !== 'string' ||
            typeof value.scopeURL !== 'string' ||
            typeof value.isDeleted !== 'boolean'
          ) {
            throw new Error('ServiceWorker registration member is malformed.');
          }
          const record = Object.freeze({
            registrationId: value.registrationId,
            scopeURL: value.scopeURL,
            isDeleted: value.isDeleted,
          });
          this.registrations.set(record.registrationId, record);
        }
        return;
      }
      case 'ServiceWorker.workerVersionUpdated': {
        if (!Array.isArray(event.params.versions)) {
          throw new Error('ServiceWorker version update is malformed.');
        }
        for (const value of event.params.versions) {
          if (
            !isRecord(value) ||
            typeof value.registrationId !== 'string' ||
            typeof value.versionId !== 'string' ||
            typeof value.scriptURL !== 'string' ||
            typeof value.status !== 'string' ||
            typeof value.runningStatus !== 'string' ||
            (value.targetId !== undefined && typeof value.targetId !== 'string')
          ) {
            throw new Error('ServiceWorker version member is malformed.');
          }
          const record: VersionRecord = Object.freeze({
            registrationId: value.registrationId,
            versionId: value.versionId,
            scriptURL: value.scriptURL,
            status: value.status,
            runningStatus: value.runningStatus,
            ...(value.targetId === undefined ? {} : { targetId: value.targetId }),
          });
          this.versions.set(record.versionId, record);
        }
        return;
      }
      case 'Target.attachedToTarget': {
        const targetInfo = event.params.targetInfo;
        if (
          typeof event.params.sessionId !== 'string' ||
          typeof event.params.waitingForDebugger !== 'boolean' ||
          !isRecord(targetInfo) ||
          typeof targetInfo.targetId !== 'string' ||
          typeof targetInfo.type !== 'string' ||
          typeof targetInfo.url !== 'string'
        ) {
          throw new Error('Target attachment event is malformed.');
        }
        if (targetInfo.type !== 'service_worker') {
          return;
        }
        const existing = this.attachments.get(event.params.sessionId);
        if (existing !== undefined) {
          if (existing.targetId !== targetInfo.targetId || existing.url !== targetInfo.url) {
            throw new Error('Target attachment session identity was reused.');
          }
          existing.waitingForDebugger = event.params.waitingForDebugger;
          return;
        }
        this.attachments.set(event.params.sessionId, {
          attachmentGeneration: ++this.#attachmentGeneration,
          origin: 'auto',
          sessionId: event.params.sessionId,
          targetId: targetInfo.targetId,
          url: targetInfo.url,
          waitingForDebugger: event.params.waitingForDebugger,
          detached: false,
        });
        return;
      }
      case 'Target.detachedFromTarget': {
        const sessionId = event.params.sessionId;
        const nativeTargetId = event.params.targetId;
        if (
          typeof sessionId !== 'string' ||
          sessionId.length === 0 ||
          (nativeTargetId !== undefined &&
            (typeof nativeTargetId !== 'string' || nativeTargetId.length === 0))
        ) {
          throw new Error('Target detachment event is malformed.');
        }
        const attachment = this.attachments.get(sessionId);
        const targetId =
          typeof nativeTargetId === 'string'
            ? nativeTargetId
            : (attachment?.targetId ?? this.controlTargets.get(sessionId));
        if (targetId === undefined) {
          throw new Error('Target detachment event has no authoritative target identity.');
        }
        if (attachment !== undefined && attachment.targetId !== targetId) {
          throw new Error('Target detachment event crossed its attachment identity.');
        }
        const controlTargetId = this.controlTargets.get(sessionId);
        if (controlTargetId !== undefined && controlTargetId !== targetId) {
          throw new Error('Target detachment event crossed its control identity.');
        }
        if (this.detachEvents.has(sessionId)) {
          throw new Error('Target detachment event duplicated its session identity.');
        }
        const preimage = Object.freeze({
          targetId,
          sessionId,
        });
        this.detachEvents.set(
          sessionId,
          Object.freeze({
            ...preimage,
            preimage,
            eventSha256: sha256Canonical(preimage),
          })
        );
        if (attachment !== undefined) {
          attachment.detached = true;
        }
        return;
      }
      case 'Inspector.targetCrashed': {
        if (event.sessionId === undefined) {
          throw new Error('Inspector crash has no session.');
        }
        if (this.crashedSessions.has(event.sessionId)) {
          throw new Error('Inspector emitted a duplicate crash for the selected generation.');
        }
        const revoked = this.revokedContextIds.get(event.sessionId) ?? new Set<string>();
        for (const uniqueId of this.preCrashContextIds.get(event.sessionId) ?? []) {
          revoked.add(uniqueId);
        }
        this.revokedContextIds.set(event.sessionId, revoked);
        this.contextGenerations.set(
          event.sessionId,
          (this.contextGenerations.get(event.sessionId) ?? 0) + 1
        );
        this.revokedContextIdsHashes.set(event.sessionId, sha256Canonical([...revoked].sort()));
        this.postCrashDestroyedContextIds.set(event.sessionId, new Set());
        this.postCrashDestroyedContextIdsHashes.set(event.sessionId, sha256Canonical([]));
        this.contexts.get(event.sessionId)?.clear();
        this.contextIds.get(event.sessionId)?.clear();
        this.crashedSessions.add(event.sessionId);
        this.crashEventHashes.set(event.sessionId, sha256Canonical(event.params));
        return;
      }
      case 'Inspector.targetReloadedAfterCrash': {
        if (event.sessionId === undefined) {
          throw new Error('Inspector reload has no session.');
        }
        if (!this.crashedSessions.has(event.sessionId)) {
          throw new Error('Inspector reloaded a worker without a preceding crash boundary.');
        }
        if (this.reloadedSessions.has(event.sessionId)) {
          throw new Error('Inspector emitted a duplicate reload for the selected generation.');
        }
        this.reloadedSessions.add(event.sessionId);
        this.reloadEventHashes.set(event.sessionId, sha256Canonical(event.params));
        return;
      }
      case 'Runtime.executionContextCreated': {
        if (event.sessionId === undefined || !isRecord(event.params.context)) {
          throw new Error('Runtime context event is malformed.');
        }
        const uniqueId = event.params.context.uniqueId;
        const executionContextId = event.params.context.id;
        const origin = event.params.context.origin;
        if (
          typeof uniqueId !== 'string' ||
          uniqueId.length === 0 ||
          /[\0\r\n]/u.test(uniqueId) ||
          new TextEncoder().encode(uniqueId).byteLength > 512 ||
          typeof executionContextId !== 'number' ||
          !Number.isSafeInteger(executionContextId) ||
          executionContextId < 0 ||
          typeof origin !== 'string'
        ) {
          throw new Error('Runtime unique context identity is invalid.');
        }
        if (
          this.crashedSessions.has(event.sessionId) &&
          !this.reloadedSessions.has(event.sessionId)
        ) {
          throw new Error('Runtime created a replacement context before the native reload proof.');
        }
        if (this.revokedContextIds.get(event.sessionId)?.has(uniqueId)) {
          throw new Error('Runtime reused a revoked pre-crash context identity.');
        }
        if (this.postCrashDestroyedContextIds.get(event.sessionId)?.has(uniqueId)) {
          throw new Error('Runtime reused a destroyed post-crash context identity.');
        }
        const contexts = this.contexts.get(event.sessionId) ?? new Set<string>();
        const ids = this.contextIds.get(event.sessionId) ?? new Map<number, string>();
        if (contexts.has(uniqueId) || ids.has(executionContextId)) {
          throw new Error('Runtime emitted a duplicate execution context authority.');
        }
        const crashTombstoneCount = this.revokedContextIds.get(event.sessionId)?.size ?? 0;
        const postCrashTombstoneCount =
          this.postCrashDestroyedContextIds.get(event.sessionId)?.size ?? 0;
        if (
          crashTombstoneCount + postCrashTombstoneCount >= MAX_CONTEXT_AUTHORITIES ||
          this.contextEventHashes.get(event.sessionId)?.size === MAX_CONTEXT_AUTHORITIES
        ) {
          throw new Error('Runtime execution context authority capacity was exceeded.');
        }
        contexts.add(uniqueId);
        this.contexts.set(event.sessionId, contexts);
        ids.set(executionContextId, uniqueId);
        this.contextIds.set(event.sessionId, ids);
        const origins = this.contextOrigins.get(event.sessionId) ?? new Map<string, string>();
        origins.set(uniqueId, origin);
        this.contextOrigins.set(event.sessionId, origins);
        if (!this.crashedSessions.has(event.sessionId)) {
          const preCrash = this.preCrashContextIds.get(event.sessionId) ?? new Set<string>();
          preCrash.add(uniqueId);
          this.preCrashContextIds.set(event.sessionId, preCrash);
        }
        const hashes = this.contextEventHashes.get(event.sessionId) ?? new Map<string, string>();
        hashes.set(uniqueId, sha256Canonical(event.params));
        this.contextEventHashes.set(event.sessionId, hashes);
        return;
      }
      case 'Runtime.executionContextDestroyed': {
        if (event.sessionId === undefined) {
          throw new Error('Runtime context destroy has no session.');
        }
        const uniqueId = event.params.executionContextUniqueId;
        const executionContextId = event.params.executionContextId;
        if (
          typeof uniqueId !== 'string' ||
          uniqueId.length === 0 ||
          /[\0\r\n]/u.test(uniqueId) ||
          new TextEncoder().encode(uniqueId).byteLength > 512 ||
          typeof executionContextId !== 'number' ||
          !Number.isSafeInteger(executionContextId) ||
          executionContextId < 0
        ) {
          throw new Error('Runtime destroyed context identity is invalid.');
        }
        const evidenceCount = this.retiredContextEvidenceCounts.get(event.sessionId) ?? 0;
        if (evidenceCount >= MAX_CONTEXT_AUTHORITIES) {
          throw new Error('Runtime retired context evidence capacity was exceeded.');
        }
        this.retiredContextEvidenceCounts.set(event.sessionId, evidenceCount + 1);

        if (!this.crashedSessions.has(event.sessionId)) {
          if (this.contextIds.get(event.sessionId)?.get(executionContextId) !== uniqueId) {
            throw new Error('Runtime destroyed context identity does not match known authority.');
          }
        } else if (!this.revokedContextIds.get(event.sessionId)?.has(uniqueId)) {
          const destroyed =
            this.postCrashDestroyedContextIds.get(event.sessionId) ?? new Set<string>();
          if (
            !destroyed.has(uniqueId) &&
            (this.revokedContextIds.get(event.sessionId)?.size ?? 0) + destroyed.size >=
              MAX_CONTEXT_AUTHORITIES
          ) {
            throw new Error('Runtime execution context authority capacity was exceeded.');
          }
          destroyed.add(uniqueId);
          this.postCrashDestroyedContextIds.set(event.sessionId, destroyed);
          this.postCrashDestroyedContextIdsHashes.set(
            event.sessionId,
            sha256Canonical([...destroyed].sort())
          );
        }

        this.contexts.get(event.sessionId)?.delete(uniqueId);
        this.contextIds.get(event.sessionId)?.delete(executionContextId);
        this.contextOrigins.get(event.sessionId)?.delete(uniqueId);
        return;
      }
      case 'Runtime.executionContextsCleared': {
        if (event.sessionId === undefined) {
          throw new Error('Runtime clear has no session.');
        }
        const evidenceCount = this.retiredContextEvidenceCounts.get(event.sessionId) ?? 0;
        if (evidenceCount >= MAX_CONTEXT_AUTHORITIES) {
          throw new Error('Runtime retired context evidence capacity was exceeded.');
        }
        this.retiredContextEvidenceCounts.set(event.sessionId, evidenceCount + 1);
        this.contexts.get(event.sessionId)?.clear();
        this.contextIds.get(event.sessionId)?.clear();
        this.contextsClearedSessions.add(event.sessionId);
        return;
      }
      case 'Runtime.exceptionThrown':
        this.diagnostics.push({
          kind: 'Runtime.exceptionThrown',
          message: JSON.stringify(event.params),
        });
        return;
      case 'Runtime.consoleAPICalled': {
        if (event.params.type === 'error' || event.params.type === 'warning') {
          this.diagnostics.push({
            kind: 'Runtime.consoleAPICalled',
            message: JSON.stringify(event.params),
          });
        }
        return;
      }
      default:
        return;
    }
  }
}

type RawWorkerModelEvent = RawWorkerRestartEvent extends infer Event
  ? Event extends RawWorkerRestartEvent
    ? Omit<Event, 'processGeneration' | 'leaseEpoch'>
    : never
  : never;

class RawWorkerModelAdapter {
  readonly #actor: ActorRefFrom<typeof rawWorkerRestartMachine>;
  readonly #leaseEpoch: number;
  readonly #processGeneration: number;
  readonly #observations: RawWorkerObservations;

  constructor(options: RunRawWorkerEpochOptions, observations: RawWorkerObservations) {
    this.#leaseEpoch = options.leaseEpoch;
    this.#processGeneration = options.processGeneration;
    this.#observations = observations;
    this.#actor = createActor(rawWorkerRestartMachine, {
      input: {
        processGeneration: options.processGeneration,
        leaseEpoch: options.leaseEpoch,
        restartGeneration: options.restartGeneration,
        expectedWorkerPath: options.expectedWorkerPath,
        testProbeExpression: options.probeExpression ?? null,
      },
    }).start();
  }

  send(event: RawWorkerModelEvent): void {
    const beforeSnapshot = this.#actor.getSnapshot();
    const before = String(beforeSnapshot.value);
    const failureAlreadyObserved = beforeSnapshot.context.failureObserved;
    this.#actor.send({
      ...event,
      processGeneration: this.#processGeneration,
      leaseEpoch: this.#leaseEpoch,
    } as RawWorkerRestartEvent);
    const snapshot = this.#actor.getSnapshot();
    if (!failureAlreadyObserved && snapshot.context.failureObserved) {
      const contextDiagnostic =
        event.type === 'EXECUTION_CONTEXT_CREATED'
          ? (() => {
              const context = beforeSnapshot.context;
              const reasons = [
                ...(context.crashObserved ? ['crash-observed'] : []),
                ...(context.selectedSession === null ? ['selected-session-absent'] : []),
                ...(context.selectedSession !== null &&
                context.selectedSession.sessionId !== event.sessionId
                  ? ['selected-session-mismatch']
                  : []),
                ...(!Number.isSafeInteger(event.context.id) || event.context.id < 0
                  ? ['context-id-invalid']
                  : []),
                ...(context.preCrashContexts.some(
                  (candidate) => candidate.executionContextId === event.context.id
                )
                  ? ['context-id-duplicate']
                  : []),
                ...(context.preCrashContexts.some(
                  (candidate) => candidate.uniqueContextId === event.context.uniqueId
                )
                  ? ['context-unique-id-duplicate']
                  : []),
                ...(context.revokedUniqueContextIds.includes(event.context.uniqueId)
                  ? ['context-unique-id-revoked']
                  : []),
              ];
              return ` [${reasons.length === 0 ? 'closed-state-rejection' : reasons.join(',')}]`;
            })()
          : '';
      throw new Error(
        `Raw worker XState rejected ${event.type} from ${before}.${contextDiagnostic}`
      );
    }
  }

  beginFailedRelease(): void {
    if (!this.#actor.getSnapshot().context.failureObserved) {
      this.#actor.send({
        type: 'OBSERVER_PROTOCOL_FAILED',
        processGeneration: this.#processGeneration,
        leaseEpoch: this.#leaseEpoch,
      });
    }
    if (!this.#actor.getSnapshot().matches('failed_releasing')) {
      throw new Error('Raw worker XState cannot begin failed release from its current state.');
    }
    this.#actor.send({
      type: 'BEGIN_FAILED_RELEASE',
      processGeneration: this.#processGeneration,
      leaseEpoch: this.#leaseEpoch,
    });
    this.assertState(['release_resuming', 'release_disarming'], 'failed release start');
  }

  failureObserved(): boolean {
    return this.#actor.getSnapshot().context.failureObserved;
  }

  assertState(expected: string | readonly string[], stage: string): void {
    const actual = String(this.#actor.getSnapshot().value);
    const accepted = typeof expected === 'string' ? [expected] : expected;
    if (!accepted.includes(actual)) {
      throw new Error(
        `Raw worker XState diverged at ${stage}: expected ${accepted.join('|')}, received ${actual}.`
      );
    }
  }

  matches(state: string): boolean {
    return String(this.#actor.getSnapshot().value) === state;
  }

  restartContextProof(): {
    readonly contextGeneration: number;
    readonly revokedUniqueContextIdsSha256: string;
    readonly postCrashDestroyedUniqueContextIdsSha256: string;
    readonly identityCommandId: number;
    readonly identityResultSha256: string;
    readonly testCommandId: number | null;
    readonly testResultSha256: string | null;
    readonly resumeCommandId: number;
    readonly resumeResultSha256: string;
    readonly bootstrapCommandBatchSha256: string;
  } {
    const context = this.#actor.getSnapshot().context;
    if (
      context.revokedUniqueContextIdsSha256 === null ||
      context.postCrashDestroyedUniqueContextIdsSha256 === null ||
      context.contextGeneration < 1 ||
      context.identityCommandId === null ||
      context.identityResultSha256 === null ||
      context.resumeCommandId === null ||
      context.resumeResultSha256 === null ||
      context.bootstrapCommandBatchSha256 === null ||
      (context.testProbeConfigured
        ? context.testCommandId === null || context.testResultSha256 === null
        : context.testCommandId !== null || context.testResultSha256 !== null)
    ) {
      throw new Error('Raw worker XState has no complete restart correlation proof.');
    }
    return Object.freeze({
      contextGeneration: context.contextGeneration,
      revokedUniqueContextIdsSha256: context.revokedUniqueContextIdsSha256,
      postCrashDestroyedUniqueContextIdsSha256: context.postCrashDestroyedUniqueContextIdsSha256,
      identityCommandId: context.identityCommandId,
      identityResultSha256: context.identityResultSha256,
      testCommandId: context.testCommandId,
      testResultSha256: context.testResultSha256,
      resumeCommandId: context.resumeCommandId,
      resumeResultSha256: context.resumeResultSha256,
      bootstrapCommandBatchSha256: context.bootstrapCommandBatchSha256,
    });
  }

  consume = (event: RawCdpEvent): void => {
    switch (event.method) {
      case 'ServiceWorker.workerRegistrationUpdated': {
        if (!Array.isArray(event.params.registrations)) {
          return;
        }
        for (const value of event.params.registrations) {
          if (!isRecord(value) || typeof value.registrationId !== 'string') {
            continue;
          }
          const registration = this.#observations.registrations.get(value.registrationId);
          if (registration !== undefined) {
            this.send({ type: 'REGISTRATION_UPDATED', registration });
          }
        }
        return;
      }
      case 'ServiceWorker.workerVersionUpdated': {
        if (!Array.isArray(event.params.versions)) {
          return;
        }
        for (const value of event.params.versions) {
          if (!isRecord(value) || typeof value.versionId !== 'string') {
            continue;
          }
          const version = this.#observations.versions.get(value.versionId);
          if (version !== undefined) {
            this.send({ type: 'VERSION_UPDATED', version });
          }
        }
        return;
      }
      case 'Target.attachedToTarget': {
        const sessionId = event.params.sessionId;
        if (typeof sessionId !== 'string') {
          return;
        }
        const attachment = this.#observations.attachments.get(sessionId);
        if (attachment === undefined) {
          return;
        }
        this.send({
          type: 'TARGET_ATTACHED',
          attachmentOrigin: attachment.origin,
          targetId: attachment.targetId,
          sessionId: attachment.sessionId,
          targetType: 'service_worker',
          url: attachment.url,
          waitingForDebugger: attachment.waitingForDebugger,
        });
        return;
      }
      case 'Target.detachedFromTarget': {
        const sessionId = event.params.sessionId;
        if (typeof sessionId !== 'string') {
          return;
        }
        const detach = this.#observations.detachEvents.get(sessionId);
        if (detach === undefined) {
          return;
        }
        this.send({
          type: 'TARGET_DETACHED',
          targetId: detach.targetId,
          sessionId,
          eventPreimage: detach.preimage,
          eventSha256: detach.eventSha256,
        });
        return;
      }
      case 'Inspector.targetCrashed':
      case 'Inspector.targetReloadedAfterCrash': {
        const sessionId = event.sessionId;
        if (sessionId === undefined) {
          return;
        }
        const attachment = this.#observations.attachments.get(sessionId);
        if (attachment === undefined) {
          throw new Error('Raw worker XState could not bind an Inspector event to a target.');
        }
        this.send({
          type:
            event.method === 'Inspector.targetCrashed'
              ? 'INSPECTOR_TARGET_CRASHED'
              : 'INSPECTOR_TARGET_RELOADED',
          targetId: attachment.targetId,
          sessionId,
          eventSha256: sha256Canonical(event.params),
        });
        return;
      }
      case 'Runtime.executionContextCreated': {
        if (event.sessionId === undefined || !isRecord(event.params.context)) {
          return;
        }
        const { id, uniqueId, origin } = event.params.context;
        if (typeof id !== 'number' || typeof uniqueId !== 'string' || typeof origin !== 'string') {
          return;
        }
        this.send({
          type: 'EXECUTION_CONTEXT_CREATED',
          sessionId: event.sessionId,
          context: { id, uniqueId, origin },
          eventSha256: sha256Canonical(event.params),
        });
        return;
      }
      case 'Runtime.executionContextDestroyed': {
        if (
          event.sessionId === undefined ||
          typeof event.params.executionContextId !== 'number' ||
          typeof event.params.executionContextUniqueId !== 'string'
        ) {
          throw new Error('Runtime context destroy event is malformed.');
        }
        this.send({
          type: 'EXECUTION_CONTEXT_DESTROYED',
          sessionId: event.sessionId,
          executionContextId: event.params.executionContextId,
          executionContextUniqueId: event.params.executionContextUniqueId,
          eventSha256: sha256Canonical(event.params),
        });
        return;
      }
      case 'Runtime.executionContextsCleared':
        if (event.sessionId !== undefined) {
          this.send({
            type: 'EXECUTION_CONTEXTS_CLEARED',
            sessionId: event.sessionId,
            eventSha256: sha256Canonical(event.params),
          });
        }
        return;
      default:
        return;
    }
  };
}

function findAuthorityCandidate(
  observations: RawWorkerObservations,
  expectedWorkerPath: string
): AuthorityCandidate | undefined {
  const versions = [...observations.versions.values()].filter(
    (version) =>
      version.status !== 'redundant' && workerPathMatches(version.scriptURL, expectedWorkerPath)
  );
  if (versions.length === 0) {
    return undefined;
  }
  if (versions.length !== 1 || versions[0]!.status !== 'activated') {
    return undefined;
  }
  const version = versions[0]!;
  const registration = observations.registrations.get(version.registrationId);
  if (registration === undefined || registration.isDeleted) {
    return undefined;
  }
  const workerUrl = new URL(version.scriptURL);
  const expectedScope = `${workerUrl.protocol}//${workerUrl.hostname}/`;
  if (registration.scopeURL !== expectedScope) {
    throw new Error('Packaged service-worker registration scope diverged.');
  }
  const collidingRegistrations = [...observations.registrations.values()].filter(
    (candidate) => !candidate.isDeleted && candidate.scopeURL === registration.scopeURL
  );
  if (collidingRegistrations.length !== 1) {
    throw new Error('Packaged service-worker registration authority is ambiguous.');
  }
  return Object.freeze({
    extensionId: workerUrl.hostname,
    registration,
    version,
  });
}

function exactWorkerAttachment(
  observations: RawWorkerObservations,
  targetId: string,
  workerUrl: string
): AttachmentRecord | undefined {
  const candidates = [...observations.attachments.values()].filter(
    (attachment) =>
      !attachment.detached && attachment.targetId === targetId && attachment.url === workerUrl
  );
  if (candidates.length > 1) {
    throw new Error('Packaged service-worker attachment is ambiguous.');
  }
  return candidates[0];
}

function exactWorkerTarget(
  targets: readonly TargetRecord[],
  workerUrl: string
): TargetRecord | undefined {
  const candidates = targets.filter(
    (target) => target.type === 'service_worker' && target.url === workerUrl
  );
  if (candidates.length > 1) {
    throw new Error('Packaged service-worker target is ambiguous.');
  }
  return candidates[0];
}

function readIdentityEvaluation(
  receipt: RawCdpCommandReceipt,
  workerUrl: string,
  scopeURL: string
): void {
  const result = receipt.result as RuntimeEvaluationResult;
  const remoteObject = result.result;
  const resultKeys = Object.keys(result);
  if (
    resultKeys.length !== 1 ||
    resultKeys[0] !== 'result' ||
    !isRecord(remoteObject) ||
    Object.keys(remoteObject).length !== 2 ||
    !Object.prototype.hasOwnProperty.call(remoteObject, 'type') ||
    !Object.prototype.hasOwnProperty.call(remoteObject, 'value') ||
    remoteObject.type !== 'object' ||
    !isRecord(remoteObject.value)
  ) {
    throw new Error('Raw worker native identity evaluation is malformed.');
  }
  const value = remoteObject.value;
  const keys = Object.keys(value).sort();
  if (
    keys.length !== 2 ||
    keys[0] !== 'registrationScope' ||
    keys[1] !== 'workerUrl' ||
    value.workerUrl !== workerUrl ||
    value.registrationScope !== scopeURL
  ) {
    throw new Error('Raw worker native URL/scope identity diverged.');
  }
}

function buildReleaseDetachEvidence(
  options: RunRawWorkerEpochOptions,
  observation: NativeDetachObservation,
  attachmentGeneration: number | null
): RawReleaseDetachEventEvidence {
  const preimage = cloneEvidence({
    schemaVersion: 1 as const,
    processGeneration: options.processGeneration,
    leaseEpoch: options.leaseEpoch,
    transportId: options.transportId,
    attachmentGeneration,
    targetId: observation.targetId,
    sessionId: observation.sessionId,
    method: 'Target.detachedFromTarget' as const,
  });
  return cloneEvidence({
    ...preimage,
    preimage,
    eventSha256: sha256Canonical(preimage),
  });
}

function assertBatchReceiptIdentity(
  receipt: RawCdpCommandReceipt,
  options: RunRawWorkerEpochOptions,
  method: string,
  sessionId: string,
  stage: string
): void {
  assertPositiveSafeInteger(`${stage} command ID`, receipt.id);
  assertReceiptLeaseIdentity(receipt, options, stage);
  if (receipt.method !== method || receipt.sessionId !== sessionId) {
    throw new Error(`${stage} response identity diverged.`);
  }
}

function assertReceiptLeaseIdentity(
  receipt: RawCdpCommandReceipt,
  options: RunRawWorkerEpochOptions,
  stage: string
): void {
  if (
    receipt.schemaVersion !== 1 ||
    receipt.processGeneration !== options.processGeneration ||
    receipt.leaseEpoch !== options.leaseEpoch ||
    receipt.transportId !== options.transportId
  ) {
    throw new Error(`${stage} response crossed its raw transport identity.`);
  }
}

function assertCloseReceiptLeaseIdentity(
  close: RawCdpCloseReceipt,
  options: RunRawWorkerEpochOptions,
  stage: string
): void {
  if (
    close.schemaVersion !== 1 ||
    close.processGeneration !== options.processGeneration ||
    close.leaseEpoch !== options.leaseEpoch ||
    close.transportId !== options.transportId ||
    !Number.isSafeInteger(close.code) ||
    close.code < 0 ||
    close.code > 4_999 ||
    typeof close.reason !== 'string' ||
    new TextEncoder().encode(close.reason).byteLength > 123 ||
    /[\0\r\n]/u.test(close.reason)
  ) {
    throw new Error(`${stage} crossed its raw transport identity or closed schema.`);
  }
}

function assertExactRecordKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  stage: string
): void {
  const allowedKeys = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unknown !== undefined) {
    throw new Error(`${stage} is malformed: contains the unknown field ${unknown}.`);
  }
}

function isJsonValue(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'object' || ancestors.has(value)) {
    return false;
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.every((entry) => isJsonValue(entry, ancestors));
    }
    return Object.values(value as Readonly<Record<string, unknown>>).every((entry) =>
      isJsonValue(entry, ancestors)
    );
  } finally {
    ancestors.delete(value);
  }
}

const REMOTE_OBJECT_TYPES = new Set([
  'object',
  'function',
  'undefined',
  'string',
  'number',
  'boolean',
  'symbol',
  'bigint',
]);

const REMOTE_OBJECT_SUBTYPES = new Set([
  'array',
  'null',
  'node',
  'regexp',
  'date',
  'map',
  'set',
  'weakmap',
  'weakset',
  'iterator',
  'generator',
  'error',
  'proxy',
  'promise',
  'typedarray',
  'arraybuffer',
  'dataview',
  'webassemblymemory',
  'wasmvalue',
  'trustedtype',
]);

function assertRemoteObject(value: unknown, stage: string, depth = 0): void {
  if (!isRecord(value) || depth > 8) {
    throw new Error(`${stage} returned a malformed Runtime.evaluate RemoteObject.`);
  }
  assertExactRecordKeys(
    value,
    [
      'type',
      'subtype',
      'className',
      'value',
      'unserializableValue',
      'description',
      'deepSerializedValue',
      'objectId',
      'preview',
      'customPreview',
    ],
    `${stage} Runtime.evaluate RemoteObject`
  );
  if (typeof value.type !== 'string' || !REMOTE_OBJECT_TYPES.has(value.type)) {
    throw new Error(`${stage} returned a malformed Runtime.evaluate RemoteObject.`);
  }
  if (
    Object.prototype.hasOwnProperty.call(value, 'subtype') &&
    (typeof value.subtype !== 'string' || !REMOTE_OBJECT_SUBTYPES.has(value.subtype))
  ) {
    throw new Error(`${stage} returned a malformed Runtime.evaluate RemoteObject.`);
  }
  for (const key of ['className', 'unserializableValue', 'description', 'objectId'] as const) {
    if (Object.prototype.hasOwnProperty.call(value, key) && typeof value[key] !== 'string') {
      throw new Error(`${stage} returned a malformed Runtime.evaluate RemoteObject.`);
    }
  }
  const hasValue = Object.prototype.hasOwnProperty.call(value, 'value');
  const hasUnserializable = Object.prototype.hasOwnProperty.call(value, 'unserializableValue');
  if (hasValue && hasUnserializable) {
    throw new Error(`${stage} returned a malformed Runtime.evaluate RemoteObject.`);
  }
  if (
    (value.type === 'boolean' && (!hasValue || typeof value.value !== 'boolean')) ||
    (value.type === 'string' && (!hasValue || typeof value.value !== 'string')) ||
    (value.type === 'number' &&
      !(
        (hasValue && typeof value.value === 'number' && Number.isFinite(value.value)) ||
        (hasUnserializable && typeof value.unserializableValue === 'string')
      )) ||
    (value.type === 'bigint' &&
      !(hasUnserializable && typeof value.unserializableValue === 'string')) ||
    (value.type === 'undefined' && (hasValue || hasUnserializable)) ||
    (hasValue && !isJsonValue(value.value))
  ) {
    throw new Error(`${stage} returned a malformed Runtime.evaluate RemoteObject.`);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'deepSerializedValue')) {
    const serialized = value.deepSerializedValue;
    if (!isRecord(serialized)) {
      throw new Error(`${stage} returned a malformed Runtime.evaluate RemoteObject.`);
    }
    assertExactRecordKeys(
      serialized,
      ['type', 'value', 'objectId', 'weakLocalObjectReference'],
      `${stage} deep serialized value`
    );
    if (
      typeof serialized.type !== 'string' ||
      (Object.prototype.hasOwnProperty.call(serialized, 'value') &&
        !isJsonValue(serialized.value)) ||
      (Object.prototype.hasOwnProperty.call(serialized, 'objectId') &&
        typeof serialized.objectId !== 'string') ||
      (Object.prototype.hasOwnProperty.call(serialized, 'weakLocalObjectReference') &&
        (!Number.isSafeInteger(serialized.weakLocalObjectReference) ||
          (serialized.weakLocalObjectReference as number) < 0))
    ) {
      throw new Error(`${stage} returned a malformed Runtime.evaluate RemoteObject.`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, 'preview')) {
    assertObjectPreview(value.preview, stage, depth + 1);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'customPreview')) {
    const preview = value.customPreview;
    if (!isRecord(preview)) {
      throw new Error(`${stage} returned a malformed Runtime.evaluate RemoteObject.`);
    }
    assertExactRecordKeys(preview, ['header', 'bodyGetterId'], `${stage} custom preview`);
    if (
      typeof preview.header !== 'string' ||
      (Object.prototype.hasOwnProperty.call(preview, 'bodyGetterId') &&
        typeof preview.bodyGetterId !== 'string')
    ) {
      throw new Error(`${stage} returned a malformed Runtime.evaluate RemoteObject.`);
    }
  }
}

function assertObjectPreview(value: unknown, stage: string, depth: number): void {
  if (!isRecord(value) || depth > 8) {
    throw new Error(`${stage} returned a malformed Runtime.evaluate RemoteObject.`);
  }
  assertExactRecordKeys(
    value,
    ['type', 'subtype', 'description', 'overflow', 'properties', 'entries'],
    `${stage} object preview`
  );
  if (
    typeof value.type !== 'string' ||
    !REMOTE_OBJECT_TYPES.has(value.type) ||
    (Object.prototype.hasOwnProperty.call(value, 'subtype') &&
      (typeof value.subtype !== 'string' || !REMOTE_OBJECT_SUBTYPES.has(value.subtype))) ||
    typeof value.description !== 'string' ||
    typeof value.overflow !== 'boolean' ||
    !Array.isArray(value.properties)
  ) {
    throw new Error(`${stage} returned a malformed Runtime.evaluate RemoteObject.`);
  }
  for (const property of value.properties) {
    if (!isRecord(property)) {
      throw new Error(`${stage} returned a malformed Runtime.evaluate RemoteObject.`);
    }
    assertExactRecordKeys(
      property,
      ['name', 'type', 'value', 'valuePreview', 'subtype'],
      `${stage} property preview`
    );
    if (
      typeof property.name !== 'string' ||
      typeof property.type !== 'string' ||
      !REMOTE_OBJECT_TYPES.has(property.type) ||
      (Object.prototype.hasOwnProperty.call(property, 'value') &&
        typeof property.value !== 'string') ||
      (Object.prototype.hasOwnProperty.call(property, 'subtype') &&
        (typeof property.subtype !== 'string' || !REMOTE_OBJECT_SUBTYPES.has(property.subtype)))
    ) {
      throw new Error(`${stage} returned a malformed Runtime.evaluate RemoteObject.`);
    }
    if (Object.prototype.hasOwnProperty.call(property, 'valuePreview')) {
      assertObjectPreview(property.valuePreview, stage, depth + 1);
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, 'entries')) {
    if (!Array.isArray(value.entries)) {
      throw new Error(`${stage} returned a malformed Runtime.evaluate RemoteObject.`);
    }
    for (const entry of value.entries) {
      if (!isRecord(entry)) {
        throw new Error(`${stage} returned a malformed Runtime.evaluate RemoteObject.`);
      }
      assertExactRecordKeys(entry, ['key', 'value'], `${stage} entry preview`);
      if (!Object.prototype.hasOwnProperty.call(entry, 'value')) {
        throw new Error(`${stage} returned a malformed Runtime.evaluate RemoteObject.`);
      }
      if (Object.prototype.hasOwnProperty.call(entry, 'key')) {
        assertObjectPreview(entry.key, stage, depth + 1);
      }
      assertObjectPreview(entry.value, stage, depth + 1);
    }
  }
}

function assertStackTrace(value: unknown, stage: string, depth = 0): void {
  if (!isRecord(value) || depth > 16) {
    throw new Error(`${stage} returned malformed exceptionDetails.`);
  }
  assertExactRecordKeys(value, ['description', 'callFrames', 'parent', 'parentId'], stage);
  if (
    !Array.isArray(value.callFrames) ||
    (Object.prototype.hasOwnProperty.call(value, 'description') &&
      typeof value.description !== 'string')
  ) {
    throw new Error(`${stage} returned malformed exceptionDetails.`);
  }
  for (const frame of value.callFrames) {
    if (!isRecord(frame)) {
      throw new Error(`${stage} returned malformed exceptionDetails.`);
    }
    assertExactRecordKeys(
      frame,
      ['functionName', 'scriptId', 'url', 'lineNumber', 'columnNumber'],
      stage
    );
    if (
      typeof frame.functionName !== 'string' ||
      typeof frame.scriptId !== 'string' ||
      typeof frame.url !== 'string' ||
      !Number.isSafeInteger(frame.lineNumber) ||
      (frame.lineNumber as number) < 0 ||
      !Number.isSafeInteger(frame.columnNumber) ||
      (frame.columnNumber as number) < 0
    ) {
      throw new Error(`${stage} returned malformed exceptionDetails.`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, 'parent')) {
    assertStackTrace(value.parent, stage, depth + 1);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'parentId')) {
    const parentId = value.parentId;
    if (!isRecord(parentId)) {
      throw new Error(`${stage} returned malformed exceptionDetails.`);
    }
    assertExactRecordKeys(parentId, ['id', 'debuggerId'], stage);
    if (
      typeof parentId.id !== 'string' ||
      (Object.prototype.hasOwnProperty.call(parentId, 'debuggerId') &&
        typeof parentId.debuggerId !== 'string')
    ) {
      throw new Error(`${stage} returned malformed exceptionDetails.`);
    }
  }
}

function assertExceptionDetails(value: unknown, stage: string): void {
  if (!isRecord(value)) {
    throw new Error(`${stage} returned malformed exceptionDetails.`);
  }
  assertExactRecordKeys(
    value,
    [
      'exceptionId',
      'text',
      'lineNumber',
      'columnNumber',
      'scriptId',
      'url',
      'stackTrace',
      'exception',
      'executionContextId',
      'exceptionMetaData',
    ],
    `${stage} exceptionDetails`
  );
  if (
    !Number.isSafeInteger(value.exceptionId) ||
    (value.exceptionId as number) < 0 ||
    typeof value.text !== 'string' ||
    !Number.isSafeInteger(value.lineNumber) ||
    (value.lineNumber as number) < 0 ||
    !Number.isSafeInteger(value.columnNumber) ||
    (value.columnNumber as number) < 0 ||
    (Object.prototype.hasOwnProperty.call(value, 'scriptId') &&
      typeof value.scriptId !== 'string') ||
    (Object.prototype.hasOwnProperty.call(value, 'url') && typeof value.url !== 'string') ||
    (Object.prototype.hasOwnProperty.call(value, 'executionContextId') &&
      (!Number.isSafeInteger(value.executionContextId) ||
        (value.executionContextId as number) < 0)) ||
    (Object.prototype.hasOwnProperty.call(value, 'exceptionMetaData') &&
      !isRecord(value.exceptionMetaData))
  ) {
    throw new Error(`${stage} returned malformed exceptionDetails.`);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'stackTrace')) {
    assertStackTrace(value.stackTrace, stage);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'exception')) {
    assertRemoteObject(value.exception, stage);
  }
}

function assertRuntimeEvaluationResult(receipt: RawCdpCommandReceipt, stage: string): void {
  const result = receipt.result as RuntimeEvaluationResult;
  const keys = Object.keys(result);
  if (
    !isRecord(result.result) ||
    keys.some((key) => key !== 'result' && key !== 'exceptionDetails') ||
    keys.length < 1
  ) {
    throw new Error(`${stage} returned a malformed Runtime.evaluate result.`);
  }
  assertRemoteObject(result.result, stage);
  if (Object.prototype.hasOwnProperty.call(result, 'exceptionDetails')) {
    assertExceptionDetails(result.exceptionDetails, stage);
  }
}

function assertEmptyCommandResult(receipt: RawCdpCommandReceipt, stage: string): void {
  if (Object.keys(receipt.result).length !== 0) {
    throw new Error(`${stage} returned a malformed empty result.`);
  }
}

async function releaseRawAuthority(
  options: RunRawWorkerEpochOptions,
  observations: RawWorkerObservations,
  unsubscribe: () => void,
  sentinelTargetId: string,
  controlSessionId: string,
  model: RawWorkerModelAdapter,
  commandLedger: RawReleaseCommandLedgerEntry[]
): Promise<RawReleaseReceipt> {
  const deadline = new Deadline(options.releaseTimeoutMs);
  const failedRelease = model.failureObserved();
  const cleanup = async (command: RawCdpCommand, stage: string) => {
    try {
      const receipt = await deadline.wait(options.client.sendCleanupCommand(command), stage);
      assertReceiptLeaseIdentity(receipt, options, stage);
      appendReleaseSettlement(commandLedger, 'cleanup', command, {
        status: 'fulfilled',
        receipt,
      });
      if (!failedRelease) {
        observations.assertHealthy();
      }
      return receipt;
    } catch (error: unknown) {
      appendReleaseSettlement(commandLedger, 'cleanup', command, { status: 'rejected', error });
      throw error;
    }
  };

  const resumeReceipts: RawCdpCommandReceipt[] = [];
  const inventory = [...observations.attachments.values()].sort(
    (left, right) => left.attachmentGeneration - right.attachmentGeneration
  );
  for (const attachment of inventory) {
    if (!attachment.waitingForDebugger || attachment.detached) {
      continue;
    }
    const receipt = await cleanup(
      { method: 'Runtime.runIfWaitingForDebugger', params: {}, sessionId: attachment.sessionId },
      `release resume ${attachment.sessionId}`
    );
    assertEmptyCommandResult(receipt, `Release resume ${attachment.sessionId}`);
    resumeReceipts.push(receipt);
    model.send({
      type: 'RELEASE_RESUME_RESOLVED',
      commandId: String(receipt.id),
      sessionId: attachment.sessionId,
    });
    attachment.waitingForDebugger = false;
  }

  model.assertState('release_disarming', 'raw release entry');
  const disarmReceipt = await cleanup(
    {
      method: 'Target.setAutoAttach',
      params: { autoAttach: false, waitForDebuggerOnStart: false, flatten: true },
    },
    'auto-attach disarm'
  );
  assertEmptyCommandResult(disarmReceipt, 'Auto-attach disarm');
  model.send({ type: 'AUTO_ATTACH_DISARMED', commandId: String(disarmReceipt.id) });

  const firstFenceReceipt = await cleanup(
    { method: 'Target.getTargets', params: { filter: SERVICE_WORKER_FILTER } },
    'release attachment fence'
  );
  const firstFence = parseTargetRecords(firstFenceReceipt.result);
  const stillAttached = firstFence.filter((target) => target.attached);
  const liveManual = inventory.filter(
    (attachment) => attachment.origin === 'manual' && !attachment.detached
  );
  if (
    stillAttached.length !== liveManual.length ||
    stillAttached.some(
      (target) =>
        !liveManual.some(
          (attachment) => attachment.targetId === target.targetId && attachment.url === target.url
        )
    )
  ) {
    throw new Error('Raw release fence retained an unauthorized attached worker.');
  }
  model.send({
    type: 'RELEASE_ATTACH_FENCE_RESOLVED',
    commandId: 'release-attachment-fence',
    targets: firstFence,
  });

  for (const attachment of inventory) {
    if (attachment.origin === 'auto' && !attachment.detached) {
      await observations.waitFor(
        () => attachment.detached,
        deadline,
        `auto attachment detachment ${attachment.sessionId}`
      );
    }
  }
  const manualDetachReceipts: RawCdpCommandReceipt[] = [];
  for (const attachment of inventory) {
    if (attachment.origin !== 'manual' || attachment.detached) {
      continue;
    }
    const manualDetachReceipt = await cleanup(
      { method: 'Target.detachFromTarget', params: { sessionId: attachment.sessionId } },
      `manual worker detach response ${attachment.sessionId}`
    );
    assertEmptyCommandResult(manualDetachReceipt, `Manual worker detach ${attachment.sessionId}`);
    manualDetachReceipts.push(manualDetachReceipt);
    model.send({
      type: 'RELEASE_MANUAL_DETACH_RESOLVED',
      commandId: String(manualDetachReceipt.id),
      targetId: attachment.targetId,
      sessionId: attachment.sessionId,
    });
    await observations.waitFor(
      () => attachment.detached,
      deadline,
      `manual worker detach event ${attachment.sessionId}`
    );
  }

  const zeroFenceReceipt = await cleanup(
    { method: 'Target.getTargets', params: { filter: SERVICE_WORKER_FILTER } },
    'zero-attached fence'
  );
  const zeroFence = parseTargetRecords(zeroFenceReceipt.result);
  if (zeroFence.some((target) => target.type === 'service_worker' && target.attached)) {
    throw new Error('Raw release left a service-worker target attached.');
  }
  model.send({
    type: 'RELEASE_ZERO_ATTACHED_FENCE_RESOLVED',
    commandId: 'release-zero-attached-fence',
    targets: zeroFence,
  });

  const serviceWorkerDisableReceipt = await cleanup(
    { method: 'ServiceWorker.disable', params: {}, sessionId: controlSessionId },
    'ServiceWorker disable'
  );
  assertEmptyCommandResult(serviceWorkerDisableReceipt, 'ServiceWorker disable');
  model.send({
    type: 'SERVICE_WORKER_DISABLED',
    commandId: String(serviceWorkerDisableReceipt.id),
    sessionId: controlSessionId,
  });
  const controlDetachReceipt = await cleanup(
    { method: 'Target.detachFromTarget', params: { sessionId: controlSessionId } },
    'control detach response'
  );
  assertEmptyCommandResult(controlDetachReceipt, 'Control detach');
  model.send({
    type: 'CONTROL_DETACH_RESOLVED',
    commandId: String(controlDetachReceipt.id),
    targetId: sentinelTargetId,
    sessionId: controlSessionId,
  });

  const sentinelFenceReceipt = await cleanup(
    { method: 'Target.getTargets', params: { filter: PAGE_FILTER } },
    'sentinel release fence'
  );
  const sentinelFence = parseTargetRecords(sentinelFenceReceipt.result);
  if (
    sentinelFence.length !== 1 ||
    sentinelFence[0]?.targetId !== sentinelTargetId ||
    sentinelFence[0]?.url !== 'about:blank' ||
    sentinelFence[0]?.attached
  ) {
    throw new Error('Raw release did not preserve the sole unattached sentinel.');
  }
  model.send({
    type: 'SENTINEL_FENCE_RESOLVED',
    commandId: 'release-sentinel-fence',
    sentinels: sentinelFence,
  });

  const discoveryDisableReceipt = await cleanup(
    { method: 'Target.setDiscoverTargets', params: { discover: false } },
    'discovery disable'
  );
  assertEmptyCommandResult(discoveryDisableReceipt, 'Discovery disable');
  model.send({
    type: 'DISCOVERY_DISABLED',
    commandId: String(discoveryDisableReceipt.id),
  });
  if (!failedRelease) {
    observations.assertHealthy();
  }
  unsubscribe();
  options.client.close();
  const close = await deadline.wait(options.client.closed, 'raw socket close');
  assertCloseReceiptLeaseIdentity(close, options, 'Raw socket close receipt');
  model.send({ type: 'RAW_SOCKET_CLOSED', transportId: options.transportId });
  model.assertState(model.failureObserved() ? 'failed' : 'released', 'raw socket close');
  const attachmentInventory = inventory.map((attachment) =>
    cloneEvidence({
      attachmentGeneration: attachment.attachmentGeneration,
      origin: attachment.origin,
      sessionId: attachment.sessionId,
      targetId: attachment.targetId,
      url: attachment.url,
      waitingForDebugger: attachment.waitingForDebugger,
      detached: attachment.detached,
    })
  );
  const workerDetachEvents = inventory.map((attachment) => {
    const observation = observations.detachEvents.get(attachment.sessionId);
    if (
      observation === undefined ||
      observation.targetId !== attachment.targetId ||
      !attachment.detached
    ) {
      throw new Error('Raw release lacks one exact native worker detach event.');
    }
    return buildReleaseDetachEvidence(options, observation, attachment.attachmentGeneration);
  });
  const controlDetachObservation = observations.detachEvents.get(controlSessionId);
  if (
    controlDetachObservation === undefined ||
    controlDetachObservation.targetId !== sentinelTargetId
  ) {
    throw new Error('Raw release lacks the exact native control detach event.');
  }
  const controlDetachEvent = buildReleaseDetachEvidence(options, controlDetachObservation, null);
  return cloneEvidence({
    schemaVersion: 1,
    processGeneration: options.processGeneration,
    leaseEpoch: options.leaseEpoch,
    transportId: options.transportId,
    released: true,
    deadline: {
      timeoutMs: options.releaseTimeoutMs,
      completedWithinDeadline: true,
    },
    commandLedger,
    attachmentInventory,
    proofs: {
      resumeReceipts,
      autoAttachDisarm: disarmReceipt,
      attachFence: { receipt: firstFenceReceipt, targets: firstFence },
      manualDetachReceipts,
      workerDetachEvents,
      zeroAttachedFence: { receipt: zeroFenceReceipt, targets: zeroFence },
      serviceWorkerDisable: serviceWorkerDisableReceipt,
      controlDetach: controlDetachReceipt,
      controlDetachEvent,
      sentinelFence: { receipt: sentinelFenceReceipt, targets: sentinelFence },
      discoveryDisable: discoveryDisableReceipt,
      close,
    },
    close,
  });
}

interface BuiltRestartReceipt {
  readonly receipt: RestartReceiptV1;
  readonly authorityPreimage: Readonly<Record<string, unknown>>;
  readonly bootstrapPreimage: Readonly<Record<string, unknown>>;
  readonly receiptPreimage: Readonly<Record<string, unknown>>;
}

function buildCommandLedgerEntry(
  ordinal: number,
  receipt: RawCdpCommandReceipt,
  method: 'Runtime.runIfWaitingForDebugger' | 'Runtime.evaluate',
  params: Readonly<Record<string, unknown>>,
  paramsSha256: string,
  resultSha256: string
): RawBootstrapCommandLedgerEntry {
  if (receipt.sessionId === undefined) {
    throw new Error('Raw bootstrap command ledger requires an exact session identity.');
  }
  return cloneEvidence({
    ordinal,
    commandId: receipt.id,
    method,
    sessionId: receipt.sessionId,
    params,
    paramsSha256,
    result: receipt.result,
    resultSha256,
  });
}

function buildRestartReceipt(
  options: RunRawWorkerEpochOptions,
  authority: Omit<RawWorkerAuthority, 'uniqueContextId'> & { readonly uniqueContextId: string },
  startCommandId: number,
  crashEventSha256: string,
  contextGeneration: number,
  revokedUniqueContextIdsSha256: string,
  postCrashDestroyedUniqueContextIdsSha256: string,
  reloadEventSha256: string,
  executionContextEventSha256: string,
  identityCommandId: number,
  identityResultSha256: string,
  testCommandId: number | null,
  testResultSha256: string | null,
  resumeCommandId: number,
  resumeResultSha256: string,
  bootstrapCommandBatchSha256: string
): BuiltRestartReceipt {
  const authorityPreimage = {
    extensionId: authority.extensionId,
    registrationId: authority.registrationId,
    versionId: authority.versionId,
    scopeURL: authority.scopeURL,
    scriptURL: authority.scriptURL,
  };
  const authoritySha256 = sha256Canonical(authorityPreimage);
  const bootstrapPreimage = {
    processGeneration: options.processGeneration,
    rawLeaseEpoch: options.leaseEpoch,
    restartGeneration: options.restartGeneration + 1,
    targetId: authority.targetId,
    sessionId: authority.sessionId,
    attachmentGeneration: authority.attachmentGeneration,
    attachmentOrigin: authority.attachmentOrigin,
    crashEventSha256,
    contextGeneration,
    revokedUniqueContextIdsSha256,
    postCrashDestroyedUniqueContextIdsSha256,
    reloadEventSha256,
    uniqueContextId: authority.uniqueContextId,
    startCommandId,
    executionContextEventSha256,
    identityCommandId,
    identityResultSha256,
    testCommandId,
    testResultSha256,
    resumeCommandId,
    resumeResultSha256,
    bootstrapCommandBatchSha256,
  };
  const bootstrapSha256 = sha256Canonical(bootstrapPreimage);
  const receiptPreimage = {
    schemaVersion: 1 as const,
    processGeneration: options.processGeneration,
    rawLeaseEpoch: options.leaseEpoch,
    playwrightEpoch: options.playwrightEpoch,
    restartGeneration: options.restartGeneration + 1,
    workerUrl: authority.scriptURL,
    authoritySha256,
    bootstrapSha256,
  };
  return freezeEvidence({
    authorityPreimage,
    bootstrapPreimage,
    receiptPreimage,
    receipt: parseRestartReceiptV1({
      ...receiptPreimage,
      receiptSha256: sha256Canonical(receiptPreimage),
    }),
  });
}

async function closeFailedAcquisition(
  options: RunRawWorkerEpochOptions,
  observations: RawWorkerObservations,
  unsubscribe: () => void,
  commandLedger: RawReleaseCommandLedgerEntry[],
  state: {
    readonly autoAttachArmed: boolean;
    readonly discoveryEnabled: boolean;
    readonly controlSessionId?: string;
  }
): Promise<void> {
  const deadline = new Deadline(options.releaseTimeoutMs);
  const failures: unknown[] = [];
  const cleanup = async (command: RawCdpCommand, stage: string): Promise<void> => {
    try {
      const receipt = await deadline.wait(options.client.sendCleanupCommand(command), stage);
      assertReceiptLeaseIdentity(receipt, options, stage);
      appendReleaseSettlement(commandLedger, 'cleanup', command, {
        status: 'fulfilled',
        receipt,
      });
    } catch (error: unknown) {
      appendReleaseSettlement(commandLedger, 'cleanup', command, { status: 'rejected', error });
      failures.push(error);
    }
  };

  for (const attachment of observations.attachments.values()) {
    if (attachment.waitingForDebugger && !attachment.detached) {
      await cleanup(
        { method: 'Runtime.runIfWaitingForDebugger', params: {}, sessionId: attachment.sessionId },
        `failed acquisition resume ${attachment.sessionId}`
      );
      attachment.waitingForDebugger = false;
    }
  }
  if (state.autoAttachArmed) {
    await cleanup(
      {
        method: 'Target.setAutoAttach',
        params: { autoAttach: false, waitForDebuggerOnStart: false, flatten: true },
      },
      'failed acquisition auto-attach disarm'
    );
  }
  for (const attachment of observations.attachments.values()) {
    if (!attachment.detached) {
      await cleanup(
        { method: 'Target.detachFromTarget', params: { sessionId: attachment.sessionId } },
        `failed acquisition worker detach ${attachment.sessionId}`
      );
    }
  }
  if (state.controlSessionId !== undefined) {
    await cleanup(
      { method: 'ServiceWorker.disable', params: {}, sessionId: state.controlSessionId },
      'failed acquisition ServiceWorker disable'
    );
    await cleanup(
      { method: 'Target.detachFromTarget', params: { sessionId: state.controlSessionId } },
      'failed acquisition control detach'
    );
  }
  if (state.discoveryEnabled) {
    await cleanup(
      { method: 'Target.setDiscoverTargets', params: { discover: false } },
      'failed acquisition discovery disable'
    );
  }

  unsubscribe();
  options.client.close();
  try {
    const close = await deadline.wait(options.client.closed, 'failed acquisition socket close');
    assertCloseReceiptLeaseIdentity(close, options, 'Failed acquisition close receipt');
  } catch (error: unknown) {
    failures.push(error);
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Raw failed acquisition cleanup was incomplete.');
  }
}

export async function runRawWorkerEpoch(
  options: RunRawWorkerEpochOptions
): Promise<RawWorkerEpochResult> {
  assertPositiveSafeInteger('Raw process generation', options.processGeneration);
  assertPositiveSafeInteger('Raw lease epoch', options.leaseEpoch);
  assertPositiveSafeInteger('Raw Playwright epoch', options.playwrightEpoch);
  assertNonNegativeSafeInteger('Raw restart generation', options.restartGeneration);
  if (
    !options.expectedWorkerPath.startsWith('/') ||
    options.expectedWorkerPath.includes('?') ||
    options.expectedWorkerPath.includes('#') ||
    /[\0\r\n]/u.test(options.expectedWorkerPath)
  ) {
    throw new Error('Raw expected worker path is invalid.');
  }

  const deadline = new Deadline(options.operationTimeoutMs);
  const observations = new RawWorkerObservations();
  const model = new RawWorkerModelAdapter(options, observations);
  const rawUnsubscribe = options.client.onEvent((event) => {
    const observationFailure = observations.consume(event);
    if (observationFailure !== undefined) {
      return;
    }
    try {
      model.consume(event);
    } catch (error) {
      observations.recordFailure(error);
    }
  });
  let subscribed = true;
  const unsubscribe = () => {
    if (!subscribed) {
      return;
    }
    subscribed = false;
    rawUnsubscribe();
  };
  const releaseCommandLedger: RawReleaseCommandLedgerEntry[] = [];
  const commandLedger: RawBootstrapCommandLedgerEntry[] = [];
  const batchSettlements: RawBootstrapBatchSettlement[] = [];
  let sentinelTargetId: string | undefined;
  let controlSessionId: string | undefined;
  let selected: AttachmentRecord | undefined;
  let discoveryEnabled = false;
  let autoAttachArmed = false;
  let releaseAttempted = false;
  let bootstrapRetentionAttempted = false;
  let bootstrapRetentionAcknowledged = false;
  const send = async (command: RawCdpCommand, stage: string) => {
    try {
      const receipt = await deadline.wait(options.client.sendCommand(command), stage);
      assertReceiptLeaseIdentity(receipt, options, stage);
      appendReleaseSettlement(releaseCommandLedger, 'operational', command, {
        status: 'fulfilled',
        receipt,
      });
      observations.assertHealthy();
      return receipt;
    } catch (error: unknown) {
      appendReleaseSettlement(releaseCommandLedger, 'operational', command, {
        status: 'rejected',
        error,
      });
      throw error;
    }
  };

  try {
    const sentinelTargets = parseTargetRecords(
      (
        await send(
          { method: 'Target.getTargets', params: { filter: PAGE_FILTER } },
          'sentinel fence'
        )
      ).result
    );
    if (
      sentinelTargets.length !== 1 ||
      sentinelTargets[0]?.type !== 'page' ||
      sentinelTargets[0]?.url !== 'about:blank' ||
      sentinelTargets[0]?.attached
    ) {
      throw new Error('Raw acquisition requires one sole unattached about:blank sentinel.');
    }
    sentinelTargetId = sentinelTargets[0].targetId;
    model.send({
      type: 'INITIAL_SENTINEL_FENCE_RESOLVED',
      commandId: 'initial-sentinel-fence',
      sentinels: sentinelTargets,
    });
    model.assertState('prearm_attach_fencing', 'initial sentinel fence');

    const prearmTargets = parseTargetRecords(
      (
        await send(
          { method: 'Target.getTargets', params: { filter: SERVICE_WORKER_FILTER } },
          'pre-arm worker fence'
        )
      ).result
    );
    if (prearmTargets.some((target) => target.type === 'service_worker' && target.attached)) {
      throw new Error('Raw acquisition found a pre-attached service worker.');
    }
    model.send({
      type: 'PREARM_ATTACH_FENCE_RESOLVED',
      commandId: 'prearm-attach-fence',
      attachedWorkers: prearmTargets.filter((target) => target.attached),
    });
    model.assertState('discovery_enabling', 'pre-arm attachment fence');

    const discoveryReceipt = await send(
      {
        method: 'Target.setDiscoverTargets',
        params: { discover: true, filter: SERVICE_WORKER_FILTER },
      },
      'target discovery enable'
    );
    discoveryEnabled = true;
    model.send({ type: 'DISCOVERY_ACKED', commandId: String(discoveryReceipt.id) });
    model.assertState('auto_attach_arming', 'discovery enable');
    const autoAttachReceipt = await send(
      {
        method: 'Target.setAutoAttach',
        params: {
          autoAttach: true,
          waitForDebuggerOnStart: true,
          flatten: true,
          filter: SERVICE_WORKER_FILTER,
        },
      },
      'root auto-attach arm'
    );
    autoAttachArmed = true;
    model.send({ type: 'AUTO_ATTACH_ACKED', commandId: String(autoAttachReceipt.id) });
    model.assertState('control_attaching', 'root auto-attach arm');

    const controlAttach = await send(
      { method: 'Target.attachToTarget', params: { targetId: sentinelTargetId, flatten: true } },
      'sentinel control attach'
    );
    controlSessionId = parseSessionId(controlAttach.result, 'Sentinel control attach');
    observations.rememberControlAttachment(controlSessionId, sentinelTargetId);
    model.send({
      type: 'CONTROL_ATTACH_RESOLVED',
      commandId: String(controlAttach.id),
      targetId: sentinelTargetId,
      sessionId: controlSessionId,
    });
    model.assertState('service_worker_enabling', 'sentinel control attach');
    const serviceWorkerEnableReceipt = await send(
      { method: 'ServiceWorker.enable', params: {}, sessionId: controlSessionId },
      'ServiceWorker enable'
    );
    model.send({
      type: 'SERVICE_WORKER_ENABLED',
      commandId: String(serviceWorkerEnableReceipt.id),
      sessionId: controlSessionId,
    });
    model.assertState('converging', 'ServiceWorker enable');

    const observedSessionIds = new Set<string>();
    const observeRelatedAttachment = async (attachment: AttachmentRecord): Promise<void> => {
      if (observedSessionIds.has(attachment.sessionId)) {
        return;
      }
      const inspectorReceipt = await send(
        { method: 'Inspector.enable', params: {}, sessionId: attachment.sessionId },
        'convergence Inspector observer enable'
      );
      model.send({
        type: 'INSPECTOR_ENABLED',
        commandId: String(inspectorReceipt.id),
        sessionId: attachment.sessionId,
      });
      const runtimeReceipt = await send(
        { method: 'Runtime.enable', params: {}, sessionId: attachment.sessionId },
        'convergence Runtime observer enable'
      );
      model.send({
        type: 'RUNTIME_ENABLED',
        commandId: String(runtimeReceipt.id),
        sessionId: attachment.sessionId,
      });
      observedSessionIds.add(attachment.sessionId);
      if (attachment.waitingForDebugger) {
        const resumeReceipt = await send(
          {
            method: 'Runtime.runIfWaitingForDebugger',
            params: {},
            sessionId: attachment.sessionId,
          },
          'convergence paused worker resume'
        );
        model.send(
          model.matches('converging')
            ? {
                type: 'CONVERGENCE_RESUME_RESOLVED',
                commandId: String(resumeReceipt.id),
                sessionId: attachment.sessionId,
              }
            : {
                type: 'WARMUP_RESUME_RESOLVED',
                commandId: String(resumeReceipt.id),
                sessionId: attachment.sessionId,
              }
        );
        attachment.waitingForDebugger = false;
      }
    };

    while (findAuthorityCandidate(observations, options.expectedWorkerPath) === undefined) {
      const related = [...observations.attachments.values()].filter(
        (attachment) =>
          !attachment.detached &&
          workerPathMatches(attachment.url, options.expectedWorkerPath) &&
          !observedSessionIds.has(attachment.sessionId)
      );
      for (const attachment of related) {
        await observeRelatedAttachment(attachment);
      }
      if (findAuthorityCandidate(observations, options.expectedWorkerPath) !== undefined) {
        break;
      }
      await observations.waitFor(
        () =>
          findAuthorityCandidate(observations, options.expectedWorkerPath) !== undefined ||
          [...observations.attachments.values()].some(
            (attachment) =>
              !attachment.detached &&
              workerPathMatches(attachment.url, options.expectedWorkerPath) &&
              !observedSessionIds.has(attachment.sessionId)
          ),
        deadline,
        'installation convergence metadata'
      );
    }
    let candidate = findAuthorityCandidate(observations, options.expectedWorkerPath)!;
    const convergenceTargets = parseTargetRecords(
      (
        await send(
          { method: 'Target.getTargets', params: { filter: SERVICE_WORKER_FILTER } },
          'installation convergence fence'
        )
      ).result
    );
    model.send({
      type: 'CONVERGENCE_FENCE_RESOLVED',
      commandId: 'installation-convergence-fence',
      targets: convergenceTargets,
    });
    candidate = findAuthorityCandidate(observations, options.expectedWorkerPath)!;
    const workerTarget = exactWorkerTarget(convergenceTargets, candidate.version.scriptURL);
    const targetId = candidate.version.targetId ?? workerTarget?.targetId;
    if (
      targetId === undefined ||
      (workerTarget !== undefined && workerTarget.targetId !== targetId)
    ) {
      throw new Error('Raw convergence did not prove one exact packaged worker target.');
    }

    selected = exactWorkerAttachment(observations, targetId, candidate.version.scriptURL);
    const runningStatus = candidate.version.runningStatus;
    if (runningStatus === 'stopped') {
      model.assertState('warmup_starting', 'stopped worker warm-up decision');
      const warmStartReceipt = await send(
        {
          method: 'ServiceWorker.startWorker',
          params: { scopeURL: candidate.registration.scopeURL },
          sessionId: controlSessionId,
        },
        'non-authoritative warm start'
      );
      model.send({
        type: 'WARMUP_START_RESOLVED',
        commandId: String(warmStartReceipt.id),
        scopeURL: candidate.registration.scopeURL,
      });
      await observations.waitFor(
        () => {
          const version = observations.versions.get(candidate.version.versionId);
          return version?.runningStatus === 'starting' || version?.runningStatus === 'running';
        },
        deadline,
        'warm worker metadata'
      );
    } else if (runningStatus !== 'starting' && runningStatus !== 'running') {
      throw new Error(`Raw convergence observed unsupported running status ${runningStatus}.`);
    }

    if (selected === undefined) {
      const warmFence = parseTargetRecords(
        (
          await send(
            { method: 'Target.getTargets', params: { filter: SERVICE_WORKER_FILTER } },
            'warm target fence'
          )
        ).result
      );
      const exactTarget = exactWorkerTarget(warmFence, candidate.version.scriptURL);
      if (exactTarget === undefined || exactTarget.targetId !== targetId) {
        throw new Error('Raw warm target fence lost the packaged worker.');
      }
      model.send({
        type: 'WARMUP_TARGET_FENCE_RESOLVED',
        commandId: 'warm-target-fence',
        targets: warmFence,
      });
      selected = exactWorkerAttachment(observations, targetId, candidate.version.scriptURL);
      if (selected === undefined) {
        const manual = await send(
          { method: 'Target.attachToTarget', params: { targetId, flatten: true } },
          'manual worker attach'
        );
        const manualSessionId = parseSessionId(manual.result, 'Manual worker attach');
        model.send({
          type: 'WARMUP_ATTACH_RESOLVED',
          commandId: String(manual.id),
          sessionId: manualSessionId,
        });
        selected = observations.rememberManualAttachment(
          manualSessionId,
          targetId,
          candidate.version.scriptURL
        );
      }
    }

    await observeRelatedAttachment(selected);
    if (selected.waitingForDebugger) {
      const warmResumeReceipt = await send(
        { method: 'Runtime.runIfWaitingForDebugger', params: {}, sessionId: selected.sessionId },
        'warm worker resume'
      );
      model.send({
        type: 'WARMUP_RESUME_RESOLVED',
        commandId: String(warmResumeReceipt.id),
        sessionId: selected.sessionId,
      });
      selected.waitingForDebugger = false;
    }
    await observations.waitFor(
      () => observations.versions.get(candidate.version.versionId)?.runningStatus === 'running',
      deadline,
      'warm worker running proof'
    );
    model.assertState('warm_authority_ready', 'warm authority convergence');

    let authority: RawWorkerAuthority;
    let restartReceipt: RestartReceiptV1;
    let restartProof: RawWorkerRestartPrivateProof;
    try {
      observations.crashedSessions.delete(selected.sessionId);
      observations.contextsClearedSessions.delete(selected.sessionId);
      const stopReceipt = await send(
        {
          method: 'ServiceWorker.stopWorker',
          params: { versionId: candidate.version.versionId },
          sessionId: controlSessionId,
        },
        'controlled worker stop'
      );
      model.send({ type: 'STOP_RESOLVED', commandId: String(stopReceipt.id) });
      await observations.waitFor(
        () => {
          return (
            observations.versions.get(candidate.version.versionId)?.runningStatus === 'stopped' &&
            observations.crashedSessions.has(selected!.sessionId) &&
            !selected!.detached
          );
        },
        deadline,
        'controlled stop proof'
      );
      if (stopReceipt.method !== 'ServiceWorker.stopWorker') {
        throw new Error('Controlled stop response identity diverged.');
      }
      model.assertState('replacement_starting', 'controlled stop proof');

      observations.reloadedSessions.delete(selected.sessionId);
      selected.waitingForDebugger = true;
      const startReceipt = await send(
        {
          method: 'ServiceWorker.startWorker',
          params: { scopeURL: candidate.registration.scopeURL },
          sessionId: controlSessionId,
        },
        'controlled worker replacement start'
      );
      model.send({ type: 'START_RESOLVED', commandId: String(startReceipt.id) });
      await observations.waitFor(
        () => {
          const version = observations.versions.get(candidate.version.versionId);
          return (
            observations.reloadedSessions.has(selected!.sessionId) &&
            (version?.runningStatus === 'starting' || version?.runningStatus === 'running') &&
            !selected!.detached
          );
        },
        deadline,
        'native worker reload proof'
      );
      const replacementRuntimeReceipt = await send(
        { method: 'Runtime.enable', params: {}, sessionId: selected.sessionId },
        'replacement Runtime observer enable'
      );
      model.send({
        type: 'RUNTIME_ENABLED',
        commandId: String(replacementRuntimeReceipt.id),
        sessionId: selected.sessionId,
      });
      await observations.waitFor(
        () => {
          const contexts = observations.contexts.get(selected!.sessionId) ?? new Set();
          return contexts.size >= 1;
        },
        deadline,
        'replacement execution context'
      );
      const postReloadContexts = [
        ...(observations.contexts.get(selected.sessionId) ?? new Set<string>()),
      ];
      if (postReloadContexts.length !== 1) {
        throw new Error('Raw replacement exposed more than one execution context.');
      }
      const uniqueContextId = postReloadContexts[0]!;
      if (
        observations.revokedContextIds.get(selected.sessionId)?.has(uniqueContextId) ||
        observations.postCrashDestroyedContextIds.get(selected.sessionId)?.has(uniqueContextId) ||
        observations.contextOrigins.get(selected.sessionId)?.get(uniqueContextId) !==
          candidate.version.scriptURL
      ) {
        throw new Error('Raw replacement context did not prove a fresh exact script origin.');
      }

      selected.waitingForDebugger = true;
      model.assertState('resuming', 'replacement bootstrap batch admission');
      const resumeParams = Object.freeze({});
      const identityParams = Object.freeze({
        expression: IDENTITY_EXPRESSION,
        uniqueContextId,
        awaitPromise: true,
        returnByValue: true,
        includeCommandLineAPI: false,
        silent: false,
      });
      const testParams =
        options.probeExpression === undefined
          ? null
          : Object.freeze({
              expression: options.probeExpression,
              uniqueContextId,
              awaitPromise: true,
              returnByValue: true,
              includeCommandLineAPI: false,
              silent: false,
            });
      const batchCommands: RawCdpCommand[] = [
        {
          method: 'Runtime.runIfWaitingForDebugger',
          params: resumeParams,
          sessionId: selected.sessionId,
        },
        { method: 'Runtime.evaluate', params: identityParams, sessionId: selected.sessionId },
        ...(testParams === null
          ? []
          : [{ method: 'Runtime.evaluate', params: testParams, sessionId: selected.sessionId }]),
      ];
      const batchPromises = options.client.sendCommandBatch(batchCommands);
      if (batchPromises.length !== batchCommands.length) {
        throw new Error('Replacement bootstrap command batch receipt count diverged.');
      }
      const resumeParamsSha256 = sha256Canonical(resumeParams);
      const identityParamsSha256 = sha256Canonical(identityParams);
      const testParamsSha256 = testParams === null ? null : sha256Canonical(testParams);
      const settledBatch = await Promise.allSettled(
        batchPromises.map((promise, index) =>
          deadline.wait(
            promise,
            index === 0
              ? 'replacement resume receipt'
              : index === 1
                ? 'replacement identity receipt'
                : 'test receipt'
          )
        )
      );
      for (const [index, settlement] of settledBatch.entries()) {
        const command = batchCommands[index]!;
        const method = command.method as RawBootstrapBatchSettlement['method'];
        if (settlement.status === 'fulfilled') {
          const resultSha256 = sha256Canonical(settlement.value.result);
          batchSettlements.push(
            cloneEvidence({
              ordinal: index,
              method,
              status: 'fulfilled' as const,
              commandId: settlement.value.id,
              resultSha256,
              rejectionSha256: null,
            })
          );
          appendReleaseSettlement(releaseCommandLedger, 'operational', command, {
            status: 'fulfilled',
            receipt: settlement.value,
          });
        } else {
          batchSettlements.push(
            cloneEvidence({
              ordinal: index,
              method,
              status: 'rejected' as const,
              commandId: null,
              resultSha256: null,
              rejectionSha256: sha256Canonical(normalizedErrorEvidence(settlement.reason)),
            })
          );
          appendReleaseSettlement(releaseCommandLedger, 'operational', command, {
            status: 'rejected',
            error: settlement.reason,
          });
        }
      }
      const receiptAt = (index: number): RawCdpCommandReceipt => {
        const settlement = settledBatch[index];
        if (settlement === undefined) {
          throw new Error('Replacement bootstrap command batch receipt count diverged.');
        }
        if (settlement.status === 'rejected') {
          throw settlement.reason;
        }
        return settlement.value;
      };
      observations.assertHealthy();
      const replacementResumeReceipt = receiptAt(0);
      observations.assertHealthy();
      assertBatchReceiptIdentity(
        replacementResumeReceipt,
        options,
        'Runtime.runIfWaitingForDebugger',
        selected.sessionId,
        'Replacement resume'
      );
      assertEmptyCommandResult(replacementResumeReceipt, 'Replacement resume');
      const resumeResultSha256 = sha256Canonical(replacementResumeReceipt.result);
      commandLedger.push(
        buildCommandLedgerEntry(
          0,
          replacementResumeReceipt,
          'Runtime.runIfWaitingForDebugger',
          resumeParams,
          resumeParamsSha256,
          resumeResultSha256
        )
      );
      model.send({
        type: 'RESUME_RESOLVED',
        commandId: replacementResumeReceipt.id,
        restartGeneration: options.restartGeneration + 1,
        method: 'Runtime.runIfWaitingForDebugger',
        paramsSha256: resumeParamsSha256,
        resultSha256: resumeResultSha256,
        sessionId: selected.sessionId,
      });
      selected.waitingForDebugger = false;

      const identityReceipt = receiptAt(1);
      observations.assertHealthy();
      assertBatchReceiptIdentity(
        identityReceipt,
        options,
        'Runtime.evaluate',
        selected.sessionId,
        'Replacement identity probe'
      );
      assertRuntimeEvaluationResult(identityReceipt, 'Replacement identity probe');
      readIdentityEvaluation(
        identityReceipt,
        candidate.version.scriptURL,
        candidate.registration.scopeURL
      );
      if (identityReceipt.id !== replacementResumeReceipt.id + 1) {
        throw new Error('Replacement bootstrap command IDs are not strictly consecutive.');
      }
      const identityResultSha256 = sha256Canonical(identityReceipt.result);
      commandLedger.push(
        buildCommandLedgerEntry(
          1,
          identityReceipt,
          'Runtime.evaluate',
          identityParams,
          identityParamsSha256,
          identityResultSha256
        )
      );
      model.send({
        type: 'IDENTITY_PROBE_RESOLVED',
        commandId: identityReceipt.id,
        restartGeneration: options.restartGeneration + 1,
        method: 'Runtime.evaluate',
        paramsSha256: identityParamsSha256,
        resultSha256: identityResultSha256,
        sessionId: selected.sessionId,
        uniqueContextId,
        workerUrl: candidate.version.scriptURL,
        registrationScope: candidate.registration.scopeURL,
      });

      const probe = testParams === null ? null : receiptAt(2);
      if (probe !== null) {
        observations.assertHealthy();
        assertBatchReceiptIdentity(
          probe,
          options,
          'Runtime.evaluate',
          selected.sessionId,
          'Optional replacement probe'
        );
        assertRuntimeEvaluationResult(probe, 'Optional replacement probe');
        const expectedTestCommandId = replacementResumeReceipt.id + 2;
        if (!Number.isSafeInteger(expectedTestCommandId) || probe.id !== expectedTestCommandId) {
          throw new Error('Replacement bootstrap command IDs are not strictly consecutive.');
        }
      }

      const testResultSha256 = probe === null ? null : sha256Canonical(probe.result);
      if ((probe === null) !== (testParamsSha256 === null || testResultSha256 === null)) {
        throw new Error('Replacement bootstrap optional probe proof diverged.');
      }
      if (
        probe !== null &&
        testParams !== null &&
        testParamsSha256 !== null &&
        testResultSha256 !== null
      ) {
        commandLedger.push(
          buildCommandLedgerEntry(
            2,
            probe,
            'Runtime.evaluate',
            testParams,
            testParamsSha256,
            testResultSha256
          )
        );
      }
      const bootstrapCommandProofs: Array<{
        readonly ordinal: number;
        readonly commandId: number;
        readonly method: 'Runtime.runIfWaitingForDebugger' | 'Runtime.evaluate';
        readonly paramsSha256: string;
        readonly resultSha256: string;
      }> = [
        {
          ordinal: 0,
          commandId: replacementResumeReceipt.id,
          method: 'Runtime.runIfWaitingForDebugger',
          paramsSha256: resumeParamsSha256,
          resultSha256: resumeResultSha256,
        },
        {
          ordinal: 1,
          commandId: identityReceipt.id,
          method: 'Runtime.evaluate',
          paramsSha256: identityParamsSha256,
          resultSha256: identityResultSha256,
        },
      ];
      if (probe !== null && testParamsSha256 !== null && testResultSha256 !== null) {
        bootstrapCommandProofs.push({
          ordinal: 2,
          commandId: probe.id,
          method: 'Runtime.evaluate',
          paramsSha256: testParamsSha256,
          resultSha256: testResultSha256,
        });
      }
      const bootstrapCommandBatchPreimage = {
        schemaVersion: 1,
        processGeneration: options.processGeneration,
        leaseEpoch: options.leaseEpoch,
        restartGeneration: options.restartGeneration + 1,
        sessionId: selected.sessionId,
        testProbeConfigured: probe !== null,
        commands: bootstrapCommandProofs,
      };
      const bootstrapCommandBatchSha256 = sha256Canonical(bootstrapCommandBatchPreimage);
      if (probe !== null && testParamsSha256 !== null && testResultSha256 !== null) {
        if (Object.prototype.hasOwnProperty.call(probe.result, 'exceptionDetails')) {
          observations.diagnostics.push({
            kind: 'probe.exceptionDetails',
            message: JSON.stringify(probe.result.exceptionDetails),
          });
        }
        model.send({
          type: 'TEST_PROBE_RESOLVED',
          commandId: probe.id,
          restartGeneration: options.restartGeneration + 1,
          method: 'Runtime.evaluate',
          paramsSha256: testParamsSha256,
          resultSha256: testResultSha256,
          sessionId: selected.sessionId,
          uniqueContextId,
          diagnosticDisposition: Object.prototype.hasOwnProperty.call(
            probe.result,
            'exceptionDetails'
          )
            ? 'application_exception'
            : 'clean',
        });
      }
      await observations.waitFor(
        () => observations.versions.get(candidate.version.versionId)?.runningStatus === 'running',
        deadline,
        'replacement running proof'
      );
      observations.assertHealthy();
      model.assertState('release_disarming', 'replacement bootstrap proof');

      authority = Object.freeze({
        extensionId: candidate.extensionId,
        registrationId: candidate.registration.registrationId,
        versionId: candidate.version.versionId,
        scopeURL: candidate.registration.scopeURL,
        scriptURL: candidate.version.scriptURL,
        targetId,
        sessionId: selected.sessionId,
        attachmentGeneration: selected.attachmentGeneration,
        attachmentOrigin: selected.origin,
        uniqueContextId,
      }) satisfies RawWorkerAuthority;
      const crashEventSha256 = observations.crashEventHashes.get(selected.sessionId);
      const reloadEventSha256 = observations.reloadEventHashes.get(selected.sessionId);
      const executionContextEventSha256 = observations.contextEventHashes
        .get(selected.sessionId)
        ?.get(uniqueContextId);
      const contextGeneration = observations.contextGenerations.get(selected.sessionId);
      const revokedUniqueContextIdsSha256 = observations.revokedContextIdsHashes.get(
        selected.sessionId
      );
      const postCrashDestroyedUniqueContextIdsSha256 =
        observations.postCrashDestroyedContextIdsHashes.get(selected.sessionId);
      if (
        crashEventSha256 === undefined ||
        contextGeneration === undefined ||
        revokedUniqueContextIdsSha256 === undefined ||
        postCrashDestroyedUniqueContextIdsSha256 === undefined ||
        reloadEventSha256 === undefined ||
        executionContextEventSha256 === undefined
      ) {
        throw new Error('Raw replacement evidence hashes are incomplete.');
      }
      const modelContextProof = model.restartContextProof();
      if (
        modelContextProof.contextGeneration !== contextGeneration ||
        modelContextProof.revokedUniqueContextIdsSha256 !== revokedUniqueContextIdsSha256 ||
        modelContextProof.postCrashDestroyedUniqueContextIdsSha256 !==
          postCrashDestroyedUniqueContextIdsSha256 ||
        modelContextProof.identityCommandId !== identityReceipt.id ||
        modelContextProof.identityResultSha256 !== identityResultSha256 ||
        modelContextProof.testCommandId !== (probe?.id ?? null) ||
        modelContextProof.testResultSha256 !== testResultSha256 ||
        modelContextProof.resumeCommandId !== replacementResumeReceipt.id ||
        modelContextProof.resumeResultSha256 !== resumeResultSha256 ||
        modelContextProof.bootstrapCommandBatchSha256 !== bootstrapCommandBatchSha256
      ) {
        throw new Error(
          'Raw worker XState restart correlation proof diverged from native evidence.'
        );
      }
      const builtRestartReceipt = buildRestartReceipt(
        options,
        authority,
        startReceipt.id,
        crashEventSha256,
        contextGeneration,
        revokedUniqueContextIdsSha256,
        postCrashDestroyedUniqueContextIdsSha256,
        reloadEventSha256,
        executionContextEventSha256,
        identityReceipt.id,
        identityResultSha256,
        probe?.id ?? null,
        testResultSha256,
        replacementResumeReceipt.id,
        resumeResultSha256,
        bootstrapCommandBatchSha256
      );
      restartReceipt = builtRestartReceipt.receipt;
      restartProof = cloneEvidence({
        schemaVersion: 1,
        processGeneration: options.processGeneration,
        leaseEpoch: options.leaseEpoch,
        transportId: options.transportId,
        restartGeneration: options.restartGeneration + 1,
        bootstrapCommandBatchSha256,
        authorityPreimage: builtRestartReceipt.authorityPreimage,
        bootstrapPreimage: builtRestartReceipt.bootstrapPreimage,
        receiptPreimage: builtRestartReceipt.receiptPreimage,
        bootstrapCommandBatchPreimage,
        commandLedger,
        batchSettlements,
      });
    } catch (operationError: unknown) {
      let releaseError: unknown;
      let failedReleaseReceipt: RawReleaseReceipt | undefined;
      try {
        releaseAttempted = true;
        model.beginFailedRelease();
        failedReleaseReceipt = await releaseRawAuthority(
          options,
          observations,
          unsubscribe,
          sentinelTargetId,
          controlSessionId,
          model,
          releaseCommandLedger
        );
      } catch (error: unknown) {
        releaseError = error;
        unsubscribe();
        options.client.close();
        await options.client.closed.catch(() => undefined);
      }
      if (releaseError !== undefined) {
        throw new AggregateError(
          [operationError, releaseError],
          `Raw worker operation and mandatory failed release both failed: ${
            releaseError instanceof Error ? releaseError.message : 'unknown release error'
          }`
        );
      }
      if (failedReleaseReceipt === undefined) {
        throw new AggregateError(
          [operationError],
          'Raw worker failed release returned no exact receipt.'
        );
      }
      throw new RawWorkerEpochFailure(
        operationError,
        commandLedger,
        batchSettlements,
        failedReleaseReceipt
      );
    }
    if (bootstrapRetentionAttempted) {
      throw new Error('Raw bootstrap proof callback cannot be invoked more than once.');
    }
    model.assertState('release_disarming', 'bootstrap proof retention');
    const operationalAuthority = createRawOperationalLedgerAuthorityV1({
      processGeneration: options.processGeneration,
      leaseEpoch: options.leaseEpoch,
      transportId: options.transportId,
      commandLedger: Object.freeze([...releaseCommandLedger]),
    });
    const bootstrapProof = createRawBootstrapProvedV1(
      operationalAuthority,
      restartReceipt.receiptSha256
    );
    bootstrapRetentionAttempted = true;
    const bootstrapAck = await deadline.wait(
      Promise.resolve(options.onBootstrapProved(bootstrapProof)),
      'bootstrap proof retention acknowledgment'
    );
    if (!isRawBootstrapRetentionAckV1(bootstrapAck, bootstrapProof)) {
      throw new Error('Raw bootstrap proof retention acknowledgment diverged.');
    }
    bootstrapRetentionAcknowledged = true;
    releaseAttempted = true;
    const releaseReceipt = await releaseRawAuthority(
      options,
      observations,
      unsubscribe,
      sentinelTargetId,
      controlSessionId,
      model,
      releaseCommandLedger
    );
    return Object.freeze({
      applicationDiagnostics: Object.freeze(
        observations.diagnostics.map((diagnostic) => Object.freeze({ ...diagnostic }))
      ),
      authority,
      restartReceipt,
      restartProof,
      releaseReceipt,
    });
  } catch (acquisitionError: unknown) {
    if (acquisitionError instanceof RawWorkerEpochFailure) {
      throw acquisitionError;
    }
    if (releaseAttempted) {
      unsubscribe();
      options.client.close();
      await options.client.closed.catch(() => undefined);
      throw acquisitionError;
    }

    if (bootstrapRetentionAttempted && !bootstrapRetentionAcknowledged) {
      unsubscribe();
      options.client.close();
      await options.client.closed.catch(() => undefined);
      throw acquisitionError;
    }

    if (
      sentinelTargetId !== undefined &&
      controlSessionId !== undefined &&
      selected !== undefined
    ) {
      try {
        releaseAttempted = true;
        model.beginFailedRelease();
        const failedReleaseReceipt = await releaseRawAuthority(
          options,
          observations,
          unsubscribe,
          sentinelTargetId,
          controlSessionId,
          model,
          releaseCommandLedger
        );
        throw new RawWorkerEpochFailure(
          acquisitionError,
          commandLedger,
          batchSettlements,
          failedReleaseReceipt
        );
      } catch (releaseError: unknown) {
        if (releaseError instanceof RawWorkerEpochFailure) {
          throw releaseError;
        }
        unsubscribe();
        options.client.close();
        await options.client.closed.catch(() => undefined);
        throw new AggregateError(
          [acquisitionError, releaseError],
          `Raw worker acquisition and mandatory failed release both failed: ${
            releaseError instanceof Error ? releaseError.message : 'unknown release error'
          }`
        );
      }
    }

    try {
      await closeFailedAcquisition(options, observations, unsubscribe, releaseCommandLedger, {
        autoAttachArmed,
        discoveryEnabled,
        ...(controlSessionId === undefined ? {} : { controlSessionId }),
      });
    } catch (cleanupError: unknown) {
      throw new AggregateError(
        [acquisitionError, cleanupError],
        `Raw worker acquisition and direct cleanup both failed: ${
          cleanupError instanceof Error ? cleanupError.message : 'unknown cleanup error'
        }`
      );
    }
    throw acquisitionError;
  }
}

export function asRawCdpClientPort(client: RawCdpClient): RawCdpClientPort {
  return client;
}
