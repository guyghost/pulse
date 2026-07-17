import type { BrowserContext, CDPSession, Page, Worker } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  recordConsoleDiagnostic,
  recordWorkerException,
  type RuntimeDiagnostics,
} from './diagnostics';

interface ProtocolMessage {
  readonly id?: number;
  readonly method?: string;
  readonly params?: unknown;
  readonly result?: unknown;
  readonly error?: unknown;
  readonly sessionId?: string;
}

interface PendingCommand {
  readonly resolve: (result: unknown) => void;
  readonly reject: (error: Error) => void;
}

interface BootstrapWaiter {
  readonly probeExpression: string | undefined;
  readonly generation: number;
  readonly authority: RestartAuthority;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
  readonly candidates: CorrelatedExecutionContext[];
  claimed: boolean;
  correlated: CorrelatedExecutionContext | undefined;
  executionContextClaim: CorrelatedExecutionContext | undefined;
  replacementVersionTargetId: string | undefined;
}

interface AttachedTarget {
  readonly sessionId: string;
  readonly targetId: string;
  readonly type: string;
  readonly url: string;
  readonly waitingForDebugger: boolean;
}

interface CorrelatedExecutionContext {
  readonly generation: number;
  readonly attachmentGeneration: number;
  readonly targetId: string;
  readonly sessionId: string;
  readonly uniqueId: string;
}

interface AttachedSessionCorrelation {
  readonly targetId: string;
  readonly attachmentGeneration: number;
}

interface AttachmentIdentity {
  readonly targetId: string;
  readonly sessionId: string;
  readonly attachmentGeneration: number;
}

type WorkerLifecycleStatus =
  'new' | 'installing' | 'installed' | 'activating' | 'activated' | 'redundant';

type WorkerRunningStatus = 'stopped' | 'starting' | 'running' | 'stopping';

interface WorkerVersionState {
  readonly versionId: string;
  readonly registrationId: string;
  readonly scriptURL: string;
  readonly targetId: string | undefined;
  readonly status: WorkerLifecycleStatus;
  readonly runningStatus: WorkerRunningStatus;
}

interface WorkerVersionIdentity extends WorkerVersionState {
  readonly targetId: string;
}

interface RestartAuthority {
  readonly versionId: string;
  readonly registrationId: string;
  readonly scopeURL: string;
  readonly scriptURL: string;
  readonly targetId: string;
}

interface RestartReadiness {
  readonly branch: 'controlled' | 'natural';
  readonly attachment: AttachmentIdentity;
  readonly authority: RestartAuthority;
}

interface OwnedPausedAttachment extends AttachmentIdentity {
  detached: boolean;
  resumed: boolean;
}

interface DeferredSignal {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

type RestartQuiescencePhase =
  | 'waiting-stopped'
  | 'waiting-detach'
  | 'waiting-absence'
  | 'auto-attach-arming'
  | 'auto-attach-armed';

interface RestartQuiescence {
  readonly attachment: AttachmentIdentity;
  readonly authority: RestartAuthority;
  readonly deadline: number;
  readonly stopped: DeferredSignal;
  readonly failure: DeferredSignal;
  readonly timeout: ReturnType<typeof setTimeout>;
  phase: RestartQuiescencePhase;
  detachment: DeferredSignal | undefined;
  absenceWake: DeferredSignal | undefined;
  stoppedObserved: boolean;
  failed: boolean;
}

const targetFilter = [{ type: 'service_worker', exclude: false }, { exclude: true }] as const;
const rootAutoAttachParams = Object.freeze({
  autoAttach: true,
  waitForDebuggerOnStart: true,
  flatten: true,
  filter: [...targetFilter],
});
const rootAutoAttachDisarmParams = Object.freeze({
  autoAttach: false,
  waitForDebuggerOnStart: false,
  flatten: true,
});
const MAX_UNIQUE_CONTEXT_ID_UTF8_BYTES = 4_096;
const MAX_PENDING_BOOTSTRAP_CANDIDATES = 32;
const CLEANUP_COMMAND_TIMEOUT_MS = 1_000;
const WORKER_IDENTITY_HANDSHAKE_EXPRESSION =
  '(() => ({ workerUrl: globalThis.location.href, registrationScope: globalThis.registration.scope }))()';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isWorkerLifecycleStatus(value: unknown): value is WorkerLifecycleStatus {
  return (
    value === 'new' ||
    value === 'installing' ||
    value === 'installed' ||
    value === 'activating' ||
    value === 'activated' ||
    value === 'redundant'
  );
}

function isWorkerRunningStatus(value: unknown): value is WorkerRunningStatus {
  return value === 'stopped' || value === 'starting' || value === 'running' || value === 'stopping';
}

function readWorkerVersionState(value: unknown): WorkerVersionState | undefined {
  if (
    !isRecord(value) ||
    typeof value.versionId !== 'string' ||
    typeof value.registrationId !== 'string' ||
    typeof value.scriptURL !== 'string' ||
    !isWorkerLifecycleStatus(value.status) ||
    !isWorkerRunningStatus(value.runningStatus) ||
    (value.targetId !== undefined && typeof value.targetId !== 'string')
  ) {
    return undefined;
  }
  return Object.freeze({
    versionId: value.versionId,
    registrationId: value.registrationId,
    scriptURL: value.scriptURL,
    targetId: value.targetId,
    status: value.status,
    runningStatus: value.runningStatus,
  });
}

function parseProtocolMessage(message: string): ProtocolMessage | undefined {
  try {
    const parsed: unknown = JSON.parse(message);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function formatProtocolError(value: unknown): string {
  if (isRecord(value) && typeof value.message === 'string') {
    return value.message;
  }
  return 'Unknown Chrome DevTools Protocol error';
}

function formatRemoteObject(value: unknown): string {
  if (!isRecord(value)) {
    return String(value);
  }
  if (typeof value.value === 'string') {
    return value.value;
  }
  if (value.value !== undefined) {
    try {
      return JSON.stringify(value.value);
    } catch {
      return String(value.value);
    }
  }
  if (typeof value.description === 'string') {
    return value.description;
  }
  if (typeof value.unserializableValue === 'string') {
    return value.unserializableValue;
  }
  return typeof value.type === 'string' ? value.type : 'unknown';
}

function exceptionMessage(params: unknown): string | undefined {
  if (!isRecord(params) || !isRecord(params.exceptionDetails)) {
    return undefined;
  }
  const details = params.exceptionDetails;
  if (isRecord(details.exception)) {
    if (typeof details.exception.description === 'string') {
      return details.exception.description;
    }
    if (typeof details.exception.value === 'string') {
      return details.exception.value;
    }
  }
  return typeof details.text === 'string' ? details.text : undefined;
}

function readAttachedTarget(params: unknown): AttachedTarget | undefined {
  if (
    !isRecord(params) ||
    typeof params.sessionId !== 'string' ||
    typeof params.waitingForDebugger !== 'boolean' ||
    !isRecord(params.targetInfo) ||
    typeof params.targetInfo.targetId !== 'string' ||
    typeof params.targetInfo.type !== 'string' ||
    typeof params.targetInfo.url !== 'string'
  ) {
    return undefined;
  }
  return {
    sessionId: params.sessionId,
    targetId: params.targetInfo.targetId,
    type: params.targetInfo.type,
    url: params.targetInfo.url,
    waitingForDebugger: params.waitingForDebugger,
  };
}

function readExecutionContextUniqueId(params: unknown): string | undefined {
  if (!isRecord(params) || !isRecord(params.context)) {
    return undefined;
  }
  const uniqueId = params.context.uniqueId;
  if (
    typeof uniqueId !== 'string' ||
    uniqueId.length === 0 ||
    uniqueId.includes('\0') ||
    uniqueId.includes('\r') ||
    uniqueId.includes('\n')
  ) {
    return undefined;
  }
  const byteLength = new TextEncoder().encode(uniqueId).byteLength;
  return byteLength <= MAX_UNIQUE_CONTEXT_ID_UTF8_BYTES ? uniqueId : undefined;
}

type ExactWorkerIdentity = {
  readonly workerUrl: string;
  readonly registrationScope: string;
};

function readExactWorkerIdentityValue(value: unknown): ExactWorkerIdentity | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== 2 ||
    !keys.includes('workerUrl') ||
    !keys.includes('registrationScope') ||
    typeof value.workerUrl !== 'string' ||
    typeof value.registrationScope !== 'string'
  ) {
    return undefined;
  }
  return {
    workerUrl: value.workerUrl,
    registrationScope: value.registrationScope,
  };
}

function readExactWorkerIdentity(value: unknown): ExactWorkerIdentity | undefined {
  if (
    !isRecord(value) ||
    Object.prototype.hasOwnProperty.call(value, 'exceptionDetails') ||
    !isRecord(value.result) ||
    !Object.prototype.hasOwnProperty.call(value.result, 'value')
  ) {
    return undefined;
  }
  return readExactWorkerIdentityValue(value.result.value);
}

function isExactWorkerIdentity(
  identity: ReturnType<typeof readExactWorkerIdentity>,
  extensionId: string,
  expectedWorkerUrl: string | undefined
): boolean {
  if (!identity || identity.workerUrl !== expectedWorkerUrl) {
    return false;
  }
  try {
    const workerUrl = new URL(identity.workerUrl);
    const registrationScope = new URL(identity.registrationScope);
    return (
      workerUrl.protocol === 'chrome-extension:' &&
      registrationScope.protocol === 'chrome-extension:' &&
      workerUrl.hostname === extensionId &&
      registrationScope.hostname === extensionId &&
      registrationScope.pathname === '/' &&
      registrationScope.search === '' &&
      registrationScope.hash === '' &&
      identity.registrationScope === `chrome-extension://${extensionId}/`
    );
  } catch {
    return false;
  }
}

function eventLogEntry(message: ProtocolMessage): string {
  if (message.method?.startsWith('Runtime.executionContext')) {
    return `${message.method}:${message.sessionId ?? 'no-session'}`;
  }
  return `${message.method}:${JSON.stringify(message.params)?.slice(0, 500) ?? ''}`;
}

function targetIds(result: unknown, extensionId: string): Set<string> {
  if (!isRecord(result) || !Array.isArray(result.targetInfos)) {
    return new Set();
  }
  return new Set(
    result.targetInfos.flatMap((target) => {
      if (
        !isRecord(target) ||
        typeof target.targetId !== 'string' ||
        typeof target.type !== 'string' ||
        typeof target.url !== 'string' ||
        target.type !== 'service_worker' ||
        !isExtensionServiceWorkerUrl(target.url, extensionId)
      ) {
        return [];
      }
      return [target.targetId];
    })
  );
}

function targetResultContainsId(result: unknown, targetId: string): boolean {
  if (!isRecord(result) || !Array.isArray(result.targetInfos)) {
    throw new Error('Target.getTargets returned no targetInfos array.');
  }
  const observedTargetIds = new Set<string>();
  for (const target of result.targetInfos) {
    if (
      !isRecord(target) ||
      typeof target.targetId !== 'string' ||
      typeof target.type !== 'string' ||
      typeof target.url !== 'string' ||
      target.type !== 'service_worker'
    ) {
      throw new Error('Target.getTargets returned a malformed filtered service-worker identity.');
    }
    if (observedTargetIds.has(target.targetId)) {
      throw new Error('Target.getTargets returned a duplicate service-worker target identity.');
    }
    observedTargetIds.add(target.targetId);
    if (target.targetId === targetId) {
      return true;
    }
  }
  return false;
}

function createDeferredSignal(): DeferredSignal {
  let resolveSignal!: () => void;
  let rejectSignal!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolveSignal = resolvePromise;
    rejectSignal = rejectPromise;
  });
  return { promise, resolve: resolveSignal, reject: rejectSignal };
}

function isExtensionServiceWorkerUrl(url: string, extensionId: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'chrome-extension:' && parsed.hostname === extensionId;
  } catch {
    return false;
  }
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

class RawCdpClient {
  readonly #socket: WebSocket;
  readonly #pending = new Map<number, PendingCommand>();
  readonly #eventListeners = new Set<(message: ProtocolMessage) => void>();
  #commandId = 0;

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        this.#handleMessage(event.data);
      }
    });
    socket.addEventListener('close', () => {
      this.#rejectPending(new Error('Browser CDP WebSocket closed before replying.'));
    });
  }

  static async connect(webSocketUrl: string): Promise<RawCdpClient> {
    const socket = new WebSocket(webSocketUrl);
    await new Promise<void>((resolvePromise, rejectPromise) => {
      let settled = false;
      const rejectAndClose = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        try {
          socket.close();
        } catch {
          // The original connection error remains authoritative.
        }
        rejectPromise(error);
      };
      const timeout = setTimeout(
        () => rejectAndClose(new Error('Timed out connecting to the browser CDP WebSocket.')),
        10_000
      );
      socket.addEventListener(
        'open',
        () => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeout);
          resolvePromise();
        },
        { once: true }
      );
      socket.addEventListener(
        'error',
        () => {
          rejectAndClose(new Error('Browser CDP WebSocket connection failed.'));
        },
        { once: true }
      );
    });
    return new RawCdpClient(socket);
  }

  onEvent(listener: (message: ProtocolMessage) => void): void {
    this.#eventListeners.add(listener);
  }

  send(method: string, params: object = {}, sessionId?: string): Promise<unknown> {
    if (this.#socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Browser CDP WebSocket is not open.'));
    }
    const id = ++this.#commandId;
    return new Promise<unknown>((resolvePromise, rejectPromise) => {
      this.#pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
      this.#socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        })
      );
    });
  }

  close(): void {
    this.#rejectPending(new Error('Browser CDP WebSocket closed by the bootstrap observer.'));
    this.#socket.close();
  }

  #rejectPending(error: Error): void {
    for (const command of this.#pending.values()) {
      command.reject(error);
    }
    this.#pending.clear();
  }

  #handleMessage(rawMessage: string): void {
    const message = parseProtocolMessage(rawMessage);
    if (!message) {
      return;
    }
    if (typeof message.id === 'number') {
      const command = this.#pending.get(message.id);
      if (!command) {
        return;
      }
      this.#pending.delete(message.id);
      if (message.error !== undefined) {
        command.reject(new Error(formatProtocolError(message.error)));
      } else {
        command.resolve(message.result);
      }
      return;
    }
    for (const listener of this.#eventListeners) {
      listener(message);
    }
  }
}

export async function waitForBrowserCdpWebSocket(
  userDataDir: string,
  timeoutMs = 10_000
): Promise<string> {
  const activePortPath = join(userDataDir, 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const [port, browserPath] = (await readFile(activePortPath, 'utf8')).trim().split(/\r?\n/);
      if (port && browserPath) {
        return `ws://127.0.0.1:${port}${browserPath}`;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw new Error(
    `Chromium did not expose ${activePortPath}: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

export class ServiceWorkerBootstrapObserver {
  readonly #context: BrowserContext;
  readonly #diagnostics: RuntimeDiagnostics;
  readonly #extensionId: string;
  readonly #instrumentWorker: (worker: Worker) => void;
  readonly #controlPage: Page;
  readonly #webSocketUrl: string;
  #client: RawCdpClient | undefined;
  #serviceWorkerCdp: CDPSession | undefined;
  #bootstrapWaiter: BootstrapWaiter | undefined;
  #restartQuiescence: RestartQuiescence | undefined;
  #preparations = new Set<Promise<void>>();
  #registrations = new Map<string, string>();
  #workerVersions = new Map<string, WorkerVersionState>();
  #activeWorkerVersion: WorkerVersionIdentity | undefined;
  #metadataFailure: Error | undefined;
  #metadataWake: DeferredSignal | undefined;
  #expectedWorkerUrl: string | undefined;
  #initialAttachmentWaitingForDebugger: boolean | undefined;
  #eventLog: string[] = [];
  #instrumentedSessionId: string | undefined;
  #executionContextObserved = false;
  #activeTargetId: string | undefined;
  #activeSessionId: string | undefined;
  #activeAttachmentGeneration: number | undefined;
  #nextAttachmentGeneration = 0;
  #restartGeneration = 0;
  #sessionTargets = new Map<string, AttachedSessionCorrelation>();
  #detachedAttachmentGenerations = new Set<number>();
  #ownedPausedAttachments = new Map<number, OwnedPausedAttachment>();
  #cleanupDetachmentWaiters = new Map<number, DeferredSignal>();
  #observedUniqueContextIds = new Set<string>();
  #initialContextClaim: CorrelatedExecutionContext | undefined;
  #lastCorrelatedExecutionContext: CorrelatedExecutionContext | undefined;
  #autoAttachAuthorityCreated = false;
  #rootAutoAttachArmed = false;
  #stopPromise: Promise<void> | undefined;

  constructor(options: {
    context: BrowserContext;
    controlPage: Page;
    diagnostics: RuntimeDiagnostics;
    extensionId: string;
    instrumentWorker: (worker: Worker) => void;
    webSocketUrl: string;
  }) {
    this.#context = options.context;
    this.#controlPage = options.controlPage;
    this.#diagnostics = options.diagnostics;
    this.#extensionId = options.extensionId;
    this.#instrumentWorker = options.instrumentWorker;
    this.#webSocketUrl = options.webSocketUrl;
  }

  async start(): Promise<void> {
    const client = await RawCdpClient.connect(this.#webSocketUrl);
    this.#client = client;
    client.onEvent((message) => this.#handleEvent(message));
    await client.send('Target.setDiscoverTargets', {
      discover: true,
      filter: [...targetFilter],
    });
    const initialTargetIds = targetIds(
      await client.send('Target.getTargets', { filter: [...targetFilter] }),
      this.#extensionId
    );
    if (initialTargetIds.size !== 1) {
      throw new Error(
        `Expected one packaged service-worker target before instrumentation, found ${initialTargetIds.size}.`
      );
    }
    this.#autoAttachAuthorityCreated = true;
    await client.send('Target.autoAttachRelated', {
      targetId: [...initialTargetIds][0],
      waitForDebuggerOnStart: true,
      filter: [...targetFilter],
    });
    await this.#waitForInstrumentedSession();
    if (this.#initialAttachmentWaitingForDebugger !== false) {
      await this.#waitForExecutionContext();
    }
    const serviceWorkerCdp = await this.#context.newCDPSession(this.#controlPage);
    this.#serviceWorkerCdp = serviceWorkerCdp;
    serviceWorkerCdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
      this.#appendEventLog('ServiceWorker.workerRegistrationUpdated', { registrations });
      for (const registration of registrations) {
        this.#recordRegistrationUpdate(registration);
      }
    });
    serviceWorkerCdp.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
      this.#appendEventLog('ServiceWorker.workerVersionUpdated', { versions });
      for (const version of versions) {
        this.#recordWorkerVersionUpdate(version);
      }
    });
    serviceWorkerCdp.on('ServiceWorker.workerErrorReported', ({ errorMessage }) => {
      this.#appendEventLog('ServiceWorker.workerErrorReported', { errorMessage });
      if (isExtensionServiceWorkerUrl(errorMessage.sourceURL, this.#extensionId)) {
        recordWorkerException(this.#diagnostics, errorMessage.errorMessage);
      }
    });
    await serviceWorkerCdp.send('ServiceWorker.enable');
  }

  async restart(currentWorker: Worker, probeExpression?: string): Promise<Worker> {
    if (this.#bootstrapWaiter || this.#restartQuiescence) {
      throw new Error('A packaged service-worker bootstrap is already pending.');
    }
    const serviceWorkerCdp = this.#requireServiceWorkerCdp();
    const restartDeadline = Date.now() + 20_000;
    const preStopAttachment = this.#snapshotActiveAttachment();
    let readiness = await this.#waitForRestartReadiness(preStopAttachment, restartDeadline);
    while (
      readiness.branch === 'controlled' &&
      !this.#isExactAttachmentActive(readiness.attachment)
    ) {
      if (!this.#isAttachmentDetached(readiness.attachment)) {
        throw new Error('The controlled-stop attachment changed without exact revocation.');
      }
      readiness = await this.#waitForRestartReadiness(preStopAttachment, restartDeadline);
    }
    const { authority } = readiness;
    const quiescence = this.#armRestartQuiescence(
      preStopAttachment,
      authority,
      restartDeadline,
      readiness.branch === 'natural' ? 'waiting-absence' : 'waiting-stopped'
    );
    try {
      if (readiness.branch === 'controlled') {
        this.#assertControlledStopCommit(readiness);
        await this.#awaitQuiescence(
          quiescence,
          Promise.all([
            serviceWorkerCdp.send('ServiceWorker.stopWorker', {
              versionId: authority.versionId,
            }),
            quiescence.stopped.promise,
          ]).then(() => undefined)
        );
        this.#assertRestartAuthorityContinuity(quiescence);
        await this.#releaseStoppedAttachment(quiescence);
      } else {
        quiescence.stoppedObserved = true;
      }
      this.#assertRestartAuthorityContinuity(quiescence);
      quiescence.phase = 'auto-attach-arming';
      await this.#awaitQuiescence(
        quiescence,
        this.#requireClient().send('Target.setAutoAttach', rootAutoAttachParams)
      );
      this.#rootAutoAttachArmed = true;
      quiescence.phase = 'auto-attach-armed';
      this.#assertRestartAuthorityContinuity(quiescence);
      await this.#assertOldTargetAbsentNow(quiescence);
      this.#assertRestartAuthorityContinuity(quiescence);
      const remainingBootstrapTime = restartDeadline - Date.now();
      if (remainingBootstrapTime <= 0) {
        throw this.#restartTimeoutError('replacement service-worker bootstrap');
      }
      const generation = ++this.#restartGeneration;
      const bootstrapPrepared = new Promise<void>((resolvePromise, rejectPromise) => {
        const timeout = setTimeout(() => {
          if (this.#bootstrapWaiter?.timeout === timeout) {
            this.#bootstrapWaiter.candidates.length = 0;
            this.#bootstrapWaiter = undefined;
          }
          rejectPromise(
            this.#restartTimeoutError('instrumented replacement service-worker bootstrap')
          );
        }, remainingBootstrapTime);
        this.#bootstrapWaiter = {
          probeExpression,
          generation,
          authority,
          resolve: resolvePromise,
          reject: rejectPromise,
          timeout,
          candidates: [],
          claimed: false,
          correlated: undefined,
          executionContextClaim: undefined,
          replacementVersionTargetId: undefined,
        };
      });
      this.#assertRestartAuthorityContinuity(quiescence);
      this.#completeRestartQuiescence(quiescence);
      const startWorker = serviceWorkerCdp.send('ServiceWorker.startWorker', {
        scopeURL: authority.scopeURL,
      });
      await Promise.all([bootstrapPrepared, startWorker]);
      const worker = await this.#waitForReplacementWorker(currentWorker, restartDeadline);
      this.#instrumentWorker(worker);
      return worker;
    } catch (error) {
      this.#clearRestartQuiescence(quiescence);
      this.#rejectBootstrapWaiter(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async evaluateInCorrelatedContext(expression: string): Promise<unknown> {
    const correlated = this.#lastCorrelatedExecutionContext;
    if (!correlated || !this.#isCurrentPublishedContext(correlated)) {
      throw new Error('No current post-restart extension worker context is correlated.');
    }
    let evaluation: unknown;
    try {
      evaluation = await this.#requireClient().send(
        'Runtime.evaluate',
        {
          expression,
          uniqueContextId: correlated.uniqueId,
          awaitPromise: true,
          returnByValue: true,
        },
        correlated.sessionId
      );
    } catch (error) {
      if (!this.#isCurrentPublishedContext(correlated)) {
        throw new Error('Correlated worker evaluation became stale before its reply.');
      }
      throw error;
    }
    if (!this.#isCurrentPublishedContext(correlated)) {
      throw new Error('Correlated worker evaluation became stale before its reply.');
    }
    if (
      isRecord(evaluation) &&
      Object.prototype.hasOwnProperty.call(evaluation, 'exceptionDetails')
    ) {
      throw new Error(
        `Correlated worker evaluation failed: ${exceptionMessage(evaluation) ?? 'Runtime.evaluate returned exceptionDetails.'}`
      );
    }
    const evaluationError = exceptionMessage(evaluation);
    if (evaluationError) {
      throw new Error(`Correlated worker evaluation failed: ${evaluationError}`);
    }
    if (!isRecord(evaluation) || !isRecord(evaluation.result) || !('value' in evaluation.result)) {
      throw new Error('Correlated worker evaluation returned no by-value result.');
    }
    return structuredClone(evaluation.result.value);
  }

  stop(): Promise<void> {
    this.#stopPromise ??= this.#performStop();
    return this.#stopPromise;
  }

  async #performStop(): Promise<void> {
    this.#metadataFailure = new Error('CDP bootstrap observer stopped.');
    this.#signalMetadataChange();
    this.#rejectRestartQuiescence(new Error('CDP bootstrap observer stopped.'));
    this.#rejectBootstrapWaiter(new Error('CDP bootstrap observer stopped.'));
    const client = this.#client;
    const cleanupErrors: unknown[] = [];
    if (client) {
      await this.#cleanupOwnedPausedAttachments(client).catch((error: unknown) =>
        cleanupErrors.push(error)
      );
      if (this.#autoAttachAuthorityCreated) {
        await client
          .send('Target.setAutoAttach', rootAutoAttachDisarmParams)
          .then(() => {
            this.#rootAutoAttachArmed = false;
            this.#autoAttachAuthorityCreated = false;
          })
          .catch((error: unknown) => cleanupErrors.push(error));
      }
    }
    this.#client = undefined;
    client?.close();
    await Promise.allSettled([...this.#preparations]);
    if (this.#serviceWorkerCdp) {
      await this.#serviceWorkerCdp
        .send('ServiceWorker.disable')
        .catch((error: unknown) => cleanupErrors.push(error));
      await this.#serviceWorkerCdp.detach().catch((error: unknown) => cleanupErrors.push(error));
    }
    this.#serviceWorkerCdp = undefined;
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, 'CDP bootstrap observer cleanup failed.');
    }
  }

  async #cleanupOwnedPausedAttachments(client: RawCdpClient): Promise<void> {
    const cleanupErrors: unknown[] = [];
    for (const owned of [...this.#ownedPausedAttachments.values()].sort(
      (left, right) => left.attachmentGeneration - right.attachmentGeneration
    )) {
      if (owned.detached || this.#isAttachmentDetached(owned)) {
        continue;
      }
      const mapped = this.#sessionTargets.get(owned.sessionId);
      if (
        mapped?.targetId !== owned.targetId ||
        mapped.attachmentGeneration !== owned.attachmentGeneration
      ) {
        cleanupErrors.push(
          new Error('A cleanup-owned paused attachment lost its exact live session mapping.')
        );
        continue;
      }
      try {
        if (!owned.resumed) {
          await client.send('Runtime.runIfWaitingForDebugger', {}, owned.sessionId);
          owned.resumed = true;
        }
        const detachment = createDeferredSignal();
        this.#cleanupDetachmentWaiters.set(owned.attachmentGeneration, detachment);
        let cleanupTimeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            Promise.all([
              client.send('Target.detachFromTarget', { sessionId: owned.sessionId }),
              detachment.promise,
            ]),
            new Promise<never>((_resolve, rejectPromise) => {
              cleanupTimeout = setTimeout(
                () => rejectPromise(new Error('Timed out proving cleanup attachment detachment.')),
                CLEANUP_COMMAND_TIMEOUT_MS
              );
            }),
          ]);
        } finally {
          if (cleanupTimeout !== undefined) {
            clearTimeout(cleanupTimeout);
          }
        }
        if (!owned.detached && !this.#isAttachmentDetached(owned)) {
          throw new Error('Cleanup detach completed without exact attachment revocation.');
        }
      } catch (error) {
        cleanupErrors.push(error);
      } finally {
        this.#cleanupDetachmentWaiters.delete(owned.attachmentGeneration);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, 'Paused service-worker session cleanup failed.');
    }
  }

  #recordRegistrationUpdate(value: unknown): void {
    if (
      !isRecord(value) ||
      typeof value.registrationId !== 'string' ||
      typeof value.scopeURL !== 'string' ||
      typeof value.isDeleted !== 'boolean'
    ) {
      return;
    }
    const knownRegistration = this.#registrations.has(value.registrationId);
    const expectedRegistrationId =
      this.#restartQuiescence?.authority.registrationId ??
      this.#bootstrapWaiter?.authority.registrationId;
    const relevant =
      knownRegistration ||
      value.registrationId === expectedRegistrationId ||
      isExtensionServiceWorkerUrl(value.scopeURL, this.#extensionId);
    if (!relevant) {
      return;
    }
    if (value.isDeleted) {
      this.#registrations.delete(value.registrationId);
    } else {
      this.#registrations.set(value.registrationId, value.scopeURL);
    }
    this.#signalMetadataChange();
    this.#validateActiveRegistrationContinuity();
  }

  #recordWorkerVersionUpdate(value: unknown): void {
    const version = readWorkerVersionState(value);
    if (!version) {
      return;
    }
    const activeAuthority = this.#restartQuiescence?.authority ?? this.#bootstrapWaiter?.authority;
    const relevant =
      isExtensionServiceWorkerUrl(version.scriptURL, this.#extensionId) ||
      this.#workerVersions.has(version.versionId) ||
      version.versionId === activeAuthority?.versionId ||
      version.registrationId === activeAuthority?.registrationId ||
      (version.targetId !== undefined && version.targetId === this.#activeTargetId);
    if (!relevant) {
      return;
    }
    this.#workerVersions.set(version.versionId, version);
    this.#signalMetadataChange();

    const quiescence = this.#restartQuiescence;
    if (quiescence) {
      const related =
        version.versionId === quiescence.authority.versionId ||
        version.registrationId === quiescence.authority.registrationId ||
        version.scriptURL === quiescence.authority.scriptURL ||
        version.targetId === quiescence.authority.targetId;
      const exactIdentity =
        version.versionId === quiescence.authority.versionId &&
        version.registrationId === quiescence.authority.registrationId &&
        version.scriptURL === quiescence.authority.scriptURL &&
        (version.targetId === undefined || version.targetId === quiescence.authority.targetId);
      if (related && (!exactIdentity || version.status !== 'activated')) {
        this.#rejectRestartQuiescence(
          new Error('A conflicting service-worker version replaced the restart authority.')
        );
        return;
      }
    }
    const bootstrapWaiter = this.#bootstrapWaiter;
    if (bootstrapWaiter) {
      const related =
        version.versionId === bootstrapWaiter.authority.versionId ||
        version.registrationId === bootstrapWaiter.authority.registrationId ||
        version.scriptURL === bootstrapWaiter.authority.scriptURL ||
        (version.targetId !== undefined && version.targetId === this.#activeTargetId);
      const exactIdentity =
        version.versionId === bootstrapWaiter.authority.versionId &&
        version.registrationId === bootstrapWaiter.authority.registrationId &&
        version.scriptURL === bootstrapWaiter.authority.scriptURL;
      if (related && (!exactIdentity || version.status === 'redundant')) {
        this.#completeBootstrapWaiter(
          bootstrapWaiter,
          new Error('The replacement service-worker registration or version identity diverged.')
        );
        return;
      }
    }
    if (
      quiescence &&
      version.versionId === quiescence.authority.versionId &&
      version.registrationId === quiescence.authority.registrationId &&
      version.scriptURL === quiescence.authority.scriptURL &&
      version.status === 'activated' &&
      version.runningStatus === 'stopped' &&
      (version.targetId === undefined || version.targetId === quiescence.authority.targetId)
    ) {
      quiescence.stoppedObserved = true;
      quiescence.stopped.resolve();
    }

    if (typeof version.targetId === 'string' && version.targetId === this.#activeTargetId) {
      if (!activeAuthority) {
        if (
          this.#activeWorkerVersion &&
          (version.versionId !== this.#activeWorkerVersion.versionId ||
            version.registrationId !== this.#activeWorkerVersion.registrationId ||
            version.scriptURL !== this.#activeWorkerVersion.scriptURL)
        ) {
          this.#metadataFailure = new Error(
            'Conflicting service-worker version claimed the active packaged target.'
          );
        }
        this.#activeWorkerVersion = Object.freeze({ ...version, targetId: version.targetId });
      } else if (bootstrapWaiter) {
        this.#observeReplacementVersion(bootstrapWaiter, version);
      }
    }

    if (quiescence?.stoppedObserved) {
      try {
        this.#assertRestartAuthorityContinuity(quiescence);
      } catch (error) {
        this.#rejectRestartQuiescence(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  #validateActiveRegistrationContinuity(): void {
    const quiescence = this.#restartQuiescence;
    if (quiescence) {
      try {
        this.#assertRegistrationContinuity(quiescence.authority);
      } catch (error) {
        this.#rejectRestartQuiescence(error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }
    const waiter = this.#bootstrapWaiter;
    if (!waiter) {
      return;
    }
    try {
      this.#assertRegistrationContinuity(waiter.authority);
    } catch (error) {
      this.#completeBootstrapWaiter(
        waiter,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  #assertRegistrationContinuity(authority: RestartAuthority): void {
    const exactScope = this.#registrations.get(authority.registrationId);
    if (exactScope !== authority.scopeURL) {
      throw new Error('The exact service-worker registration continuity was lost.');
    }
    const collidingRegistrations = [...this.#registrations.entries()].filter(
      ([registrationId, scopeURL]) =>
        scopeURL === authority.scopeURL && registrationId !== authority.registrationId
    );
    if (collidingRegistrations.length > 0) {
      throw new Error('A service-worker registration collision replaced the restart authority.');
    }
  }

  #assertRestartAuthorityContinuity(quiescence: RestartQuiescence): void {
    this.#assertRegistrationContinuity(quiescence.authority);
    const exactVersion = this.#workerVersions.get(quiescence.authority.versionId);
    if (
      !exactVersion ||
      exactVersion.registrationId !== quiescence.authority.registrationId ||
      exactVersion.scriptURL !== quiescence.authority.scriptURL ||
      exactVersion.status !== 'activated' ||
      exactVersion.runningStatus !== 'stopped' ||
      (exactVersion.targetId !== undefined &&
        exactVersion.targetId !== quiescence.authority.targetId)
    ) {
      throw new Error('The exact stopped service-worker version continuity was lost.');
    }
    const competingVersion = [...this.#workerVersions.values()].find(
      (candidate) =>
        candidate.versionId !== quiescence.authority.versionId &&
        candidate.status !== 'redundant' &&
        (candidate.registrationId === quiescence.authority.registrationId ||
          candidate.scriptURL === quiescence.authority.scriptURL)
    );
    if (competingVersion) {
      throw new Error('A competing service-worker version replaced the restart authority.');
    }
  }

  #observeReplacementVersion(waiter: BootstrapWaiter, version: WorkerVersionState): void {
    if (this.#bootstrapWaiter !== waiter || version.targetId !== this.#activeTargetId) {
      return;
    }
    if (
      version.versionId !== waiter.authority.versionId ||
      version.registrationId !== waiter.authority.registrationId ||
      version.scriptURL !== waiter.authority.scriptURL ||
      version.status !== 'activated' ||
      (version.runningStatus !== 'starting' && version.runningStatus !== 'running')
    ) {
      this.#completeBootstrapWaiter(
        waiter,
        new Error('The replacement service-worker registration or version identity diverged.')
      );
      return;
    }
    try {
      this.#assertRegistrationContinuity(waiter.authority);
    } catch (error) {
      this.#completeBootstrapWaiter(
        waiter,
        error instanceof Error ? error : new Error(String(error))
      );
      return;
    }
    waiter.replacementVersionTargetId = version.targetId;
    this.#claimNextBootstrapCandidate(waiter);
  }

  #refreshReplacementVersionCorrelation(waiter: BootstrapWaiter): void {
    const version = this.#workerVersions.get(waiter.authority.versionId);
    if (version?.targetId === this.#activeTargetId) {
      this.#observeReplacementVersion(waiter, version);
    }
  }

  #signalMetadataChange(): void {
    const wake = this.#metadataWake;
    if (!wake) {
      return;
    }
    this.#metadataWake = undefined;
    wake.resolve();
  }

  #handleEvent(message: ProtocolMessage): void {
    if (
      message.method?.startsWith('Target.') ||
      message.method === 'Runtime.executionContextCreated' ||
      message.method === 'Runtime.executionContextDestroyed'
    ) {
      this.#appendEventLogEntry(eventLogEntry(message));
    }
    if (message.method === 'Target.attachedToTarget') {
      const attached = readAttachedTarget(message.params);
      if (!attached || attached.type !== 'service_worker') {
        return;
      }
      const quiescence = this.#restartQuiescence;
      const rootOwnsAttachment =
        this.#rootAutoAttachArmed ||
        quiescence?.phase === 'auto-attach-arming' ||
        quiescence?.phase === 'auto-attach-armed';
      const exactPackagedWorker =
        isExtensionServiceWorkerUrl(attached.url, this.#extensionId) &&
        (this.#expectedWorkerUrl === undefined || attached.url === this.#expectedWorkerUrl);
      if (!exactPackagedWorker) {
        if (!rootOwnsAttachment) {
          return;
        }
        const attachmentGeneration = ++this.#nextAttachmentGeneration;
        this.#sessionTargets.set(attached.sessionId, {
          targetId: attached.targetId,
          attachmentGeneration,
        });
        if (attached.waitingForDebugger) {
          this.#ownedPausedAttachments.set(attachmentGeneration, {
            targetId: attached.targetId,
            sessionId: attached.sessionId,
            attachmentGeneration,
            detached: false,
            resumed: false,
          });
        }
        const error = new Error(
          'Browser-root auto-attach observed a foreign service-worker profile contaminant.'
        );
        recordWorkerException(this.#diagnostics, error.message);
        this.#rejectRestartQuiescence(error);
        this.#rejectBootstrapWaiter(error);
        return;
      }
      if (
        quiescence &&
        attached.targetId === quiescence.attachment.targetId &&
        (quiescence.phase === 'waiting-absence' ||
          this.#isAttachmentDetached(quiescence.attachment))
      ) {
        this.#rejectRestartQuiescence(
          new Error('The stopped service-worker target reattached before restart was authorized.')
        );
        return;
      }
      if (
        this.#bootstrapWaiter &&
        this.#activeTargetId !== undefined &&
        this.#activeSessionId !== undefined &&
        this.#activeAttachmentGeneration !== undefined
      ) {
        const duplicateGeneration = ++this.#nextAttachmentGeneration;
        if (!this.#sessionTargets.has(attached.sessionId)) {
          this.#sessionTargets.set(attached.sessionId, {
            targetId: attached.targetId,
            attachmentGeneration: duplicateGeneration,
          });
        }
        if (attached.waitingForDebugger) {
          this.#ownedPausedAttachments.set(duplicateGeneration, {
            targetId: attached.targetId,
            sessionId: attached.sessionId,
            attachmentGeneration: duplicateGeneration,
            detached: false,
            resumed: false,
          });
        }
        this.#rejectBootstrapWaiter(
          new Error('A duplicate replacement service-worker attachment is ambiguous.')
        );
        return;
      }
      if (this.#bootstrapWaiter && attached.waitingForDebugger !== true) {
        this.#rejectBootstrapWaiter(
          new Error('The replacement service-worker target was not paused for debugger bootstrap.')
        );
        return;
      }
      if (
        this.#restartGeneration === 0 &&
        this.#bootstrapWaiter === undefined &&
        this.#initialAttachmentWaitingForDebugger === undefined
      ) {
        this.#initialAttachmentWaitingForDebugger = attached.waitingForDebugger;
      }
      this.#expectedWorkerUrl ??= attached.url;
      this.#revokeActiveAttachment();
      const existing = this.#sessionTargets.get(attached.sessionId);
      if (existing) {
        this.#sessionTargets.delete(attached.sessionId);
        this.#revokeCorrelationsForAttachment(attached.sessionId, existing.attachmentGeneration);
      }
      const attachmentGeneration = ++this.#nextAttachmentGeneration;
      this.#sessionTargets.set(attached.sessionId, {
        targetId: attached.targetId,
        attachmentGeneration,
      });
      if (attached.waitingForDebugger) {
        this.#ownedPausedAttachments.set(attachmentGeneration, {
          targetId: attached.targetId,
          sessionId: attached.sessionId,
          attachmentGeneration,
          detached: false,
          resumed: false,
        });
      }
      this.#activeTargetId = attached.targetId;
      this.#activeSessionId = attached.sessionId;
      this.#activeAttachmentGeneration = attachmentGeneration;
      this.#signalMetadataChange();
      if (this.#bootstrapWaiter) {
        this.#refreshReplacementVersionCorrelation(this.#bootstrapWaiter);
      }
      const preparation = this.#prepareAttachedTarget(attached, attachmentGeneration)
        .catch((error: unknown) => {
          if (this.#isCurrentAttachment(attached, attachmentGeneration)) {
            this.#rejectBootstrapWaiter(error instanceof Error ? error : new Error(String(error)));
          }
        })
        .finally(() => this.#preparations.delete(preparation));
      this.#preparations.add(preparation);
      return;
    }

    if (message.method === 'Target.detachedFromTarget') {
      if (!isRecord(message.params) || typeof message.params.sessionId !== 'string') {
        return;
      }
      const sessionId = message.params.sessionId;
      const mapped = this.#sessionTargets.get(sessionId);
      if (
        !mapped ||
        (typeof message.params.targetId === 'string' && message.params.targetId !== mapped.targetId)
      ) {
        return;
      }
      this.#sessionTargets.delete(sessionId);
      this.#detachedAttachmentGenerations.add(mapped.attachmentGeneration);
      const owned = this.#ownedPausedAttachments.get(mapped.attachmentGeneration);
      if (owned) {
        owned.detached = true;
      }
      this.#cleanupDetachmentWaiters.get(mapped.attachmentGeneration)?.resolve();
      this.#cleanupDetachmentWaiters.delete(mapped.attachmentGeneration);
      this.#revokeCorrelationsForAttachment(sessionId, mapped.attachmentGeneration);
      if (
        this.#activeSessionId === sessionId &&
        this.#activeAttachmentGeneration === mapped.attachmentGeneration
      ) {
        this.#activeSessionId = undefined;
        this.#activeTargetId = undefined;
        this.#activeAttachmentGeneration = undefined;
      }
      this.#signalMetadataChange();
      if (this.#instrumentedSessionId === sessionId) {
        this.#instrumentedSessionId = undefined;
      }
      const quiescence = this.#restartQuiescence;
      if (
        quiescence &&
        quiescence.attachment.sessionId === sessionId &&
        quiescence.attachment.targetId === mapped.targetId &&
        quiescence.attachment.attachmentGeneration === mapped.attachmentGeneration
      ) {
        quiescence.detachment?.resolve();
      }
      return;
    }

    if (message.method === 'Target.targetDestroyed') {
      const quiescence = this.#restartQuiescence;
      if (
        quiescence?.phase === 'waiting-absence' &&
        isRecord(message.params) &&
        message.params.targetId === quiescence.attachment.targetId
      ) {
        quiescence.absenceWake?.resolve();
      }
      return;
    }

    if (message.method === 'Runtime.executionContextCreated') {
      const sessionId = message.sessionId;
      const uniqueId = readExecutionContextUniqueId(message.params);
      const attached = sessionId ? this.#sessionTargets.get(sessionId) : undefined;
      if (
        !sessionId ||
        uniqueId === undefined ||
        !attached ||
        attached.targetId !== this.#activeTargetId ||
        sessionId !== this.#activeSessionId ||
        attached.attachmentGeneration !== this.#activeAttachmentGeneration
      ) {
        return;
      }
      const targetId = attached.targetId;
      const waiter = this.#bootstrapWaiter;
      const correlated = Object.freeze({
        generation: waiter?.generation ?? this.#restartGeneration,
        attachmentGeneration: attached.attachmentGeneration,
        targetId,
        sessionId,
        uniqueId,
      }) satisfies CorrelatedExecutionContext;
      if (!waiter) {
        if (
          this.#observedUniqueContextIds.has(uniqueId) ||
          this.#executionContextObserved ||
          this.#initialContextClaim
        ) {
          return;
        }
        this.#observedUniqueContextIds.add(uniqueId);
        this.#initialContextClaim = correlated;
        const preparation = this.#prepareInitialExecutionContext(correlated).finally(() =>
          this.#preparations.delete(preparation)
        );
        this.#preparations.add(preparation);
        return;
      }
      if (waiter.generation === this.#restartGeneration) {
        if (waiter.executionContextClaim) {
          this.#completeBootstrapWaiter(
            waiter,
            new Error('A second execution-context claim appeared in one restart generation.')
          );
          return;
        }
        if (this.#observedUniqueContextIds.has(uniqueId)) {
          return;
        }
        waiter.executionContextClaim = correlated;
        this.#observedUniqueContextIds.add(uniqueId);
        this.#executionContextObserved = true;
        this.#enqueueBootstrapCandidate(waiter, correlated);
      }
      return;
    }

    if (message.method === 'Runtime.consoleAPICalled' && isRecord(message.params)) {
      const level = typeof message.params.type === 'string' ? message.params.type : 'log';
      const args = Array.isArray(message.params.args) ? message.params.args : [];
      recordConsoleDiagnostic(
        this.#diagnostics,
        'service_worker',
        level,
        args.map(formatRemoteObject).join(' ')
      );
      return;
    }

    if (message.method === 'Runtime.exceptionThrown') {
      const diagnostic = exceptionMessage(message.params);
      if (diagnostic) {
        recordWorkerException(this.#diagnostics, diagnostic);
      }
    }
  }

  #revokeActiveAttachment(): void {
    const sessionId = this.#activeSessionId;
    const attachmentGeneration = this.#activeAttachmentGeneration;
    if (!sessionId || attachmentGeneration === undefined) {
      return;
    }
    const mapped = this.#sessionTargets.get(sessionId);
    if (mapped?.attachmentGeneration === attachmentGeneration) {
      this.#sessionTargets.delete(sessionId);
    }
    this.#revokeCorrelationsForAttachment(sessionId, attachmentGeneration);
    if (this.#instrumentedSessionId === sessionId) {
      this.#instrumentedSessionId = undefined;
    }
    this.#activeSessionId = undefined;
    this.#activeTargetId = undefined;
    this.#activeAttachmentGeneration = undefined;
  }

  #revokeCorrelationsForAttachment(sessionId: string, attachmentGeneration: number): void {
    const waiter = this.#bootstrapWaiter;
    if (
      this.#initialContextClaim?.sessionId === sessionId &&
      this.#initialContextClaim.attachmentGeneration === attachmentGeneration
    ) {
      this.#initialContextClaim = undefined;
    }
    if (waiter) {
      for (let index = waiter.candidates.length - 1; index >= 0; index -= 1) {
        const candidate = waiter.candidates[index]!;
        if (
          candidate.sessionId === sessionId &&
          candidate.attachmentGeneration === attachmentGeneration
        ) {
          waiter.candidates.splice(index, 1);
        }
      }
    }
    if (
      waiter?.correlated?.sessionId === sessionId &&
      waiter.correlated.attachmentGeneration === attachmentGeneration
    ) {
      waiter.claimed = false;
      waiter.correlated = undefined;
    }
    if (
      this.#lastCorrelatedExecutionContext?.sessionId === sessionId &&
      this.#lastCorrelatedExecutionContext.attachmentGeneration === attachmentGeneration
    ) {
      this.#lastCorrelatedExecutionContext = undefined;
    }
  }

  #isCurrentAttachment(attached: AttachedTarget, attachmentGeneration: number): boolean {
    const mapped = this.#sessionTargets.get(attached.sessionId);
    return (
      this.#activeTargetId === attached.targetId &&
      this.#activeSessionId === attached.sessionId &&
      this.#activeAttachmentGeneration === attachmentGeneration &&
      mapped?.targetId === attached.targetId &&
      mapped.attachmentGeneration === attachmentGeneration
    );
  }

  #snapshotActiveAttachment(): AttachmentIdentity {
    const targetId = this.#activeTargetId;
    const sessionId = this.#activeSessionId;
    const attachmentGeneration = this.#activeAttachmentGeneration;
    const mapped = sessionId ? this.#sessionTargets.get(sessionId) : undefined;
    if (
      !targetId ||
      !sessionId ||
      attachmentGeneration === undefined ||
      mapped?.targetId !== targetId ||
      mapped.attachmentGeneration !== attachmentGeneration
    ) {
      throw new Error('No exact active packaged service-worker attachment exists before stop.');
    }
    return Object.freeze({ targetId, sessionId, attachmentGeneration });
  }

  #isExactAttachmentActive(attachment: AttachmentIdentity): boolean {
    const mapped = this.#sessionTargets.get(attachment.sessionId);
    return (
      this.#activeTargetId === attachment.targetId &&
      this.#activeSessionId === attachment.sessionId &&
      this.#activeAttachmentGeneration === attachment.attachmentGeneration &&
      mapped?.targetId === attachment.targetId &&
      mapped.attachmentGeneration === attachment.attachmentGeneration
    );
  }

  #assertControlledStopCommit(readiness: RestartReadiness): void {
    if (readiness.branch !== 'controlled' || !this.#isExactAttachmentActive(readiness.attachment)) {
      throw new Error('Controlled service-worker stop lost its exact active attachment.');
    }
    this.#assertRegistrationContinuity(readiness.authority);
    const version = this.#workerVersions.get(readiness.authority.versionId);
    if (
      !version ||
      version.registrationId !== readiness.authority.registrationId ||
      version.scriptURL !== readiness.authority.scriptURL ||
      version.targetId !== readiness.authority.targetId ||
      version.status !== 'activated' ||
      version.runningStatus !== 'running'
    ) {
      throw new Error('Controlled service-worker stop lost activated running authority.');
    }
  }

  #isAttachmentDetached(attachment: AttachmentIdentity): boolean {
    if (!this.#detachedAttachmentGenerations.has(attachment.attachmentGeneration)) {
      return false;
    }
    const mapped = this.#sessionTargets.get(attachment.sessionId);
    const exactAttachmentStillMapped =
      mapped?.targetId === attachment.targetId &&
      mapped.attachmentGeneration === attachment.attachmentGeneration;
    const exactAttachmentStillActive =
      this.#activeTargetId === attachment.targetId &&
      this.#activeSessionId === attachment.sessionId &&
      this.#activeAttachmentGeneration === attachment.attachmentGeneration;
    return !exactAttachmentStillMapped && !exactAttachmentStillActive;
  }

  #consumeAttachmentDetachment(attachment: AttachmentIdentity): boolean {
    if (!this.#isAttachmentDetached(attachment)) {
      return false;
    }
    this.#detachedAttachmentGenerations.delete(attachment.attachmentGeneration);
    return true;
  }

  #armRestartQuiescence(
    attachment: AttachmentIdentity,
    authority: RestartAuthority,
    deadline: number,
    phase: RestartQuiescencePhase = 'waiting-stopped'
  ): RestartQuiescence {
    const stopped = createDeferredSignal();
    const failure = createDeferredSignal();
    const quiescence = {} as RestartQuiescence;
    const timeout = setTimeout(
      () => {
        if (this.#restartQuiescence !== quiescence) {
          return;
        }
        const stage =
          quiescence.phase === 'waiting-stopped'
            ? 'exact stopped service-worker version and stop response'
            : quiescence.phase === 'waiting-detach'
              ? 'exact pre-stop attachment detachment'
              : 'old service-worker target absence';
        this.#rejectRestartQuiescence(this.#restartTimeoutError(stage));
      },
      Math.max(0, deadline - Date.now())
    );
    Object.assign(quiescence, {
      attachment,
      authority,
      deadline,
      stopped,
      failure,
      timeout,
      phase,
      detachment: undefined,
      absenceWake: undefined,
      stoppedObserved: false,
      failed: false,
    });
    this.#restartQuiescence = quiescence;
    return quiescence;
  }

  #awaitQuiescence<T>(quiescence: RestartQuiescence, operation: Promise<T>): Promise<T> {
    return Promise.race([
      operation,
      quiescence.failure.promise.then(() => {
        throw new Error('Restart quiescence failure resolved unexpectedly.');
      }),
    ]);
  }

  async #releaseStoppedAttachment(quiescence: RestartQuiescence): Promise<void> {
    if (this.#restartQuiescence !== quiescence || quiescence.failed) {
      throw new Error('Restart quiescence was revoked before target release.');
    }
    quiescence.phase = 'waiting-detach';
    if (!this.#consumeAttachmentDetachment(quiescence.attachment)) {
      const detachment = createDeferredSignal();
      quiescence.detachment = detachment;
      await this.#awaitQuiescence(
        quiescence,
        Promise.all([
          this.#requireClient().send('Target.detachFromTarget', {
            sessionId: quiescence.attachment.sessionId,
          }),
          detachment.promise,
        ]).then(() => undefined)
      );
      if (!this.#consumeAttachmentDetachment(quiescence.attachment)) {
        throw new Error('The detach command completed without exact attachment revocation.');
      }
      quiescence.detachment = undefined;
    }
    this.#assertRestartAuthorityContinuity(quiescence);

    quiescence.phase = 'waiting-absence';
    while (this.#restartQuiescence === quiescence && !quiescence.failed) {
      const targets = await this.#awaitQuiescence(
        quiescence,
        this.#requireClient().send('Target.getTargets', { filter: [...targetFilter] })
      );
      this.#assertRestartAuthorityContinuity(quiescence);
      if (!targetResultContainsId(targets, quiescence.attachment.targetId)) {
        return;
      }
      const remainingTime = quiescence.deadline - Date.now();
      if (remainingTime <= 0) {
        throw this.#restartTimeoutError('old service-worker target absence');
      }
      const absenceWake = createDeferredSignal();
      quiescence.absenceWake = absenceWake;
      await this.#awaitQuiescence(
        quiescence,
        Promise.race([absenceWake.promise, delay(Math.min(25, remainingTime))])
      );
      if (quiescence.absenceWake === absenceWake) {
        quiescence.absenceWake = undefined;
      }
    }
    throw new Error('Restart quiescence was revoked before old-target absence.');
  }

  async #assertOldTargetAbsentNow(quiescence: RestartQuiescence): Promise<void> {
    const targets = await this.#awaitQuiescence(
      quiescence,
      this.#requireClient().send('Target.getTargets', { filter: [...targetFilter] })
    );
    if (targetResultContainsId(targets, quiescence.attachment.targetId)) {
      throw new Error('The old service-worker target reappeared before start authorization.');
    }
  }

  #completeRestartQuiescence(quiescence: RestartQuiescence): void {
    if (this.#restartQuiescence !== quiescence || quiescence.failed) {
      throw new Error('Restart quiescence cannot complete after revocation.');
    }
    clearTimeout(quiescence.timeout);
    this.#restartQuiescence = undefined;
  }

  #clearRestartQuiescence(quiescence: RestartQuiescence): void {
    if (this.#restartQuiescence !== quiescence) {
      return;
    }
    clearTimeout(quiescence.timeout);
    this.#restartQuiescence = undefined;
  }

  #rejectRestartQuiescence(error: Error): void {
    const quiescence = this.#restartQuiescence;
    if (!quiescence || quiescence.failed) {
      return;
    }
    quiescence.failed = true;
    clearTimeout(quiescence.timeout);
    this.#restartQuiescence = undefined;
    quiescence.failure.reject(error);
  }

  #appendEventLog(method: string, params: unknown): void {
    this.#appendEventLogEntry(`${method}:${JSON.stringify(params)?.slice(0, 500) ?? ''}`);
  }

  #appendEventLogEntry(entry: string): void {
    this.#eventLog.push(entry);
    this.#eventLog = this.#eventLog.slice(-20);
  }

  #restartTimeoutError(stage: string): Error {
    return new Error(
      `Timed out waiting for the ${stage}. CDP: ${this.#eventLog.join(' | ') || 'no target events'}`
    );
  }

  #isCurrentCorrelatedExecutionContext(correlated: CorrelatedExecutionContext): boolean {
    const mapped = this.#sessionTargets.get(correlated.sessionId);
    return (
      correlated.generation === this.#restartGeneration &&
      correlated.targetId === this.#activeTargetId &&
      correlated.sessionId === this.#activeSessionId &&
      correlated.attachmentGeneration === this.#activeAttachmentGeneration &&
      mapped?.targetId === correlated.targetId &&
      mapped.attachmentGeneration === correlated.attachmentGeneration
    );
  }

  #isCurrentPublishedContext(correlated: CorrelatedExecutionContext): boolean {
    return (
      this.#lastCorrelatedExecutionContext === correlated &&
      this.#isCurrentCorrelatedExecutionContext(correlated)
    );
  }

  #isCurrentInitialClaim(correlated: CorrelatedExecutionContext): boolean {
    return (
      this.#initialContextClaim === correlated &&
      this.#isCurrentCorrelatedExecutionContext(correlated)
    );
  }

  #isCurrentBootstrapClaim(
    waiter: BootstrapWaiter,
    correlated: CorrelatedExecutionContext
  ): boolean {
    return (
      this.#bootstrapWaiter === waiter &&
      waiter.claimed &&
      waiter.correlated === correlated &&
      waiter.replacementVersionTargetId === correlated.targetId &&
      this.#isCurrentCorrelatedExecutionContext(correlated)
    );
  }

  #releaseBootstrapClaim(waiter: BootstrapWaiter, correlated: CorrelatedExecutionContext): void {
    if (this.#bootstrapWaiter !== waiter || waiter.correlated !== correlated) {
      return;
    }
    waiter.claimed = false;
    waiter.correlated = undefined;
    this.#claimNextBootstrapCandidate(waiter);
  }

  #enqueueBootstrapCandidate(
    waiter: BootstrapWaiter,
    correlated: CorrelatedExecutionContext
  ): void {
    if (
      this.#bootstrapWaiter !== waiter ||
      waiter.generation !== this.#restartGeneration ||
      !this.#isCurrentCorrelatedExecutionContext(correlated)
    ) {
      return;
    }
    if (waiter.candidates.length === MAX_PENDING_BOOTSTRAP_CANDIDATES) {
      waiter.candidates.shift();
    }
    waiter.candidates.push(correlated);
    this.#claimNextBootstrapCandidate(waiter);
  }

  #claimNextBootstrapCandidate(waiter: BootstrapWaiter): void {
    if (this.#bootstrapWaiter !== waiter || waiter.claimed) {
      return;
    }
    if (
      waiter.replacementVersionTargetId === undefined ||
      waiter.replacementVersionTargetId !== this.#activeTargetId
    ) {
      return;
    }
    try {
      this.#assertRegistrationContinuity(waiter.authority);
    } catch (error) {
      this.#completeBootstrapWaiter(
        waiter,
        error instanceof Error ? error : new Error(String(error))
      );
      return;
    }
    let correlated = waiter.candidates.shift();
    while (correlated && !this.#isCurrentCorrelatedExecutionContext(correlated)) {
      correlated = waiter.candidates.shift();
    }
    if (!correlated) {
      return;
    }
    waiter.claimed = true;
    waiter.correlated = correlated;
    const preparation = this.#prepareExistingSession(correlated, waiter)
      .catch((error: unknown) => {
        if (this.#isCurrentBootstrapClaim(waiter, correlated)) {
          this.#completeBootstrapWaiter(
            waiter,
            error instanceof Error ? error : new Error(String(error))
          );
        }
      })
      .finally(() => this.#preparations.delete(preparation));
    this.#preparations.add(preparation);
  }

  async #prepareAttachedTarget(
    attached: AttachedTarget,
    attachmentGeneration: number
  ): Promise<void> {
    const client = this.#requireClient();
    let setupError: Error | undefined;

    try {
      await client.send('Runtime.enable', {}, attached.sessionId);
    } catch (error) {
      setupError = error instanceof Error ? error : new Error(String(error));
    }
    if (!this.#isCurrentAttachment(attached, attachmentGeneration)) {
      return;
    }
    if (!setupError) {
      this.#instrumentedSessionId = attached.sessionId;
    }
    if (setupError) {
      this.#rejectBootstrapWaiter(setupError);
    }
  }

  async #prepareInitialExecutionContext(correlated: CorrelatedExecutionContext): Promise<void> {
    const client = this.#requireClient();
    let handshakeResult: unknown;
    try {
      handshakeResult = await client.send(
        'Runtime.evaluate',
        {
          expression: WORKER_IDENTITY_HANDSHAKE_EXPRESSION,
          uniqueContextId: correlated.uniqueId,
          awaitPromise: true,
          returnByValue: true,
        },
        correlated.sessionId
      );
    } catch {
      handshakeResult = undefined;
    }
    if (!this.#isCurrentInitialClaim(correlated)) {
      return;
    }
    const identity = readExactWorkerIdentity(handshakeResult);
    if (!isExactWorkerIdentity(identity, this.#extensionId, this.#expectedWorkerUrl)) {
      this.#appendEventLogEntry(
        `initial-handshake-rejected:${JSON.stringify(handshakeResult)?.slice(0, 500) ?? 'undefined'}`
      );
      this.#initialContextClaim = undefined;
      return;
    }

    let resumeError: Error | undefined;
    try {
      await client.send('Runtime.runIfWaitingForDebugger', {}, correlated.sessionId);
    } catch (error) {
      resumeError = error instanceof Error ? error : new Error(String(error));
    }
    if (!this.#isCurrentInitialClaim(correlated)) {
      return;
    }
    this.#initialContextClaim = undefined;
    if (!resumeError) {
      this.#markOwnedAttachmentResumed(correlated);
      this.#executionContextObserved = true;
    }
  }

  async #prepareExistingSession(
    correlated: CorrelatedExecutionContext,
    waiter: BootstrapWaiter
  ): Promise<void> {
    if (!this.#isCurrentBootstrapClaim(waiter, correlated)) {
      return;
    }
    const client = this.#requireClient();
    let handshakeResult: unknown;
    try {
      handshakeResult = await client.send(
        'Runtime.evaluate',
        {
          expression: WORKER_IDENTITY_HANDSHAKE_EXPRESSION,
          uniqueContextId: correlated.uniqueId,
          awaitPromise: true,
          returnByValue: true,
        },
        correlated.sessionId
      );
    } catch {
      handshakeResult = undefined;
    }
    if (!this.#isCurrentBootstrapClaim(waiter, correlated)) {
      return;
    }
    const identity = readExactWorkerIdentity(handshakeResult);
    const handshakeAccepted = isExactWorkerIdentity(
      identity,
      this.#extensionId,
      this.#expectedWorkerUrl
    );
    if (!handshakeAccepted) {
      this.#appendEventLogEntry(
        `bootstrap-handshake-rejected:${JSON.stringify(handshakeResult)?.slice(0, 500) ?? 'undefined'}`
      );
      this.#releaseBootstrapClaim(waiter, correlated);
      return;
    }

    let probeError: Error | undefined;
    if (waiter.probeExpression) {
      try {
        await client.send(
          'Runtime.evaluate',
          {
            expression: waiter.probeExpression,
            uniqueContextId: correlated.uniqueId,
            awaitPromise: true,
            returnByValue: true,
          },
          correlated.sessionId
        );
      } catch (error) {
        probeError = error instanceof Error ? error : new Error(String(error));
      }
      if (!this.#isCurrentBootstrapClaim(waiter, correlated)) {
        return;
      }
    }

    let resumeError: Error | undefined;
    try {
      await client.send('Runtime.runIfWaitingForDebugger', {}, correlated.sessionId);
    } catch (error) {
      resumeError = error instanceof Error ? error : new Error(String(error));
    }
    if (!this.#isCurrentBootstrapClaim(waiter, correlated)) {
      return;
    }
    const setupError = probeError ?? resumeError;
    if (setupError) {
      if (!this.#isCurrentBootstrapClaim(waiter, correlated)) {
        return;
      }
      this.#completeBootstrapWaiter(waiter, setupError);
      return;
    }

    this.#markOwnedAttachmentResumed(correlated);

    if (!this.#isCurrentBootstrapClaim(waiter, correlated)) {
      return;
    }
    this.#lastCorrelatedExecutionContext = correlated;
    if (!this.#isCurrentBootstrapClaim(waiter, correlated)) {
      if (this.#lastCorrelatedExecutionContext === correlated) {
        this.#lastCorrelatedExecutionContext = undefined;
      }
      return;
    }
    this.#completeBootstrapWaiter(waiter);
  }

  #markOwnedAttachmentResumed(correlated: CorrelatedExecutionContext): void {
    const owned = this.#ownedPausedAttachments.get(correlated.attachmentGeneration);
    if (owned?.sessionId === correlated.sessionId && owned.targetId === correlated.targetId) {
      owned.resumed = true;
    }
  }

  async #waitForRestartReadiness(
    attachment: AttachmentIdentity,
    deadline: number
  ): Promise<RestartReadiness> {
    let authority: RestartAuthority | undefined;
    while (Date.now() < deadline) {
      if (this.#metadataFailure) {
        throw this.#metadataFailure;
      }
      if (!authority) {
        const initialVersion = this.#activeWorkerVersion;
        const registrationScope = initialVersion
          ? this.#registrations.get(initialVersion.registrationId)
          : undefined;
        if (
          initialVersion?.targetId === attachment.targetId &&
          initialVersion.scriptURL === this.#expectedWorkerUrl &&
          registrationScope === `chrome-extension://${this.#extensionId}/`
        ) {
          authority = Object.freeze({
            versionId: initialVersion.versionId,
            registrationId: initialVersion.registrationId,
            scopeURL: registrationScope,
            scriptURL: initialVersion.scriptURL,
            targetId: attachment.targetId,
          });
        }
      }
      if (authority) {
        this.#assertRegistrationContinuity(authority);
        const version = this.#workerVersions.get(authority.versionId);
        if (
          !version ||
          version.registrationId !== authority.registrationId ||
          version.scriptURL !== authority.scriptURL ||
          (version.targetId !== undefined && version.targetId !== authority.targetId)
        ) {
          throw new Error('The service-worker readiness authority identity diverged.');
        }
        const competingVersion = [...this.#workerVersions.values()].find(
          (candidate) =>
            candidate.versionId !== authority?.versionId &&
            candidate.status !== 'redundant' &&
            (candidate.registrationId === authority?.registrationId ||
              candidate.scriptURL === authority?.scriptURL)
        );
        if (competingVersion || version.status === 'redundant') {
          throw new Error('A competing service-worker version replaced readiness authority.');
        }
        const attachmentActive = this.#isExactAttachmentActive(attachment);
        const attachmentDetached = this.#isAttachmentDetached(attachment);
        if (!attachmentActive && !attachmentDetached && this.#activeTargetId !== undefined) {
          throw new Error('The packaged service-worker attachment changed before readiness.');
        }
        if (
          version.status === 'activated' &&
          version.runningStatus === 'running' &&
          attachmentActive
        ) {
          return Object.freeze({ branch: 'controlled', attachment, authority });
        }
        if (
          version.status === 'activated' &&
          version.runningStatus === 'stopped' &&
          attachmentDetached
        ) {
          const targets = await this.#awaitBeforeDeadline(
            this.#requireClient().send('Target.getTargets', { filter: [...targetFilter] }),
            deadline,
            'naturally stopped service-worker target absence'
          );
          this.#assertRegistrationContinuity(authority);
          const latestVersion = this.#workerVersions.get(authority.versionId);
          if (
            !latestVersion ||
            latestVersion.registrationId !== authority.registrationId ||
            latestVersion.scriptURL !== authority.scriptURL ||
            latestVersion.status !== 'activated' ||
            latestVersion.runningStatus !== 'stopped' ||
            (latestVersion.targetId !== undefined && latestVersion.targetId !== authority.targetId)
          ) {
            throw new Error('Natural service-worker quiescence lost version continuity.');
          }
          if (!targetResultContainsId(targets, authority.targetId)) {
            return Object.freeze({ branch: 'natural', attachment, authority });
          }
        }
      }
      const remainingTime = deadline - Date.now();
      if (remainingTime <= 0) {
        break;
      }
      const wake = createDeferredSignal();
      this.#metadataWake = wake;
      await Promise.race([wake.promise, delay(Math.min(25, remainingTime))]);
      if (this.#metadataWake === wake) {
        this.#metadataWake = undefined;
      }
    }
    throw this.#restartTimeoutError(
      'activated service-worker controlled or natural quiescence readiness'
    );
  }

  async #waitForReplacementWorker(currentWorker: Worker, deadline: number): Promise<Worker> {
    const correlated = this.#lastCorrelatedExecutionContext;
    if (!correlated || !this.#isCurrentPublishedContext(correlated)) {
      throw new Error('No current correlated context exists for the replacement worker.');
    }
    while (Date.now() < deadline) {
      const workers = this.#context
        .serviceWorkers()
        .filter((candidate) => candidate.url() === this.#expectedWorkerUrl)
        .sort((left) => (left === currentWorker ? 1 : -1));
      for (const worker of workers) {
        let identity: unknown;
        try {
          identity = await this.#awaitBeforeDeadline(
            worker.evaluate(WORKER_IDENTITY_HANDSHAKE_EXPRESSION),
            deadline,
            'Playwright replacement worker identity'
          );
        } catch (error) {
          if (Date.now() >= deadline) {
            throw error;
          }
          identity = undefined;
        }
        if (!this.#isCurrentPublishedContext(correlated)) {
          throw new Error('Correlated replacement worker became stale while awaiting Playwright.');
        }
        if (
          isExactWorkerIdentity(
            readExactWorkerIdentityValue(identity),
            this.#extensionId,
            this.#expectedWorkerUrl
          )
        ) {
          return worker;
        }
      }
      await delay(25);
      if (!this.#isCurrentPublishedContext(correlated)) {
        throw new Error('Correlated replacement worker became stale while awaiting Playwright.');
      }
    }
    throw new Error('Playwright did not expose a correlated replacement worker in time.');
  }

  async #awaitBeforeDeadline<T>(
    operation: Promise<T>,
    deadline: number,
    stage: string
  ): Promise<T> {
    const remainingTime = deadline - Date.now();
    if (remainingTime <= 0) {
      throw this.#restartTimeoutError(stage);
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, rejectPromise) => {
          timeout = setTimeout(
            () => rejectPromise(this.#restartTimeoutError(stage)),
            remainingTime
          );
        }),
      ]);
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }

  async #waitForInstrumentedSession(): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (this.#instrumentedSessionId) {
        return;
      }
      await delay(25);
    }
    throw new Error('CDP did not instrument the initial packaged service-worker target.');
  }

  async #waitForExecutionContext(): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (this.#executionContextObserved) {
        return;
      }
      await delay(25);
    }
    throw new Error(
      `CDP did not observe the initial packaged worker execution context. Events: ${this.#eventLog.join(' | ') || 'none'}`
    );
  }

  #completeBootstrapWaiter(waiter: BootstrapWaiter, error?: Error): void {
    if (this.#bootstrapWaiter !== waiter) {
      return;
    }
    this.#bootstrapWaiter = undefined;
    waiter.candidates.length = 0;
    clearTimeout(waiter.timeout);
    if (error) {
      waiter.reject(error);
    } else {
      waiter.resolve();
    }
  }

  #rejectBootstrapWaiter(error: Error): void {
    const waiter = this.#bootstrapWaiter;
    if (!waiter) {
      return;
    }
    this.#bootstrapWaiter = undefined;
    waiter.candidates.length = 0;
    clearTimeout(waiter.timeout);
    waiter.reject(error);
  }

  #requireClient(): RawCdpClient {
    if (!this.#client) {
      throw new Error('CDP bootstrap observer has not been started.');
    }
    return this.#client;
  }

  #requireServiceWorkerCdp(): CDPSession {
    if (!this.#serviceWorkerCdp) {
      throw new Error('ServiceWorker CDP domain has not been enabled.');
    }
    return this.#serviceWorkerCdp;
  }
}
