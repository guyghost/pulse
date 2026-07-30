import { assign, setup } from 'xstate';

import {
  createNoOwnerReleaseReceiptV1,
  isPlaywrightAuthorityProjectionErrorV1,
  parsePlaywrightAuthorityV1,
  projectPlaywrightAuthorityV1,
  sha256Jcs,
  type NoOwnerReleaseReceiptV1,
  type PlaywrightAuthorityProjectionErrorV1,
  type PlaywrightAuthorityV1,
} from './playwright-authority';
import { createRawOperationalLedgerAuthorityV1 } from './raw-operational-authority';
import type { RawReleaseReceipt, RawWorkerAuthority } from './raw-worker-owner';

export {
  createRawOperationalLedgerAuthorityV1,
  type RawOperationalLedgerAuthorityV1,
} from './raw-operational-authority';

type RawMode = 'initial_bootstrap' | 'runtime_restart';
type Verdict = 'eligible' | 'blocked';

interface Mv3HarnessContext {
  readonly profileId: string | null;
  readonly processGeneration: number | null;
  readonly pid: number | null;
  readonly currentLeaseEpoch: number;
  readonly currentPlaywrightEpoch: number;
  readonly rawMode: RawMode | null;
  readonly rawTransportId: string | null;
  readonly rawTransportOpened: boolean;
  readonly currentRawBootstrapReceiptSha256: string | null;
  readonly currentRawOperationalCommandCount: number | null;
  readonly currentRawOperationalLedgerSha256: string | null;
  readonly playwrightTransportId: string | null;
  readonly playwrightTransportOpened: boolean;
  readonly hasRawRelease: boolean;
  readonly currentRawAuthority: Readonly<RawWorkerAuthority> | null;
  readonly currentRawReleaseReceipt: Readonly<RawReleaseReceipt> | null;
  readonly currentRawReleaseReceiptSha256: string | null;
  readonly rawAuthorityPlaywrightEpoch: number | null;
  readonly pendingPlaywrightEpoch: number | null;
  readonly currentPlaywrightAuthority: PlaywrightAuthorityV1 | null;
  readonly authorityProjectionSha256: string | null;
  readonly authorityProjectionError: PlaywrightAuthorityProjectionErrorV1 | null;
  readonly noOwnerReleaseReceipt: NoOwnerReleaseReceiptV1 | null;
  readonly restartPending: boolean;
  readonly runtimeRestartCount: number;
  readonly shutdownTransportId: string | null;
  readonly shutdownCommandId: string | null;
  readonly shutdownCloseProved: boolean;
  readonly verdict: Verdict;
}

type ProcessEvent<T extends string, P extends object = Record<never, never>> = Readonly<
  { type: T; processGeneration: number } & P
>;

export type Mv3HarnessEvent =
  | { readonly type: 'HARNESS_STARTED' }
  | { readonly type: 'ARTIFACT_SEALED'; readonly artifactSha256: string }
  | { readonly type: 'PROFILE_CREATED'; readonly profileId: string }
  | ProcessEvent<'PROCESS_SPAWNED', { readonly pid: number }>
  | ProcessEvent<'ENDPOINT_PARSED', { readonly endpointReceiptSha256: string }>
  | ProcessEvent<'RAW_ACQUIRE_REQUESTED', { readonly mode: RawMode; readonly leaseEpoch: number }>
  | ProcessEvent<
      'RAW_TRANSPORT_OPENED',
      { readonly leaseEpoch: number; readonly transportId: string }
    >
  | ProcessEvent<
      'ENDPOINT_VERIFIED',
      { readonly leaseEpoch: number; readonly endpointReceiptSha256: string }
    >
  | ProcessEvent<
      'RAW_BOOTSTRAP_PROVED',
      {
        readonly leaseEpoch: number;
        readonly receiptSha256: string;
        readonly operationalCommandCount: number;
        readonly operationalLedgerSha256: string;
      }
    >
  | ProcessEvent<
      'RAW_RELEASE_PROVED',
      {
        readonly leaseEpoch: number;
        readonly playwrightEpoch: number;
        readonly rawReceipt: unknown;
        readonly rawReceiptSha256: string;
        readonly authority: unknown;
      }
    >
  | ProcessEvent<
      'PLAYWRIGHT_AUTHORITY_PROJECTION_REQUESTED',
      { readonly playwrightEpoch: number; readonly rawReceiptSha256: string }
    >
  | ProcessEvent<
      'PLAYWRIGHT_AUTHORITY_PROJECTED',
      {
        readonly playwrightEpoch: number;
        readonly rawReceiptSha256: string;
        readonly authority: unknown;
        readonly authorityProjectionSha256: string;
      }
    >
  | ProcessEvent<
      'PLAYWRIGHT_AUTHORITY_REJECTED',
      {
        readonly playwrightEpoch: number;
        readonly rawReceiptSha256: string;
        readonly error: unknown;
      }
    >
  | ProcessEvent<
      'PLAYWRIGHT_RESERVE_REQUESTED',
      {
        readonly leaseEpoch: number;
        readonly playwrightEpoch: number;
        readonly authorityProjectionSha256: string;
      }
    >
  | ProcessEvent<
      'PLAYWRIGHT_TRANSPORT_OPENED',
      {
        readonly leaseEpoch: number;
        readonly playwrightEpoch: number;
        readonly transportId: string;
      }
    >
  | ProcessEvent<
      'PLAYWRIGHT_HANDOFF_PROVED',
      { readonly leaseEpoch: number; readonly playwrightEpoch: number }
    >
  | ProcessEvent<
      'PLAYWRIGHT_RELEASE_PROVED',
      { readonly leaseEpoch: number; readonly playwrightEpoch: number }
    >
  | ProcessEvent<'PLAYWRIGHT_CONNECT_FAILED_CLOSED'>
  | ProcessEvent<'RESTART_REQUESTED', { readonly playwrightEpoch: number }>
  | ProcessEvent<'USE_COMPLETED', { readonly playwrightEpoch: number }>
  | ProcessEvent<'USE_FAILED', { readonly diagnosticSha256?: string }>
  | ProcessEvent<'DIAGNOSTICS_ACCEPTED'>
  | ProcessEvent<'DIAGNOSTICS_REJECTED'>
  | ProcessEvent<'ARTIFACT_MATCHED', { readonly artifactSha256: string }>
  | ProcessEvent<'ARTIFACT_CHANGED'>
  | ProcessEvent<
      'SHUTDOWN_TRANSPORT_OPENED',
      { readonly leaseEpoch: number; readonly transportId: string }
    >
  | ProcessEvent<
      'SHUTDOWN_ENDPOINT_VERIFIED',
      { readonly leaseEpoch: number; readonly transportId: string; readonly commandId: string }
    >
  | ProcessEvent<
      'SHUTDOWN_BROWSER_CLOSE_RESOLVED',
      {
        readonly leaseEpoch: number;
        readonly transportId: string;
        readonly commandId: string;
        readonly resolvedAt: number;
      }
    >
  | ProcessEvent<
      'SHUTDOWN_SOCKET_CLOSED_AFTER_COMMAND',
      {
        readonly leaseEpoch: number;
        readonly transportId: string;
        readonly commandId: string;
        readonly dispatchedAt: number;
        readonly socketClosedAt: number;
      }
    >
  | ProcessEvent<'PROCESS_EXITED', { readonly pid: number; readonly observedAt: number }>
  | ProcessEvent<'PROFILE_REMOVED'>
  | ProcessEvent<'VERDICT_ARCHIVED'>
  | ProcessEvent<
      'APPLICATION_DIAGNOSTIC_RECORDED',
      { readonly diagnosticSha256: string; readonly kind: string }
    >
  | ProcessEvent<'EVIDENCE_OVERFLOW_RECORDED'>
  | ProcessEvent<'OBSERVER_PROTOCOL_FAILED'>
  | ProcessEvent<'CLEANUP_FAILED'>;

const initialContext: Mv3HarnessContext = {
  profileId: null,
  processGeneration: null,
  pid: null,
  currentLeaseEpoch: 0,
  currentPlaywrightEpoch: 0,
  rawMode: null,
  rawTransportId: null,
  rawTransportOpened: false,
  currentRawBootstrapReceiptSha256: null,
  currentRawOperationalCommandCount: null,
  currentRawOperationalLedgerSha256: null,
  playwrightTransportId: null,
  playwrightTransportOpened: false,
  hasRawRelease: false,
  currentRawAuthority: null,
  currentRawReleaseReceipt: null,
  currentRawReleaseReceiptSha256: null,
  rawAuthorityPlaywrightEpoch: null,
  pendingPlaywrightEpoch: null,
  currentPlaywrightAuthority: null,
  authorityProjectionSha256: null,
  authorityProjectionError: null,
  noOwnerReleaseReceipt: null,
  restartPending: false,
  runtimeRestartCount: 0,
  shutdownTransportId: null,
  shutdownCommandId: null,
  shutdownCloseProved: false,
  verdict: 'eligible',
};

function isCurrentProcess(context: Mv3HarnessContext, event: Mv3HarnessEvent): boolean {
  return (
    'processGeneration' in event &&
    context.processGeneration !== null &&
    event.processGeneration === context.processGeneration
  );
}

function isCurrentLease(context: Mv3HarnessContext, event: Mv3HarnessEvent): boolean {
  return (
    isCurrentProcess(context, event) &&
    'leaseEpoch' in event &&
    event.leaseEpoch === context.currentLeaseEpoch
  );
}

function isCurrentPlaywright(context: Mv3HarnessContext, event: Mv3HarnessEvent): boolean {
  return (
    isCurrentLease(context, event) &&
    'playwrightEpoch' in event &&
    event.playwrightEpoch === context.currentPlaywrightEpoch
  );
}

type UnknownRecord = Readonly<Record<string, unknown>>;

interface RawReceiptIdentity {
  readonly processGeneration: number;
  readonly leaseEpoch: number;
  readonly transportId: string;
}

interface ParsedReleaseLedgerEntry {
  readonly ordinal: number;
  readonly kind: 'cleanup' | 'operational';
  readonly commandId: number;
  readonly method: string;
  readonly sessionId: string | null;
  readonly paramsSha256: string;
  readonly resultSha256: string;
}

interface ParsedCommandReceipt {
  readonly source: UnknownRecord;
  readonly id: number;
  readonly method: string;
  readonly sessionId: string | null;
  readonly result: UnknownRecord;
}

interface ParsedInventoryMember {
  readonly attachmentGeneration: number;
  readonly origin: 'auto' | 'manual';
  readonly sessionId: string;
  readonly targetId: string;
  readonly url: string;
}

interface ParsedTarget {
  readonly targetId: string;
  readonly type: string;
  readonly url: string;
  readonly attached: boolean;
}

interface ParsedTargetProof {
  readonly receipt: ParsedCommandReceipt;
  readonly targets: readonly ParsedTarget[];
}

interface ParsedDetachEvidence extends RawReceiptIdentity {
  readonly attachmentGeneration: number | null;
  readonly targetId: string;
  readonly sessionId: string;
  readonly eventSha256: string;
}

const RELEASE_RECEIPT_KEYS = [
  'schemaVersion',
  'processGeneration',
  'leaseEpoch',
  'transportId',
  'released',
  'deadline',
  'commandLedger',
  'attachmentInventory',
  'proofs',
  'close',
] as const;
const RELEASE_PROOF_KEYS = [
  'resumeReceipts',
  'autoAttachDisarm',
  'attachFence',
  'manualDetachReceipts',
  'workerDetachEvents',
  'zeroAttachedFence',
  'serviceWorkerDisable',
  'controlDetach',
  'controlDetachEvent',
  'sentinelFence',
  'discoveryDisable',
  'close',
] as const;
const RELEASE_LEDGER_KEYS = [
  'ordinal',
  'kind',
  'commandId',
  'method',
  'sessionId',
  'paramsSha256',
  'status',
  'resultSha256',
  'rejectionSha256',
] as const;
const RELEASE_INVENTORY_KEYS = [
  'attachmentGeneration',
  'origin',
  'sessionId',
  'targetId',
  'url',
  'waitingForDebugger',
  'detached',
] as const;
const DETACH_PREIMAGE_KEYS = [
  'schemaVersion',
  'processGeneration',
  'leaseEpoch',
  'transportId',
  'attachmentGeneration',
  'targetId',
  'sessionId',
  'method',
] as const;
const SERVICE_WORKER_FILTER = Object.freeze([
  Object.freeze({ type: 'service_worker', exclude: false }),
  Object.freeze({ exclude: true }),
]);
const PAGE_FILTER = Object.freeze([
  Object.freeze({ type: 'page', exclude: false }),
  Object.freeze({ exclude: true }),
]);
const MAX_RELEASE_LEDGER_ENTRIES = 256;
const MAX_RELEASE_ATTACHMENTS = 4_096;
const UTF8_ENCODER = new TextEncoder();

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: UnknownRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function hasOnlyKeys(value: UnknownRecord, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function isProtocolString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    UTF8_ENCODER.encode(value).byteLength <= 4_096 &&
    !/[\0\r\n]/u.test(value)
  );
}

function hasReceiptIdentity(value: UnknownRecord, identity: RawReceiptIdentity): boolean {
  return (
    value.schemaVersion === 1 &&
    value.processGeneration === identity.processGeneration &&
    value.leaseEpoch === identity.leaseEpoch &&
    value.transportId === identity.transportId
  );
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return sha256Jcs(left) === sha256Jcs(right);
}

function parseCloseReceipt(value: unknown, identity: RawReceiptIdentity): UnknownRecord | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'schemaVersion',
      'processGeneration',
      'leaseEpoch',
      'transportId',
      'code',
      'reason',
    ]) ||
    !hasReceiptIdentity(value, identity) ||
    !Number.isSafeInteger(value.code) ||
    (value.code as number) < 0 ||
    (value.code as number) > 4_999 ||
    typeof value.reason !== 'string' ||
    UTF8_ENCODER.encode(value.reason).byteLength > 123 ||
    /[\0\r\n]/u.test(value.reason)
  ) {
    return null;
  }
  return value;
}

function parseLedger(value: unknown): {
  readonly entries: readonly ParsedReleaseLedgerEntry[];
  readonly byId: ReadonlyMap<number, ParsedReleaseLedgerEntry>;
} | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_RELEASE_LEDGER_ENTRIES) {
    return null;
  }
  const entries: ParsedReleaseLedgerEntry[] = [];
  const byId = new Map<number, ParsedReleaseLedgerEntry>();
  for (let index = 0; index < value.length; index += 1) {
    const candidate = value[index];
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, RELEASE_LEDGER_KEYS) ||
      candidate.ordinal !== index ||
      (candidate.kind !== 'cleanup' && candidate.kind !== 'operational') ||
      !isPositiveSafeInteger(candidate.commandId) ||
      !isProtocolString(candidate.method) ||
      !(candidate.sessionId === null || isProtocolString(candidate.sessionId)) ||
      !isSha256(candidate.paramsSha256) ||
      candidate.status !== 'fulfilled' ||
      !isSha256(candidate.resultSha256) ||
      candidate.rejectionSha256 !== null ||
      byId.has(candidate.commandId)
    ) {
      return null;
    }
    const entry: ParsedReleaseLedgerEntry = {
      ordinal: index,
      kind: candidate.kind,
      commandId: candidate.commandId,
      method: candidate.method,
      sessionId: candidate.sessionId,
      paramsSha256: candidate.paramsSha256,
      resultSha256: candidate.resultSha256,
    };
    entries.push(entry);
    byId.set(entry.commandId, entry);
  }
  return { entries, byId };
}

function parseInventory(value: unknown): readonly ParsedInventoryMember[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_RELEASE_ATTACHMENTS) {
    return null;
  }
  const sessions = new Set<string>();
  const members: ParsedInventoryMember[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const candidate = value[index];
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, RELEASE_INVENTORY_KEYS) ||
      candidate.attachmentGeneration !== index + 1 ||
      (candidate.origin !== 'auto' && candidate.origin !== 'manual') ||
      !isProtocolString(candidate.sessionId) ||
      !isProtocolString(candidate.targetId) ||
      !isProtocolString(candidate.url) ||
      candidate.waitingForDebugger !== false ||
      candidate.detached !== true ||
      sessions.has(candidate.sessionId)
    ) {
      return null;
    }
    sessions.add(candidate.sessionId);
    members.push({
      attachmentGeneration: candidate.attachmentGeneration,
      origin: candidate.origin,
      sessionId: candidate.sessionId,
      targetId: candidate.targetId,
      url: candidate.url,
    });
  }
  return members;
}

function parseCommandReceipt(
  value: unknown,
  identity: RawReceiptIdentity
): ParsedCommandReceipt | null {
  if (!isRecord(value)) {
    return null;
  }
  const keys = [
    'schemaVersion',
    'processGeneration',
    'leaseEpoch',
    'transportId',
    'id',
    'method',
    'result',
    ...(Object.prototype.hasOwnProperty.call(value, 'sessionId') ? ['sessionId'] : []),
  ];
  if (
    !hasExactKeys(value, keys) ||
    !hasReceiptIdentity(value, identity) ||
    !isPositiveSafeInteger(value.id) ||
    !isProtocolString(value.method) ||
    !isRecord(value.result) ||
    (Object.prototype.hasOwnProperty.call(value, 'sessionId') && !isProtocolString(value.sessionId))
  ) {
    return null;
  }
  return {
    source: value,
    id: value.id,
    method: value.method,
    sessionId: typeof value.sessionId === 'string' ? value.sessionId : null,
    result: value.result,
  };
}

function parseTargets(value: unknown): readonly ParsedTarget[] | null {
  if (!Array.isArray(value) || value.length > MAX_RELEASE_ATTACHMENTS) {
    return null;
  }
  const ids = new Set<string>();
  const targets: ParsedTarget[] = [];
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, ['targetId', 'type', 'url', 'attached']) ||
      !isProtocolString(candidate.targetId) ||
      !isProtocolString(candidate.type) ||
      typeof candidate.url !== 'string' ||
      typeof candidate.attached !== 'boolean' ||
      ids.has(candidate.targetId)
    ) {
      return null;
    }
    ids.add(candidate.targetId);
    targets.push({
      targetId: candidate.targetId,
      type: candidate.type,
      url: candidate.url,
      attached: candidate.attached,
    });
  }
  return targets;
}

function parseNativeTargets(value: unknown): readonly ParsedTarget[] | null {
  if (!Array.isArray(value) || value.length > MAX_RELEASE_ATTACHMENTS) {
    return null;
  }
  const allowedKeys = [
    'targetId',
    'type',
    'title',
    'url',
    'attached',
    'openerId',
    'canAccessOpener',
    'openerFrameId',
    'browserContextId',
    'subtype',
  ];
  const ids = new Set<string>();
  const targets: ParsedTarget[] = [];
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !hasOnlyKeys(candidate, allowedKeys) ||
      !isProtocolString(candidate.targetId) ||
      !isProtocolString(candidate.type) ||
      typeof candidate.url !== 'string' ||
      typeof candidate.attached !== 'boolean' ||
      (Object.prototype.hasOwnProperty.call(candidate, 'title') &&
        typeof candidate.title !== 'string') ||
      (Object.prototype.hasOwnProperty.call(candidate, 'openerId') &&
        !isProtocolString(candidate.openerId)) ||
      (Object.prototype.hasOwnProperty.call(candidate, 'canAccessOpener') &&
        typeof candidate.canAccessOpener !== 'boolean') ||
      (Object.prototype.hasOwnProperty.call(candidate, 'openerFrameId') &&
        !isProtocolString(candidate.openerFrameId)) ||
      (Object.prototype.hasOwnProperty.call(candidate, 'browserContextId') &&
        !isProtocolString(candidate.browserContextId)) ||
      (Object.prototype.hasOwnProperty.call(candidate, 'subtype') &&
        typeof candidate.subtype !== 'string') ||
      ids.has(candidate.targetId)
    ) {
      return null;
    }
    ids.add(candidate.targetId);
    targets.push({
      targetId: candidate.targetId,
      type: candidate.type,
      url: candidate.url,
      attached: candidate.attached,
    });
  }
  return targets;
}

function parseTargetProof(value: unknown, identity: RawReceiptIdentity): ParsedTargetProof | null {
  if (!isRecord(value) || !hasExactKeys(value, ['receipt', 'targets'])) {
    return null;
  }
  const receipt = parseCommandReceipt(value.receipt, identity);
  const targets = parseTargets(value.targets);
  const nativeTargets =
    receipt !== null && hasExactKeys(receipt.result, ['targetInfos'])
      ? parseNativeTargets(receipt.result.targetInfos)
      : null;
  if (
    receipt === null ||
    targets === null ||
    nativeTargets === null ||
    !sameCanonical(nativeTargets, targets)
  ) {
    return null;
  }
  return { receipt, targets };
}

function parseDetachEvidence(
  value: unknown,
  identity: RawReceiptIdentity
): ParsedDetachEvidence | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [...DETACH_PREIMAGE_KEYS, 'preimage', 'eventSha256']) ||
    !hasReceiptIdentity(value, identity) ||
    !(value.attachmentGeneration === null || isPositiveSafeInteger(value.attachmentGeneration)) ||
    !isProtocolString(value.targetId) ||
    !isProtocolString(value.sessionId) ||
    value.method !== 'Target.detachedFromTarget' ||
    !isRecord(value.preimage) ||
    !hasExactKeys(value.preimage, DETACH_PREIMAGE_KEYS) ||
    !sameCanonical(
      value.preimage,
      Object.fromEntries(DETACH_PREIMAGE_KEYS.map((key) => [key, value[key]]))
    ) ||
    !isSha256(value.eventSha256) ||
    value.eventSha256 !== sha256Jcs(value.preimage)
  ) {
    return null;
  }
  return {
    processGeneration: identity.processGeneration,
    leaseEpoch: identity.leaseEpoch,
    transportId: identity.transportId,
    attachmentGeneration: value.attachmentGeneration as number | null,
    targetId: value.targetId,
    sessionId: value.sessionId,
    eventSha256: value.eventSha256,
  };
}

function bindCommandProof(
  receipt: ParsedCommandReceipt,
  ledger: ReadonlyMap<number, ParsedReleaseLedgerEntry>,
  usedCleanupIds: Set<number>,
  expected: {
    readonly method: string;
    readonly sessionId: string | null;
    readonly params: UnknownRecord;
  }
): boolean {
  const entry = ledger.get(receipt.id);
  if (
    entry === undefined ||
    entry.kind !== 'cleanup' ||
    usedCleanupIds.has(receipt.id) ||
    receipt.method !== expected.method ||
    receipt.sessionId !== expected.sessionId ||
    entry.method !== expected.method ||
    entry.sessionId !== expected.sessionId ||
    entry.paramsSha256 !== sha256Jcs(expected.params) ||
    entry.resultSha256 !== sha256Jcs(receipt.result)
  ) {
    return false;
  }
  usedCleanupIds.add(receipt.id);
  return true;
}

function isEmptyResult(receipt: ParsedCommandReceipt): boolean {
  return hasExactKeys(receipt.result, []);
}

function isRawReleaseReceipt(
  value: unknown,
  processGeneration: number,
  leaseEpoch: number,
  expectedTransportId: string,
  expectedOperationalCommandCount: number,
  expectedOperationalLedgerSha256: string
): value is RawReleaseReceipt {
  if (!isRecord(value)) {
    return false;
  }
  try {
    const identity = { processGeneration, leaseEpoch, transportId: expectedTransportId };
    if (
      !hasExactKeys(value, RELEASE_RECEIPT_KEYS) ||
      !hasReceiptIdentity(value, identity) ||
      value.released !== true ||
      !isRecord(value.deadline) ||
      !hasExactKeys(value.deadline, ['timeoutMs', 'completedWithinDeadline']) ||
      !isPositiveSafeInteger(value.deadline.timeoutMs) ||
      value.deadline.completedWithinDeadline !== true ||
      !isRecord(value.proofs) ||
      !hasExactKeys(value.proofs, RELEASE_PROOF_KEYS)
    ) {
      return false;
    }

    const close = parseCloseReceipt(value.close, identity);
    const proofClose = parseCloseReceipt(value.proofs.close, identity);
    const ledger = parseLedger(value.commandLedger);
    const inventory = parseInventory(value.attachmentInventory);
    if (
      close === null ||
      proofClose === null ||
      !sameCanonical(close, proofClose) ||
      ledger === null ||
      inventory === null
    ) {
      return false;
    }

    const operationalAuthority = createRawOperationalLedgerAuthorityV1(
      value as unknown as RawReleaseReceipt
    );
    if (
      operationalAuthority.operationalCommandCount === 0 ||
      operationalAuthority.operationalCommandCount !== expectedOperationalCommandCount ||
      operationalAuthority.operationalLedgerSha256 !== expectedOperationalLedgerSha256
    ) {
      return false;
    }

    const proofs = value.proofs;
    const usedCleanupIds = new Set<number>();
    if (!Array.isArray(proofs.resumeReceipts) || proofs.resumeReceipts.length > inventory.length) {
      return false;
    }
    const resumedSessions = new Set<string>();
    for (const receiptValue of proofs.resumeReceipts) {
      const receipt = parseCommandReceipt(receiptValue, identity);
      if (
        receipt === null ||
        receipt.sessionId === null ||
        resumedSessions.has(receipt.sessionId) ||
        !inventory.some((member) => member.sessionId === receipt.sessionId) ||
        !isEmptyResult(receipt) ||
        !bindCommandProof(receipt, ledger.byId, usedCleanupIds, {
          method: 'Runtime.runIfWaitingForDebugger',
          sessionId: receipt.sessionId,
          params: {},
        })
      ) {
        return false;
      }
      resumedSessions.add(receipt.sessionId);
    }

    const autoAttachDisarm = parseCommandReceipt(proofs.autoAttachDisarm, identity);
    if (
      autoAttachDisarm === null ||
      !isEmptyResult(autoAttachDisarm) ||
      !bindCommandProof(autoAttachDisarm, ledger.byId, usedCleanupIds, {
        method: 'Target.setAutoAttach',
        sessionId: null,
        params: { autoAttach: false, waitForDebuggerOnStart: false, flatten: true },
      })
    ) {
      return false;
    }

    const attachFence = parseTargetProof(proofs.attachFence, identity);
    if (
      attachFence === null ||
      !bindCommandProof(attachFence.receipt, ledger.byId, usedCleanupIds, {
        method: 'Target.getTargets',
        sessionId: null,
        params: { filter: SERVICE_WORKER_FILTER },
      }) ||
      attachFence.targets.some(
        (target) =>
          target.type !== 'service_worker' ||
          (target.attached &&
            !inventory.some(
              (member) =>
                member.origin === 'manual' &&
                member.targetId === target.targetId &&
                member.url === target.url
            ))
      )
    ) {
      return false;
    }

    const manualMembers = inventory.filter((member) => member.origin === 'manual');
    if (
      !Array.isArray(proofs.manualDetachReceipts) ||
      proofs.manualDetachReceipts.length !== manualMembers.length
    ) {
      return false;
    }
    for (let index = 0; index < manualMembers.length; index += 1) {
      const member = manualMembers[index]!;
      const receipt = parseCommandReceipt(proofs.manualDetachReceipts[index], identity);
      if (
        receipt === null ||
        !isEmptyResult(receipt) ||
        !bindCommandProof(receipt, ledger.byId, usedCleanupIds, {
          method: 'Target.detachFromTarget',
          sessionId: null,
          params: { sessionId: member.sessionId },
        })
      ) {
        return false;
      }
    }

    if (
      !Array.isArray(proofs.workerDetachEvents) ||
      proofs.workerDetachEvents.length !== inventory.length
    ) {
      return false;
    }
    const detachSessions = new Set<string>();
    const detachHashes = new Set<string>();
    for (let index = 0; index < inventory.length; index += 1) {
      const member = inventory[index]!;
      const evidence = parseDetachEvidence(proofs.workerDetachEvents[index], identity);
      if (
        evidence === null ||
        evidence.attachmentGeneration !== member.attachmentGeneration ||
        evidence.targetId !== member.targetId ||
        evidence.sessionId !== member.sessionId ||
        detachSessions.has(evidence.sessionId) ||
        detachHashes.has(evidence.eventSha256)
      ) {
        return false;
      }
      detachSessions.add(evidence.sessionId);
      detachHashes.add(evidence.eventSha256);
    }

    const zeroFence = parseTargetProof(proofs.zeroAttachedFence, identity);
    if (
      zeroFence === null ||
      zeroFence.targets.some(
        (target) => target.type !== 'service_worker' || target.attached !== false
      ) ||
      !bindCommandProof(zeroFence.receipt, ledger.byId, usedCleanupIds, {
        method: 'Target.getTargets',
        sessionId: null,
        params: { filter: SERVICE_WORKER_FILTER },
      })
    ) {
      return false;
    }

    const serviceWorkerDisable = parseCommandReceipt(proofs.serviceWorkerDisable, identity);
    if (
      serviceWorkerDisable === null ||
      serviceWorkerDisable.sessionId === null ||
      !isEmptyResult(serviceWorkerDisable) ||
      !bindCommandProof(serviceWorkerDisable, ledger.byId, usedCleanupIds, {
        method: 'ServiceWorker.disable',
        sessionId: serviceWorkerDisable.sessionId,
        params: {},
      })
    ) {
      return false;
    }
    const controlSessionId = serviceWorkerDisable.sessionId;

    const controlDetach = parseCommandReceipt(proofs.controlDetach, identity);
    if (
      controlDetach === null ||
      !isEmptyResult(controlDetach) ||
      !bindCommandProof(controlDetach, ledger.byId, usedCleanupIds, {
        method: 'Target.detachFromTarget',
        sessionId: null,
        params: { sessionId: controlSessionId },
      })
    ) {
      return false;
    }

    const sentinelFence = parseTargetProof(proofs.sentinelFence, identity);
    if (
      sentinelFence === null ||
      sentinelFence.targets.length !== 1 ||
      sentinelFence.targets[0]?.type !== 'page' ||
      sentinelFence.targets[0]?.url !== 'about:blank' ||
      sentinelFence.targets[0]?.attached !== false ||
      !bindCommandProof(sentinelFence.receipt, ledger.byId, usedCleanupIds, {
        method: 'Target.getTargets',
        sessionId: null,
        params: { filter: PAGE_FILTER },
      })
    ) {
      return false;
    }
    const sentinelTargetId = sentinelFence.targets[0].targetId;

    const controlDetachEvent = parseDetachEvidence(proofs.controlDetachEvent, identity);
    if (
      controlDetachEvent === null ||
      controlDetachEvent.attachmentGeneration !== null ||
      controlDetachEvent.sessionId !== controlSessionId ||
      controlDetachEvent.targetId !== sentinelTargetId ||
      detachSessions.has(controlDetachEvent.sessionId) ||
      detachHashes.has(controlDetachEvent.eventSha256)
    ) {
      return false;
    }

    const discoveryDisable = parseCommandReceipt(proofs.discoveryDisable, identity);
    if (
      discoveryDisable === null ||
      !isEmptyResult(discoveryDisable) ||
      !bindCommandProof(discoveryDisable, ledger.byId, usedCleanupIds, {
        method: 'Target.setDiscoverTargets',
        sessionId: null,
        params: { discover: false },
      })
    ) {
      return false;
    }

    const cleanupEntries = ledger.entries.filter((entry) => entry.kind === 'cleanup');
    const canonicalProofIds = [...usedCleanupIds];
    return (
      cleanupEntries.length === canonicalProofIds.length &&
      cleanupEntries.every((entry, index) => entry.commandId === canonicalProofIds[index])
    );
  } catch {
    return false;
  }
}

function isValidRawRelease(context: Mv3HarnessContext, event: Mv3HarnessEvent): boolean {
  if (
    event.type !== 'RAW_RELEASE_PROVED' ||
    !isCurrentLease(context, event) ||
    event.playwrightEpoch <= context.currentPlaywrightEpoch ||
    context.rawTransportId === null ||
    context.currentRawOperationalCommandCount === null ||
    context.currentRawOperationalLedgerSha256 === null ||
    !isRawReleaseReceipt(
      event.rawReceipt,
      event.processGeneration,
      event.leaseEpoch,
      context.rawTransportId,
      context.currentRawOperationalCommandCount,
      context.currentRawOperationalLedgerSha256
    )
  ) {
    return false;
  }
  try {
    return event.rawReceiptSha256 === sha256Jcs(event.rawReceipt);
  } catch {
    return false;
  }
}

function isProjectionRequestCurrent(context: Mv3HarnessContext, event: Mv3HarnessEvent): boolean {
  return (
    event.type === 'PLAYWRIGHT_AUTHORITY_PROJECTION_REQUESTED' &&
    isCurrentProcess(context, event) &&
    context.hasRawRelease &&
    context.currentRawAuthority !== null &&
    context.currentRawReleaseReceipt !== null &&
    context.currentRawReleaseReceiptSha256 !== null &&
    event.rawReceiptSha256 === context.currentRawReleaseReceiptSha256 &&
    event.playwrightEpoch === context.rawAuthorityPlaywrightEpoch &&
    event.playwrightEpoch > context.currentPlaywrightEpoch
  );
}

function isProjectionEventCurrent(context: Mv3HarnessContext, event: Mv3HarnessEvent): boolean {
  return (
    (event.type === 'PLAYWRIGHT_AUTHORITY_PROJECTED' ||
      event.type === 'PLAYWRIGHT_AUTHORITY_REJECTED') &&
    isCurrentProcess(context, event) &&
    context.pendingPlaywrightEpoch !== null &&
    event.playwrightEpoch === context.pendingPlaywrightEpoch &&
    context.currentRawReleaseReceiptSha256 !== null &&
    event.rawReceiptSha256 === context.currentRawReleaseReceiptSha256
  );
}

function authoritiesEqual(left: PlaywrightAuthorityV1, right: PlaywrightAuthorityV1): boolean {
  return (
    left.extensionId === right.extensionId &&
    left.registrationId === right.registrationId &&
    left.versionId === right.versionId &&
    left.scopeURL === right.scopeURL &&
    left.scriptURL === right.scriptURL &&
    left.targetId === right.targetId
  );
}

function isSourceBoundProjection(context: Mv3HarnessContext, event: Mv3HarnessEvent): boolean {
  if (
    event.type !== 'PLAYWRIGHT_AUTHORITY_PROJECTED' ||
    !isProjectionEventCurrent(context, event) ||
    context.currentRawAuthority === null
  ) {
    return false;
  }
  const eventProjection = parsePlaywrightAuthorityV1(event.authority);
  const sourceProjection = projectPlaywrightAuthorityV1(context.currentRawAuthority);
  return (
    eventProjection.ok &&
    sourceProjection.ok &&
    authoritiesEqual(eventProjection.authority, sourceProjection.authority) &&
    event.authorityProjectionSha256 === eventProjection.authorityProjectionSha256 &&
    event.authorityProjectionSha256 === sourceProjection.authorityProjectionSha256
  );
}

function isCurrentProjectionRejection(context: Mv3HarnessContext, event: Mv3HarnessEvent): boolean {
  return (
    event.type === 'PLAYWRIGHT_AUTHORITY_REJECTED' &&
    isProjectionEventCurrent(context, event) &&
    isPlaywrightAuthorityProjectionErrorV1(event.error)
  );
}

function deepFreezeTrusted<T>(value: T, seen = new Set<object>()): Readonly<T> {
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      deepFreezeTrusted(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}

const machineSetup = setup({
  types: {
    context: {} as Mv3HarnessContext,
    events: {} as Mv3HarnessEvent,
  },
  guards: {
    currentProcess: ({ context, event }) => isCurrentProcess(context, event),
    currentLease: ({ context, event }) => isCurrentLease(context, event),
    rawEndpointVerified: ({ context, event }) =>
      isCurrentLease(context, event) && context.rawTransportOpened,
    validRawBootstrapAuthority: ({ context, event }) =>
      event.type === 'RAW_BOOTSTRAP_PROVED' &&
      isCurrentLease(context, event) &&
      context.rawTransportOpened &&
      context.rawTransportId !== null &&
      isSha256(event.receiptSha256) &&
      isPositiveSafeInteger(event.operationalCommandCount) &&
      isSha256(event.operationalLedgerSha256),
    validRawRelease: ({ context, event }) => isValidRawRelease(context, event),
    currentProjectionRequest: ({ context, event }) => isProjectionRequestCurrent(context, event),
    sourceBoundProjection: ({ context, event }) => isSourceBoundProjection(context, event),
    currentProjectionRejection: ({ context, event }) =>
      isCurrentProjectionRejection(context, event),
  },
  actions: {
    blockVerdict: assign({ verdict: 'blocked' }),
    rememberRawTransport: assign(({ event }) =>
      event.type === 'RAW_TRANSPORT_OPENED'
        ? { rawTransportId: event.transportId, rawTransportOpened: true }
        : {}
    ),
    retainRawOperationalAuthority: assign(({ event }) =>
      event.type === 'RAW_BOOTSTRAP_PROVED'
        ? {
            currentRawBootstrapReceiptSha256: event.receiptSha256,
            currentRawOperationalCommandCount: event.operationalCommandCount,
            currentRawOperationalLedgerSha256: event.operationalLedgerSha256,
          }
        : {}
    ),
    releaseRaw: assign(({ event }) => {
      if (event.type !== 'RAW_RELEASE_PROVED') {
        return {};
      }
      return {
        hasRawRelease: true,
        rawMode: null,
        rawTransportId: null,
        rawTransportOpened: false,
        currentRawAuthority: deepFreezeTrusted(event.authority) as Readonly<RawWorkerAuthority>,
        currentRawReleaseReceipt: deepFreezeTrusted(
          event.rawReceipt
        ) as Readonly<RawReleaseReceipt>,
        currentRawReleaseReceiptSha256: event.rawReceiptSha256,
        rawAuthorityPlaywrightEpoch: event.playwrightEpoch,
        pendingPlaywrightEpoch: null,
        currentPlaywrightAuthority: null,
        authorityProjectionSha256: null,
        authorityProjectionError: null,
        noOwnerReleaseReceipt: null,
      };
    }),
    beginProjection: assign(({ event }) =>
      event.type === 'PLAYWRIGHT_AUTHORITY_PROJECTION_REQUESTED'
        ? {
            pendingPlaywrightEpoch: event.playwrightEpoch,
            currentPlaywrightAuthority: null,
            authorityProjectionSha256: null,
            authorityProjectionError: null,
            noOwnerReleaseReceipt: null,
          }
        : {}
    ),
    retainProjection: assign(({ event }) => {
      if (event.type !== 'PLAYWRIGHT_AUTHORITY_PROJECTED') {
        return {};
      }
      const parsed = parsePlaywrightAuthorityV1(event.authority);
      if (!parsed.ok) {
        return {};
      }
      return {
        currentPlaywrightAuthority: parsed.authority,
        authorityProjectionSha256: parsed.authorityProjectionSha256,
        authorityProjectionError: null,
      };
    }),
    retainProjectionRejection: assign(({ context, event }) => {
      if (
        event.type !== 'PLAYWRIGHT_AUTHORITY_REJECTED' ||
        !isPlaywrightAuthorityProjectionErrorV1(event.error)
      ) {
        return {};
      }
      return {
        authorityProjectionError: Object.freeze({ ...event.error }),
        noOwnerReleaseReceipt: createNoOwnerReleaseReceiptV1({
          processGeneration: event.processGeneration,
          playwrightEpoch: event.playwrightEpoch,
          rawReceiptSha256: event.rawReceiptSha256,
        }),
        currentPlaywrightAuthority: null,
        authorityProjectionSha256: null,
        currentLeaseEpoch: context.currentLeaseEpoch,
        playwrightTransportId: null,
        playwrightTransportOpened: false,
      };
    }),
  },
});

const rawConnectingState = (nextTarget: string) => ({
  on: {
    RAW_TRANSPORT_OPENED: {
      guard: 'currentLease' as const,
      actions: 'rememberRawTransport' as const,
    },
    ENDPOINT_VERIFIED: {
      guard: 'rawEndpointVerified' as const,
      target: nextTarget,
    },
  },
});

const rawOwnedState = (nextTarget: string) => ({
  on: {
    RAW_BOOTSTRAP_PROVED: {
      guard: 'validRawBootstrapAuthority' as const,
      actions: 'retainRawOperationalAuthority' as const,
      target: nextTarget,
    },
  },
});

const rawReleasingState = {
  on: {
    RAW_RELEASE_PROVED: {
      guard: 'validRawRelease' as const,
      target: '#ownerNone',
      actions: 'releaseRaw' as const,
    },
  },
};

export const mv3HarnessMachine = machineSetup.createMachine({
  id: 'mv3Harness',
  initial: 'absent',
  context: initialContext,
  states: {
    absent: {
      on: { HARNESS_STARTED: 'artifact_sealing' },
    },
    artifact_sealing: {
      on: { ARTIFACT_SEALED: 'profile_creating' },
    },
    profile_creating: {
      on: {
        PROFILE_CREATED: {
          target: 'process_spawning',
          actions: assign(({ event }) =>
            event.type === 'PROFILE_CREATED' ? { profileId: event.profileId } : {}
          ),
        },
      },
    },
    process_spawning: {
      on: {
        PROCESS_SPAWNED: {
          target: 'endpoint_waiting',
          actions: assign(({ event }) =>
            event.type === 'PROCESS_SPAWNED'
              ? { processGeneration: event.processGeneration, pid: event.pid }
              : {}
          ),
        },
      },
    },
    endpoint_waiting: {
      on: {
        ENDPOINT_PARSED: {
          guard: ({ context, event }) => isCurrentProcess(context, event),
          target: 'owner_none',
        },
      },
    },
    owner_none: {
      id: 'ownerNone',
      on: {
        RAW_ACQUIRE_REQUESTED: [
          {
            guard: ({ context, event }) =>
              isCurrentProcess(context, event) &&
              event.type === 'RAW_ACQUIRE_REQUESTED' &&
              event.mode === 'initial_bootstrap' &&
              !context.hasRawRelease &&
              !context.restartPending &&
              event.leaseEpoch > context.currentLeaseEpoch,
            target: 'raw_connecting.initial_bootstrap',
            actions: assign(({ event }) =>
              event.type === 'RAW_ACQUIRE_REQUESTED'
                ? {
                    currentLeaseEpoch: event.leaseEpoch,
                    rawMode: event.mode,
                    rawTransportId: null,
                    rawTransportOpened: false,
                    currentRawBootstrapReceiptSha256: null,
                    currentRawOperationalCommandCount: null,
                    currentRawOperationalLedgerSha256: null,
                    hasRawRelease: false,
                    currentRawAuthority: null,
                    currentRawReleaseReceipt: null,
                    currentRawReleaseReceiptSha256: null,
                    rawAuthorityPlaywrightEpoch: null,
                  }
                : {}
            ),
          },
          {
            guard: ({ context, event }) =>
              isCurrentProcess(context, event) &&
              event.type === 'RAW_ACQUIRE_REQUESTED' &&
              event.mode === 'runtime_restart' &&
              context.restartPending &&
              event.leaseEpoch > context.currentLeaseEpoch,
            target: 'raw_connecting.runtime_restart',
            actions: assign(({ event }) =>
              event.type === 'RAW_ACQUIRE_REQUESTED'
                ? {
                    currentLeaseEpoch: event.leaseEpoch,
                    rawMode: event.mode,
                    rawTransportId: null,
                    rawTransportOpened: false,
                    currentRawBootstrapReceiptSha256: null,
                    currentRawOperationalCommandCount: null,
                    currentRawOperationalLedgerSha256: null,
                    hasRawRelease: false,
                    currentRawAuthority: null,
                    currentRawReleaseReceipt: null,
                    currentRawReleaseReceiptSha256: null,
                    rawAuthorityPlaywrightEpoch: null,
                  }
                : {}
            ),
          },
        ],
        PLAYWRIGHT_AUTHORITY_PROJECTION_REQUESTED: {
          guard: 'currentProjectionRequest',
          target: 'playwright_authority_projecting',
          actions: 'beginProjection',
        },
      },
    },
    raw_connecting: {
      initial: 'initial_bootstrap',
      states: {
        initial_bootstrap: {
          id: 'rawConnectingInitial',
          ...rawConnectingState('#rawOwnedInitial'),
        },
        runtime_restart: {
          id: 'rawConnectingRuntime',
          ...rawConnectingState('#rawOwnedRuntime'),
        },
      },
    },
    raw_owned: {
      initial: 'initial_bootstrap',
      states: {
        initial_bootstrap: {
          id: 'rawOwnedInitial',
          ...rawOwnedState('#rawReleasingInitial'),
        },
        runtime_restart: {
          id: 'rawOwnedRuntime',
          ...rawOwnedState('#rawReleasingRuntime'),
        },
      },
    },
    raw_releasing: {
      initial: 'initial_bootstrap',
      states: {
        initial_bootstrap: {
          id: 'rawReleasingInitial',
          ...rawReleasingState,
        },
        runtime_restart: {
          id: 'rawReleasingRuntime',
          ...rawReleasingState,
        },
      },
    },
    playwright_authority_projecting: {
      on: {
        PLAYWRIGHT_AUTHORITY_PROJECTED: {
          guard: 'sourceBoundProjection',
          target: 'playwright_authority_ready',
          actions: 'retainProjection',
        },
        PLAYWRIGHT_AUTHORITY_REJECTED: {
          guard: 'currentProjectionRejection',
          target: 'failed_shutdown_connecting',
          actions: 'retainProjectionRejection',
        },
      },
    },
    playwright_authority_ready: {
      on: {
        PLAYWRIGHT_RESERVE_REQUESTED: {
          guard: ({ context, event }) =>
            event.type === 'PLAYWRIGHT_RESERVE_REQUESTED' &&
            isCurrentProcess(context, event) &&
            context.pendingPlaywrightEpoch !== null &&
            event.playwrightEpoch === context.pendingPlaywrightEpoch &&
            event.playwrightEpoch > context.currentPlaywrightEpoch &&
            event.leaseEpoch > context.currentLeaseEpoch &&
            context.currentPlaywrightAuthority !== null &&
            context.authorityProjectionSha256 !== null &&
            event.authorityProjectionSha256 === context.authorityProjectionSha256,
          target: 'playwright_connecting',
          actions: assign(({ event }) =>
            event.type === 'PLAYWRIGHT_RESERVE_REQUESTED'
              ? {
                  currentLeaseEpoch: event.leaseEpoch,
                  currentPlaywrightEpoch: event.playwrightEpoch,
                  playwrightTransportId: null,
                  playwrightTransportOpened: false,
                }
              : {}
          ),
        },
      },
    },
    playwright_connecting: {
      on: {
        PLAYWRIGHT_TRANSPORT_OPENED: {
          guard: ({ context, event }) => isCurrentPlaywright(context, event),
          actions: assign(({ event }) =>
            event.type === 'PLAYWRIGHT_TRANSPORT_OPENED'
              ? {
                  playwrightTransportId: event.transportId,
                  playwrightTransportOpened: true,
                }
              : {}
          ),
        },
        PLAYWRIGHT_HANDOFF_PROVED: {
          guard: ({ context, event }) =>
            isCurrentPlaywright(context, event) && context.playwrightTransportOpened,
          target: 'playwright_owned.exercising',
          actions: assign({ restartPending: false }),
        },
        PLAYWRIGHT_CONNECT_FAILED_CLOSED: {
          guard: ({ context, event }) => isCurrentProcess(context, event),
          target: 'failed_releasing',
        },
      },
    },
    playwright_owned: {
      initial: 'exercising',
      states: {
        exercising: {
          on: {
            RESTART_REQUESTED: [
              {
                guard: ({ context, event }) =>
                  event.type === 'RESTART_REQUESTED' &&
                  isCurrentProcess(context, event) &&
                  event.playwrightEpoch === context.currentPlaywrightEpoch &&
                  context.runtimeRestartCount === 0,
                target: '#playwrightReleasingRestart',
                actions: assign({ runtimeRestartCount: 1, restartPending: true }),
              },
              {
                guard: ({ context, event }) =>
                  event.type === 'RESTART_REQUESTED' &&
                  isCurrentProcess(context, event) &&
                  event.playwrightEpoch === context.currentPlaywrightEpoch &&
                  context.runtimeRestartCount === 1,
                target: '#failedReleasing',
              },
            ],
            USE_COMPLETED: {
              guard: ({ context, event }) =>
                event.type === 'USE_COMPLETED' &&
                isCurrentProcess(context, event) &&
                event.playwrightEpoch === context.currentPlaywrightEpoch,
              target: '#diagnosticsSettling',
            },
            USE_FAILED: {
              guard: ({ context, event }) => isCurrentProcess(context, event),
              target: '#failedReleasing',
              actions: 'blockVerdict',
            },
          },
        },
      },
    },
    playwright_releasing: {
      initial: 'restart',
      states: {
        restart: {
          id: 'playwrightReleasingRestart',
          on: {
            PLAYWRIGHT_RELEASE_PROVED: {
              guard: ({ context, event }) => isCurrentPlaywright(context, event),
              target: '#ownerNone',
              actions: assign({
                playwrightTransportId: null,
                playwrightTransportOpened: false,
                pendingPlaywrightEpoch: null,
                currentPlaywrightAuthority: null,
                authorityProjectionSha256: null,
              }),
            },
          },
        },
        final: {
          id: 'playwrightReleasingFinal',
          on: {
            PLAYWRIGHT_RELEASE_PROVED: [
              {
                guard: ({ context, event }) =>
                  isCurrentPlaywright(context, event) && context.verdict === 'eligible',
                target: '#shutdownConnecting',
                actions: assign({
                  playwrightTransportId: null,
                  playwrightTransportOpened: false,
                  pendingPlaywrightEpoch: null,
                  currentPlaywrightAuthority: null,
                  authorityProjectionSha256: null,
                }),
              },
              {
                guard: ({ context, event }) =>
                  isCurrentPlaywright(context, event) && context.verdict === 'blocked',
                target: '#failedShutdownConnecting',
              },
            ],
          },
        },
      },
    },
    diagnostics_settling: {
      id: 'diagnosticsSettling',
      on: {
        APPLICATION_DIAGNOSTIC_RECORDED: { actions: 'blockVerdict' },
        EVIDENCE_OVERFLOW_RECORDED: { actions: 'blockVerdict' },
        OBSERVER_PROTOCOL_FAILED: {
          target: 'failed_releasing',
          actions: 'blockVerdict',
        },
        DIAGNOSTICS_ACCEPTED: {
          guard: ({ context, event }) =>
            isCurrentProcess(context, event) && context.verdict === 'eligible',
          target: 'artifact_reverifying',
        },
        DIAGNOSTICS_REJECTED: {
          guard: ({ context, event }) => isCurrentProcess(context, event),
          target: 'failed_releasing',
          actions: 'blockVerdict',
        },
      },
    },
    artifact_reverifying: {
      on: {
        APPLICATION_DIAGNOSTIC_RECORDED: {
          target: 'failed_releasing',
          actions: 'blockVerdict',
        },
        EVIDENCE_OVERFLOW_RECORDED: {
          target: 'failed_releasing',
          actions: 'blockVerdict',
        },
        ARTIFACT_MATCHED: {
          guard: ({ context, event }) =>
            isCurrentProcess(context, event) && context.verdict === 'eligible',
          target: 'playwright_releasing.final',
        },
        ARTIFACT_CHANGED: {
          target: 'failed_releasing',
          actions: 'blockVerdict',
        },
      },
    },
    shutdown_connecting: {
      id: 'shutdownConnecting',
      on: {
        SHUTDOWN_TRANSPORT_OPENED: {
          guard: ({ context, event }) =>
            event.type === 'SHUTDOWN_TRANSPORT_OPENED' &&
            isCurrentProcess(context, event) &&
            event.leaseEpoch > context.currentLeaseEpoch,
          actions: assign(({ event }) =>
            event.type === 'SHUTDOWN_TRANSPORT_OPENED'
              ? {
                  currentLeaseEpoch: event.leaseEpoch,
                  shutdownTransportId: event.transportId,
                  shutdownCommandId: null,
                  shutdownCloseProved: false,
                }
              : {}
          ),
        },
        SHUTDOWN_ENDPOINT_VERIFIED: {
          guard: ({ context, event }) =>
            event.type === 'SHUTDOWN_ENDPOINT_VERIFIED' &&
            isCurrentLease(context, event) &&
            event.transportId === context.shutdownTransportId,
          target: 'shutdown_owned',
          actions: assign(({ event }) =>
            event.type === 'SHUTDOWN_ENDPOINT_VERIFIED'
              ? { shutdownCommandId: event.commandId }
              : {}
          ),
        },
      },
    },
    shutdown_owned: {
      on: {
        SHUTDOWN_BROWSER_CLOSE_RESOLVED: {
          guard: ({ context, event }) =>
            event.type === 'SHUTDOWN_BROWSER_CLOSE_RESOLVED' &&
            isCurrentLease(context, event) &&
            event.transportId === context.shutdownTransportId &&
            event.commandId === context.shutdownCommandId,
          actions: assign({ shutdownCloseProved: true }),
        },
        SHUTDOWN_SOCKET_CLOSED_AFTER_COMMAND: {
          guard: ({ context, event }) =>
            event.type === 'SHUTDOWN_SOCKET_CLOSED_AFTER_COMMAND' &&
            isCurrentLease(context, event) &&
            event.transportId === context.shutdownTransportId &&
            event.commandId === context.shutdownCommandId &&
            event.dispatchedAt <= event.socketClosedAt,
          actions: assign({ shutdownCloseProved: true }),
        },
        PROCESS_EXITED: [
          {
            guard: ({ context, event }) =>
              event.type === 'PROCESS_EXITED' &&
              isCurrentProcess(context, event) &&
              event.pid === context.pid &&
              context.shutdownCloseProved,
            target: 'profile_removing',
          },
          {
            guard: ({ context, event }) =>
              event.type === 'PROCESS_EXITED' &&
              isCurrentProcess(context, event) &&
              event.pid === context.pid &&
              !context.shutdownCloseProved,
            target: 'failed_profile_removing',
            actions: 'blockVerdict',
          },
        ],
      },
    },
    profile_removing: {
      on: {
        APPLICATION_DIAGNOSTIC_RECORDED: { actions: 'blockVerdict' },
        EVIDENCE_OVERFLOW_RECORDED: { actions: 'blockVerdict' },
        OBSERVER_PROTOCOL_FAILED: { actions: 'blockVerdict' },
        PROFILE_REMOVED: [
          {
            guard: ({ context, event }) =>
              isCurrentProcess(context, event) && context.verdict === 'eligible',
            target: 'passed',
          },
          {
            guard: ({ context, event }) =>
              isCurrentProcess(context, event) && context.verdict === 'blocked',
            target: 'archived',
          },
        ],
      },
    },
    passed: {
      on: {
        APPLICATION_DIAGNOSTIC_RECORDED: {
          target: 'passed_blocked',
          actions: 'blockVerdict',
        },
        EVIDENCE_OVERFLOW_RECORDED: {
          target: 'passed_blocked',
          actions: 'blockVerdict',
        },
        OBSERVER_PROTOCOL_FAILED: {
          target: 'passed_blocked',
          actions: 'blockVerdict',
        },
        VERDICT_ARCHIVED: {
          guard: ({ context, event }) =>
            isCurrentProcess(context, event) && context.verdict === 'eligible',
          target: 'archived',
        },
      },
    },
    passed_blocked: {
      on: {
        VERDICT_ARCHIVED: {
          guard: ({ context, event }) => isCurrentProcess(context, event),
          target: 'archived',
        },
      },
    },
    failed_releasing: {
      id: 'failedReleasing',
      entry: 'blockVerdict',
    },
    failed_shutdown_connecting: {
      id: 'failedShutdownConnecting',
      entry: 'blockVerdict',
    },
    failed_shutdown: {
      entry: 'blockVerdict',
    },
    failed_profile_removing: {
      entry: 'blockVerdict',
      on: {
        PROFILE_REMOVED: {
          guard: ({ context, event }) => isCurrentProcess(context, event),
          target: 'archived',
        },
      },
    },
    archived: { type: 'final' },
  },
});
