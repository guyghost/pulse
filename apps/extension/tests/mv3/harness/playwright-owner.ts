import type { ConnectOverCDPTransport } from 'playwright-core';
import type { PlaywrightAuthorityV1 } from './playwright-authority';
import {
  NestedCdpSession,
  type BrowserCdpSessionLike,
  type NestedCdpEvent,
} from './nested-cdp-session';
import type {
  TrackedTransportCloseReceipt,
  TrackedTransportOpenReceipt,
} from './tracked-cdp-transport';

const SERVICE_WORKER_FILTER = Object.freeze([
  Object.freeze({ type: 'service_worker', exclude: false }),
  Object.freeze({ exclude: true }),
]);
const IDENTITY_EXPRESSION =
  '(() => ({ workerUrl: globalThis.location.href, registrationScope: globalThis.registration.scope }))()';
const MAX_ID_BYTES = 4_096;

type EventListener = (event: Record<string, unknown>) => void;

export interface PagePort {
  url(): string;
  goto(url: string): Promise<unknown>;
  close(): Promise<void>;
}

export interface WorkerPort {
  url(): string;
}

export interface CdpSessionPort {
  on(event: string, listener: EventListener): void;
  off(event: string, listener: EventListener): void;
  send(
    method: string,
    params?: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  detach(): Promise<void>;
}

export type BrowserCdpSessionPort = CdpSessionPort;

export interface BrowserContextPort {
  pages(): PagePort[];
  serviceWorkers(): WorkerPort[];
  newCDPSession(page: PagePort): Promise<CdpSessionPort>;
  newPage(): Promise<PagePort>;
}

export interface BrowserPort {
  contexts(): BrowserContextPort[];
  newBrowserCDPSession(): Promise<BrowserCdpSessionPort>;
  on(event: 'disconnected', listener: () => void): void;
  off(event: 'disconnected', listener: () => void): void;
  close(): Promise<void>;
}

export interface PlaywrightTransportPort extends ConnectOverCDPTransport {
  readonly openReceipt: TrackedTransportOpenReceipt;
  readonly closed: Promise<TrackedTransportCloseReceipt>;
}

export interface PlaywrightConnectPort {
  connectOverCDP(
    transport: ConnectOverCDPTransport,
    options: { readonly isLocal: true; readonly noDefaults: true; readonly timeout: number }
  ): Promise<BrowserPort>;
}

export type PlaywrightAuthority = PlaywrightAuthorityV1;

export interface BrowserVersionAuthority {
  readonly jsVersion: string;
  readonly product: string;
  readonly protocolVersion: string;
  readonly revision: string;
  readonly userAgent: string;
}

export interface PlaywrightDiagnostic {
  readonly method: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly playwrightEpoch: number;
  readonly processGeneration: number;
}

export interface PlaywrightHandoffReceiptV1 {
  readonly schemaVersion: 1;
  readonly processGeneration: number;
  readonly leaseEpoch: number;
  readonly playwrightEpoch: number;
  readonly workerUrl: string;
}

export interface PlaywrightReleaseReceiptV1 {
  readonly schemaVersion: 1;
  readonly processGeneration: number;
  readonly leaseEpoch: number;
  readonly playwrightEpoch: number;
  readonly browserCloseResolved: true;
  readonly disconnectedObserved: true;
  readonly transportClose: TrackedTransportCloseReceipt;
}

export interface PlaywrightEpochFacade {
  openFixturePage(url: string): Promise<PagePort>;
  evaluateInServiceWorker(expression: string): Promise<unknown>;
}

export interface PlaywrightOwner {
  readonly facade: PlaywrightEpochFacade;
  readonly handoff: PlaywrightHandoffReceiptV1;
  release(): Promise<PlaywrightReleaseReceiptV1>;
}

export interface AcquirePlaywrightOwnerOptions {
  readonly authority: PlaywrightAuthority;
  readonly browserVersion: BrowserVersionAuthority;
  readonly connect: PlaywrightConnectPort;
  readonly handoffTimeoutMs: number;
  readonly leaseEpoch: number;
  readonly onDiagnostic: (diagnostic: PlaywrightDiagnostic) => void;
  readonly onProtocolFailure: (error: Error) => void;
  readonly playwrightEpoch: number;
  readonly processGeneration: number;
  readonly releaseTimeoutMs: number;
  readonly transport: PlaywrightTransportPort;
}

export class PlaywrightConnectFailedError extends Error {
  readonly closeReceipt: TrackedTransportCloseReceipt;
  override readonly cause: unknown;

  constructor(cause: unknown, closeReceipt: TrackedTransportCloseReceipt) {
    super('Playwright connectOverCDP failed after its tracked transport was closed.');
    this.name = 'PlaywrightConnectFailedError';
    this.cause = cause;
    this.closeReceipt = closeReceipt;
  }
}

interface RegistrationState {
  readonly isDeleted: boolean;
  readonly registrationId: string;
  readonly scopeURL: string;
}

interface VersionState {
  readonly registrationId: string;
  readonly runningStatus: string;
  readonly scriptURL: string;
  readonly status: string;
  readonly targetId: string;
  readonly versionId: string;
}

interface RuntimeState {
  blocked: Error | undefined;
  releasing: boolean;
  active: boolean;
  uniqueContextId: string | undefined;
}

interface OwnedResources {
  readonly authority: Readonly<PlaywrightAuthority>;
  readonly browser: BrowserPort;
  readonly browserSession: BrowserCdpSessionPort;
  readonly context: BrowserContextPort;
  readonly nested: NestedCdpSession;
  readonly nestedSessionId: string;
  readonly options: AcquirePlaywrightOwnerOptions;
  readonly runtime: RuntimeState;
  readonly sentinel: PagePort;
  readonly sentinelSession: CdpSessionPort;
  readonly transport: PlaywrightTransportPort;
  readonly fixturePages: Set<PagePort>;
  readonly disconnect: DisconnectObservation;
  readonly removeRuntimeListener: () => void;
  readonly removeSessionListeners: () => void;
}

interface DisconnectObservation {
  readonly promise: Promise<void>;
  readonly listener: () => void;
  observed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertSafeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer.`);
  }
}

function assertBoundedId(value: string, field: string): void {
  if (
    value.length === 0 ||
    value.includes('\u0000') ||
    value.includes('\r') ||
    value.includes('\n') ||
    Buffer.byteLength(value, 'utf8') > MAX_ID_BYTES
  ) {
    throw new Error(`${field} is invalid.`);
  }
}

function assertBrowserVersion(
  actual: Record<string, unknown>,
  expected: BrowserVersionAuthority
): void {
  for (const field of [
    'protocolVersion',
    'product',
    'revision',
    'userAgent',
    'jsVersion',
  ] as const) {
    if (actual[field] !== expected[field]) {
      throw new Error(`Browser.getVersion ${field} does not match the frozen process receipt.`);
    }
  }
}

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${label}.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

function parseRegistration(value: unknown): RegistrationState | undefined {
  if (
    !isRecord(value) ||
    typeof value.registrationId !== 'string' ||
    typeof value.scopeURL !== 'string' ||
    typeof value.isDeleted !== 'boolean'
  ) {
    return undefined;
  }
  return Object.freeze({
    isDeleted: value.isDeleted,
    registrationId: value.registrationId,
    scopeURL: value.scopeURL,
  });
}

function parseVersion(value: unknown): VersionState | undefined {
  if (
    !isRecord(value) ||
    typeof value.registrationId !== 'string' ||
    typeof value.runningStatus !== 'string' ||
    typeof value.scriptURL !== 'string' ||
    typeof value.status !== 'string' ||
    typeof value.targetId !== 'string' ||
    typeof value.versionId !== 'string'
  ) {
    return undefined;
  }
  return Object.freeze({
    registrationId: value.registrationId,
    runningStatus: value.runningStatus,
    scriptURL: value.scriptURL,
    status: value.status,
    targetId: value.targetId,
    versionId: value.versionId,
  });
}

function createDisconnectObservation(browser: BrowserPort): DisconnectObservation {
  const signal = deferred();
  const observation: DisconnectObservation = {
    listener: () => {
      observation.observed = true;
      signal.resolve();
    },
    observed: false,
    promise: signal.promise,
  };
  browser.on('disconnected', observation.listener);
  return observation;
}

function nestedAdapter(session: BrowserCdpSessionPort): BrowserCdpSessionLike {
  return {
    on: (event, listener) => session.on(event, listener as unknown as EventListener),
    off: (event, listener) => session.off(event, listener as unknown as EventListener),
    send: (method, params) => session.send(method, params),
  };
}

function readNestedSessionId(value: unknown): string {
  if (!isRecord(value) || typeof value.sessionId !== 'string') {
    throw new Error('Target.attachToTarget returned no exact nested session ID.');
  }
  assertBoundedId(value.sessionId, 'nestedSessionId');
  return value.sessionId;
}

function requireExactWorkerTarget(value: unknown, authority: Readonly<PlaywrightAuthority>): void {
  if (!isRecord(value) || !Array.isArray(value.targetInfos) || value.targetInfos.length !== 1) {
    throw new Error('Target.getTargets did not return exactly one service-worker target.');
  }
  const target = value.targetInfos[0];
  if (
    !isRecord(target) ||
    target.type !== 'service_worker' ||
    target.targetId !== authority.targetId ||
    target.url !== authority.scriptURL ||
    target.attached !== true
  ) {
    throw new Error('Target.getTargets does not match the frozen service-worker authority.');
  }
}

function readUniqueContextId(event: NestedCdpEvent): string | undefined {
  if (event.method !== 'Runtime.executionContextCreated') {
    return undefined;
  }
  const context = event.params.context;
  if (!isRecord(context) || typeof context.uniqueId !== 'string') {
    throw new Error('Runtime.executionContextCreated has no exact uniqueContextId.');
  }
  assertBoundedId(context.uniqueId, 'uniqueContextId');
  return context.uniqueId;
}

function readEvaluationValue(value: unknown, label: string): unknown {
  if (!isRecord(value) || 'exceptionDetails' in value || !isRecord(value.result)) {
    throw new Error(`${label} failed or returned no RemoteObject.`);
  }
  if (!Object.prototype.hasOwnProperty.call(value.result, 'value')) {
    throw new Error(`${label} returned no by-value result.`);
  }
  return structuredClone(value.result.value);
}

function assertIdentity(value: unknown, authority: Readonly<PlaywrightAuthority>): void {
  if (
    !isRecord(value) ||
    value.workerUrl !== authority.scriptURL ||
    value.registrationScope !== authority.scopeURL
  ) {
    throw new Error('Native service-worker identity does not match the frozen authority.');
  }
}

function protocolFailure(options: AcquirePlaywrightOwnerOptions, error: Error): Error {
  options.onProtocolFailure(error);
  return error;
}

function assertCurrent(runtime: RuntimeState): string {
  if (!runtime.active || runtime.releasing) {
    throw new Error('Playwright epoch is no longer current.');
  }
  if (runtime.blocked) {
    throw runtime.blocked;
  }
  if (!runtime.uniqueContextId) {
    throw new Error('Playwright epoch has no current runtime context.');
  }
  return runtime.uniqueContextId;
}

async function closeConnectFailure(
  options: AcquirePlaywrightOwnerOptions,
  cause: unknown
): Promise<never> {
  options.transport.close();
  const receipt = await withTimeout(
    options.transport.closed,
    options.releaseTimeoutMs,
    'failed Playwright transport close'
  );
  throw new PlaywrightConnectFailedError(cause, receipt);
}

async function bestEffortHandoffCleanup(
  browser: BrowserPort,
  transport: PlaywrightTransportPort,
  timeoutMs: number,
  disconnect: DisconnectObservation,
  onProtocolFailure: (error: Error) => void
): Promise<void> {
  try {
    await browser.close();
  } catch (error) {
    onProtocolFailure(error instanceof Error ? error : new Error('Browser close failed.'));
  }
  transport.close();
  try {
    await withTimeout(
      Promise.all([disconnect.promise, transport.closed]),
      timeoutMs,
      'failed Playwright handoff cleanup'
    );
  } catch (error) {
    onProtocolFailure(error instanceof Error ? error : new Error('Handoff cleanup failed.'));
  } finally {
    browser.off('disconnected', disconnect.listener);
  }
}

class PlaywrightOwnerImpl implements PlaywrightOwner {
  readonly facade: PlaywrightEpochFacade;
  readonly handoff: PlaywrightHandoffReceiptV1;
  readonly #resources: OwnedResources;
  #releasePromise: Promise<PlaywrightReleaseReceiptV1> | undefined;

  constructor(resources: OwnedResources) {
    this.#resources = resources;
    this.handoff = Object.freeze({
      schemaVersion: 1,
      processGeneration: resources.options.processGeneration,
      leaseEpoch: resources.options.leaseEpoch,
      playwrightEpoch: resources.options.playwrightEpoch,
      workerUrl: resources.authority.scriptURL,
    });
    this.facade = Object.freeze({
      openFixturePage: (url: string) => this.#openFixturePage(url),
      evaluateInServiceWorker: (expression: string) => this.#evaluate(expression),
    });
  }

  release(): Promise<PlaywrightReleaseReceiptV1> {
    this.#releasePromise ??= this.#performRelease();
    return this.#releasePromise;
  }

  async #openFixturePage(url: string): Promise<PagePort> {
    assertCurrent(this.#resources.runtime);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Fixture page URL must be absolute.');
    }
    if (
      parsed.protocol !== 'chrome-extension:' ||
      parsed.host !== this.#resources.authority.extensionId
    ) {
      throw new Error('Fixture page URL must belong to the frozen extension.');
    }
    const page = await this.#resources.context.newPage();
    this.#resources.fixturePages.add(page);
    try {
      await page.goto(url);
    } catch (error) {
      await page.close().catch(() => undefined);
      throw error;
    }
    assertCurrent(this.#resources.runtime);
    return page;
  }

  async #evaluate(expression: string): Promise<unknown> {
    if (
      typeof expression !== 'string' ||
      expression.length === 0 ||
      expression.includes('\u0000')
    ) {
      throw new Error('Service-worker evaluation expression is invalid.');
    }
    const uniqueContextId = assertCurrent(this.#resources.runtime);
    const response = await this.#resources.nested.sendCommand('Runtime.evaluate', {
      expression,
      uniqueContextId,
      awaitPromise: true,
      returnByValue: true,
    });
    assertCurrent(this.#resources.runtime);
    return readEvaluationValue(response, 'Service-worker evaluation');
  }

  async #performRelease(): Promise<PlaywrightReleaseReceiptV1> {
    const resources = this.#resources;
    const { runtime, options } = resources;
    runtime.releasing = true;
    runtime.active = false;
    const failures: Error[] = [];
    const attempt = async (effect: () => Promise<unknown>): Promise<void> => {
      try {
        await withTimeout(
          Promise.resolve().then(effect),
          options.releaseTimeoutMs,
          'release effect'
        );
      } catch (error) {
        failures.push(
          error instanceof Error ? error : new Error('Playwright release effect failed.')
        );
      }
    };

    for (const page of resources.fixturePages) {
      await attempt(() => page.close());
    }
    await attempt(() => resources.nested.sendCommand('Runtime.disable'));
    await attempt(() => resources.nested.sendCommand('Inspector.disable'));

    const detached = deferred();
    const onDetached = (event: Record<string, unknown>): void => {
      if (event.sessionId === resources.nestedSessionId) {
        detached.resolve();
      }
    };
    resources.browserSession.on('Target.detachedFromTarget', onDetached);
    await attempt(async () => {
      await resources.browserSession.send('Target.detachFromTarget', {
        sessionId: resources.nestedSessionId,
      });
      await withTimeout(detached.promise, options.releaseTimeoutMs, 'matching nested detach event');
    });
    resources.browserSession.off('Target.detachedFromTarget', onDetached);
    resources.removeRuntimeListener();
    resources.nested.dispose();
    await attempt(() => resources.sentinelSession.send('ServiceWorker.disable'));
    resources.removeSessionListeners();
    await attempt(() => resources.sentinelSession.detach());
    await attempt(() => resources.browserSession.detach());

    let browserCloseResolved = false;
    await attempt(async () => {
      await resources.browser.close();
      browserCloseResolved = true;
    });
    resources.transport.close();
    let transportClose: TrackedTransportCloseReceipt | undefined;
    await attempt(async () => {
      const [receipt] = await Promise.all([
        resources.transport.closed,
        resources.disconnect.promise,
      ]);
      transportClose = receipt;
    });
    resources.browser.off('disconnected', resources.disconnect.listener);

    if (!browserCloseResolved || !resources.disconnect.observed || !transportClose) {
      failures.push(new Error('Playwright release lacks browser, disconnect or transport proof.'));
    }
    if (failures.length > 0) {
      for (const failure of failures) {
        options.onProtocolFailure(failure);
      }
      throw new AggregateError(failures, 'Playwright release proof is incomplete.');
    }
    if (!transportClose) {
      throw protocolFailure(options, new Error('Tracked transport close receipt is missing.'));
    }
    if (
      transportClose.processGeneration !== options.processGeneration ||
      transportClose.leaseEpoch !== options.leaseEpoch ||
      transportClose.transportId !== resources.transport.openReceipt.transportId
    ) {
      throw protocolFailure(options, new Error('Tracked transport close receipt is stale.'));
    }
    return Object.freeze({
      schemaVersion: 1,
      processGeneration: options.processGeneration,
      leaseEpoch: options.leaseEpoch,
      playwrightEpoch: options.playwrightEpoch,
      browserCloseResolved: true,
      disconnectedObserved: true,
      transportClose: Object.freeze({ ...transportClose }),
    });
  }
}

export async function acquirePlaywrightOwner(
  options: AcquirePlaywrightOwnerOptions
): Promise<PlaywrightOwner> {
  assertSafeInteger(options.processGeneration, 'processGeneration');
  assertSafeInteger(options.leaseEpoch, 'leaseEpoch');
  assertSafeInteger(options.playwrightEpoch, 'playwrightEpoch');
  if (options.handoffTimeoutMs < 1 || options.releaseTimeoutMs < 1) {
    throw new Error('Playwright owner timeouts must be positive.');
  }
  const authority = options.authority;
  if (
    options.transport.openReceipt.processGeneration !== options.processGeneration ||
    options.transport.openReceipt.leaseEpoch !== options.leaseEpoch
  ) {
    throw new Error('Tracked Playwright transport does not match the reserved lease.');
  }
  options.transport.open?.();

  let browser: BrowserPort;
  try {
    browser = await options.connect.connectOverCDP(options.transport, {
      isLocal: true,
      noDefaults: true,
      timeout: options.handoffTimeoutMs,
    });
  } catch (error) {
    return closeConnectFailure(options, error);
  }

  const disconnect = createDisconnectObservation(browser);
  try {
    const contexts = browser.contexts();
    if (contexts.length !== 1) {
      throw new Error('Playwright must expose exactly one browser context.');
    }
    const context = contexts[0];
    const sentinels = context.pages().filter((page) => page.url() === 'about:blank');
    if (sentinels.length !== 1) {
      throw new Error('Playwright must expose exactly one about:blank sentinel.');
    }
    const sentinel = sentinels[0];
    const workers = context.serviceWorkers();
    if (workers.length !== 1 || workers[0].url() !== authority.scriptURL) {
      throw new Error('Playwright must expose exactly the frozen service worker URL.');
    }

    const runtime: RuntimeState = {
      active: false,
      blocked: undefined,
      releasing: false,
      uniqueContextId: undefined,
    };
    const sentinelSession = await context.newCDPSession(sentinel);
    const registrations = new Map<string, RegistrationState>();
    const versions = new Map<string, VersionState>();
    let metadataFailure: Error | undefined;
    const metadataReady = deferred();
    const signalMetadata = (): void => {
      if (
        metadataFailure ||
        (registrations.has(authority.registrationId) && versions.has(authority.versionId))
      ) {
        metadataReady.resolve();
      }
    };
    const failMetadata = (message: string): void => {
      metadataFailure ??= protocolFailure(options, new Error(message));
      if (runtime.active) {
        runtime.blocked ??= metadataFailure;
      }
      signalMetadata();
    };
    const onRegistrations = (event: Record<string, unknown>): void => {
      if (!Array.isArray(event.registrations)) {
        return failMetadata('Malformed registration update.');
      }
      for (const value of event.registrations) {
        const registration = parseRegistration(value);
        if (!registration) {
          return failMetadata('Malformed registration member.');
        }
        registrations.set(registration.registrationId, registration);
        if (
          runtime.active &&
          registration.registrationId === authority.registrationId &&
          (registration.isDeleted || registration.scopeURL !== authority.scopeURL)
        ) {
          return failMetadata('Frozen service-worker registration changed during the epoch.');
        }
      }
      signalMetadata();
    };
    const onVersions = (event: Record<string, unknown>): void => {
      if (!Array.isArray(event.versions)) {
        return failMetadata('Malformed version update.');
      }
      for (const value of event.versions) {
        const version = parseVersion(value);
        if (!version) {
          return failMetadata('Malformed version member.');
        }
        versions.set(version.versionId, version);
        if (
          runtime.active &&
          version.versionId === authority.versionId &&
          (version.registrationId !== authority.registrationId ||
            version.scriptURL !== authority.scriptURL ||
            version.targetId !== authority.targetId ||
            version.status !== 'activated' ||
            version.runningStatus !== 'running')
        ) {
          return failMetadata('Frozen service-worker version changed during the epoch.');
        }
      }
      signalMetadata();
    };
    const onWorkerError = (event: Record<string, unknown>): void => {
      const errorMessage = event.errorMessage;
      if (
        runtime.active &&
        isRecord(errorMessage) &&
        errorMessage.sourceURL === authority.scriptURL
      ) {
        runtime.blocked ??= new Error('The frozen service worker reported an application error.');
      }
      options.onDiagnostic(
        Object.freeze({
          method: 'ServiceWorker.workerErrorReported',
          params: Object.freeze({ ...event }),
          playwrightEpoch: options.playwrightEpoch,
          processGeneration: options.processGeneration,
        })
      );
    };
    sentinelSession.on('ServiceWorker.workerRegistrationUpdated', onRegistrations);
    sentinelSession.on('ServiceWorker.workerVersionUpdated', onVersions);
    sentinelSession.on('ServiceWorker.workerErrorReported', onWorkerError);
    let releasing = false;
    const onSentinelClose = (): void => {
      if (!releasing) {
        metadataFailure ??= protocolFailure(options, new Error('Sentinel CDP session closed.'));
      }
    };
    sentinelSession.on('close', onSentinelClose);
    await sentinelSession.send('ServiceWorker.enable');

    const browserSession = await browser.newBrowserCDPSession();
    const onBrowserSessionClose = (): void => {
      if (!releasing) {
        metadataFailure ??= protocolFailure(options, new Error('Browser CDP session closed.'));
      }
    };
    browserSession.on('close', onBrowserSessionClose);
    assertBrowserVersion(await browserSession.send('Browser.getVersion'), options.browserVersion);
    const targetFence = await browserSession.send('Target.getTargets', {
      filter: SERVICE_WORKER_FILTER,
    });
    requireExactWorkerTarget(targetFence, authority);
    const nestedSessionId = readNestedSessionId(
      await browserSession.send('Target.attachToTarget', {
        targetId: authority.targetId,
        flatten: false,
      })
    );
    const nested = new NestedCdpSession({
      browserSession: nestedAdapter(browserSession),
      nestedSessionId,
      onProtocolFailure: (error) => {
        runtime.blocked ??= protocolFailure(options, error);
      },
    });
    const onUnexpectedNestedDetach = (event: Record<string, unknown>): void => {
      if (event.sessionId === nestedSessionId && !runtime.releasing) {
        runtime.blocked ??= protocolFailure(
          options,
          new Error('Nested diagnostic session detached during the Playwright epoch.')
        );
      }
    };
    const onUnexpectedDisconnect = (): void => {
      if (runtime.active && !runtime.releasing) {
        runtime.blocked ??= protocolFailure(
          options,
          new Error('Playwright disconnected during the owned epoch.')
        );
      }
    };
    browserSession.on('Target.detachedFromTarget', onUnexpectedNestedDetach);
    browser.on('disconnected', onUnexpectedDisconnect);
    const contextIds = new Set<string>();
    const runtimeChanged = deferred();
    const removeRuntimeListener = nested.onEvent((event) => {
      try {
        const uniqueContextId = readUniqueContextId(event);
        if (uniqueContextId) {
          contextIds.add(uniqueContextId);
          if (contextIds.size > 1) {
            runtime.blocked ??= protocolFailure(
              options,
              new Error('Playwright owner observed more than exactly one unique runtime context.')
            );
          } else {
            runtime.uniqueContextId = uniqueContextId;
          }
          runtimeChanged.resolve();
          return;
        }
        if (
          event.method === 'Inspector.targetCrashed' ||
          event.method === 'Inspector.targetReloadedAfterCrash' ||
          event.method === 'Runtime.executionContextsCleared' ||
          event.method === 'Runtime.executionContextDestroyed'
        ) {
          if (runtime.releasing) {
            return;
          }
          runtime.blocked ??= protocolFailure(
            options,
            new Error(`Unexpected ${event.method} during the Playwright epoch.`)
          );
          runtimeChanged.resolve();
        }
        if (
          event.method === 'Runtime.exceptionThrown' ||
          event.method === 'Runtime.consoleAPICalled' ||
          event.method.startsWith('Inspector.')
        ) {
          options.onDiagnostic(
            Object.freeze({
              method: event.method,
              params: Object.freeze({ ...event.params }),
              playwrightEpoch: options.playwrightEpoch,
              processGeneration: options.processGeneration,
            })
          );
        }
      } catch (error) {
        runtime.blocked ??= protocolFailure(
          options,
          error instanceof Error ? error : new Error('Nested runtime event is invalid.')
        );
        runtimeChanged.resolve();
      }
    });

    await nested.sendCommand('Inspector.enable');
    await nested.sendCommand('Runtime.enable');
    await nested.drainEvents();
    if (!runtime.uniqueContextId && !runtime.blocked) {
      await withTimeout(runtimeChanged.promise, options.handoffTimeoutMs, 'unique runtime context');
      await nested.drainEvents();
    }
    if (runtime.blocked) {
      throw runtime.blocked;
    }
    if (contextIds.size !== 1 || !runtime.uniqueContextId) {
      throw new Error('Playwright handoff requires exactly one unique runtime context.');
    }

    const registration = registrations.get(authority.registrationId);
    const version = versions.get(authority.versionId);
    if (!registration || !version) {
      if (metadataFailure) {
        throw metadataFailure;
      }
      await withTimeout(metadataReady.promise, options.handoffTimeoutMs, 'service-worker metadata');
    }
    if (metadataFailure) {
      throw metadataFailure;
    }
    const exactRegistration = registrations.get(authority.registrationId);
    const exactVersion = versions.get(authority.versionId);
    if (
      !exactRegistration ||
      exactRegistration.isDeleted ||
      exactRegistration.scopeURL !== authority.scopeURL ||
      !exactVersion ||
      exactVersion.registrationId !== authority.registrationId ||
      exactVersion.scriptURL !== authority.scriptURL ||
      exactVersion.targetId !== authority.targetId ||
      exactVersion.status !== 'activated' ||
      exactVersion.runningStatus !== 'running'
    ) {
      throw new Error('Sentinel metadata does not match the frozen running authority.');
    }

    const identity = readEvaluationValue(
      await nested.sendCommand('Runtime.evaluate', {
        expression: IDENTITY_EXPRESSION,
        uniqueContextId: runtime.uniqueContextId,
        awaitPromise: true,
        returnByValue: true,
      }),
      'Native service-worker identity evaluation'
    );
    assertIdentity(identity, authority);
    if (disconnect.observed) {
      throw new Error('Playwright disconnected during handoff.');
    }
    runtime.active = true;
    const removeSessionListeners = (): void => {
      releasing = true;
      sentinelSession.off('ServiceWorker.workerRegistrationUpdated', onRegistrations);
      sentinelSession.off('ServiceWorker.workerVersionUpdated', onVersions);
      sentinelSession.off('ServiceWorker.workerErrorReported', onWorkerError);
      sentinelSession.off('close', onSentinelClose);
      browserSession.off('close', onBrowserSessionClose);
      browserSession.off('Target.detachedFromTarget', onUnexpectedNestedDetach);
      browser.off('disconnected', onUnexpectedDisconnect);
    };
    return new PlaywrightOwnerImpl({
      authority,
      browser,
      browserSession,
      context,
      disconnect,
      fixturePages: new Set(),
      nested,
      nestedSessionId,
      options,
      removeRuntimeListener,
      removeSessionListeners,
      runtime,
      sentinel,
      sentinelSession,
      transport: options.transport,
    });
  } catch (error) {
    await bestEffortHandoffCleanup(
      browser,
      options.transport,
      options.releaseTimeoutMs,
      disconnect,
      options.onProtocolFailure
    );
    throw error;
  }
}
