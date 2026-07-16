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
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
  claimed: boolean;
}

interface AttachedTarget {
  readonly sessionId: string;
  readonly targetId: string;
  readonly type: string;
  readonly url: string;
  readonly waitingForDebugger: boolean;
}

const targetFilter = [{ type: 'service_worker', exclude: false }, { exclude: true }] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
      for (const command of this.#pending.values()) {
        command.reject(new Error('Browser CDP WebSocket closed before replying.'));
      }
      this.#pending.clear();
    });
  }

  static async connect(webSocketUrl: string): Promise<RawCdpClient> {
    const socket = new WebSocket(webSocketUrl);
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const timeout = setTimeout(
        () => rejectPromise(new Error('Timed out connecting to the browser CDP WebSocket.')),
        10_000
      );
      socket.addEventListener(
        'open',
        () => {
          clearTimeout(timeout);
          resolvePromise();
        },
        { once: true }
      );
      socket.addEventListener(
        'error',
        () => {
          clearTimeout(timeout);
          rejectPromise(new Error('Browser CDP WebSocket connection failed.'));
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
    this.#socket.close();
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
  #preparations = new Set<Promise<void>>();
  #registrationScope: string | undefined;
  #versionId: string | undefined;
  #eventLog: string[] = [];
  #instrumentedSessionId: string | undefined;
  #executionContextObserved = false;

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
    await client.send('Target.autoAttachRelated', {
      targetId: [...initialTargetIds][0],
      waitForDebuggerOnStart: true,
      filter: [...targetFilter],
    });
    await this.#waitForInstrumentedSession();
    await this.#waitForExecutionContext();
    const serviceWorkerCdp = await this.#context.newCDPSession(this.#controlPage);
    this.#serviceWorkerCdp = serviceWorkerCdp;
    serviceWorkerCdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
      for (const registration of registrations) {
        if (
          !registration.isDeleted &&
          isExtensionServiceWorkerUrl(registration.scopeURL, this.#extensionId)
        ) {
          this.#registrationScope = registration.scopeURL;
        }
      }
    });
    serviceWorkerCdp.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
      for (const version of versions) {
        if (
          version.status !== 'redundant' &&
          isExtensionServiceWorkerUrl(version.scriptURL, this.#extensionId)
        ) {
          this.#versionId = version.versionId;
        }
      }
    });
    serviceWorkerCdp.on('ServiceWorker.workerErrorReported', ({ errorMessage }) => {
      if (isExtensionServiceWorkerUrl(errorMessage.sourceURL, this.#extensionId)) {
        recordWorkerException(this.#diagnostics, errorMessage.errorMessage);
      }
    });
    await serviceWorkerCdp.send('ServiceWorker.enable');
  }

  async restart(currentWorker: Worker, probeExpression?: string): Promise<Worker> {
    if (this.#bootstrapWaiter) {
      throw new Error('A packaged service-worker bootstrap is already pending.');
    }
    const { registrationScope, versionId } = await this.#waitForWorkerMetadata();

    const bootstrapPrepared = new Promise<void>((resolvePromise, rejectPromise) => {
      const timeout = setTimeout(() => {
        if (this.#bootstrapWaiter?.timeout === timeout) {
          this.#bootstrapWaiter = undefined;
        }
        rejectPromise(
          new Error(
            `Timed out waiting for the instrumented replacement service-worker bootstrap. CDP: ${this.#eventLog.join(' | ') || 'no target events'}`
          )
        );
      }, 20_000);
      this.#bootstrapWaiter = {
        probeExpression,
        resolve: resolvePromise,
        reject: rejectPromise,
        timeout,
        claimed: false,
      };
    });
    try {
      const serviceWorkerCdp = this.#requireServiceWorkerCdp();
      await serviceWorkerCdp.send('ServiceWorker.stopWorker', { versionId });
      const startWorker = serviceWorkerCdp.send('ServiceWorker.startWorker', {
        scopeURL: registrationScope,
      });
      await Promise.all([bootstrapPrepared, startWorker]);
      const worker =
        this.#context
          .serviceWorkers()
          .find((candidate) => isExtensionServiceWorkerUrl(candidate.url(), this.#extensionId)) ??
        currentWorker;
      const observedExtensionId = await worker.evaluate(() => chrome.runtime.id);
      if (observedExtensionId !== this.#extensionId) {
        throw new Error('Restarted packaged worker belongs to an unexpected extension.');
      }
      this.#instrumentWorker(worker);
      return worker;
    } catch (error) {
      this.#rejectBootstrapWaiter(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.#rejectBootstrapWaiter(new Error('CDP bootstrap observer stopped.'));
    await Promise.allSettled([...this.#preparations]);
    if (this.#serviceWorkerCdp) {
      await this.#serviceWorkerCdp.send('ServiceWorker.disable').catch(() => undefined);
      await this.#serviceWorkerCdp.detach().catch(() => undefined);
    }
    this.#serviceWorkerCdp = undefined;
    if (this.#client) {
      await this.#client
        .send('Target.setAutoAttach', {
          autoAttach: false,
          waitForDebuggerOnStart: false,
          flatten: true,
        })
        .catch(() => undefined);
      this.#client.close();
    }
    this.#client = undefined;
  }

  #handleEvent(message: ProtocolMessage): void {
    if (
      message.method?.startsWith('Target.') ||
      message.method === 'Runtime.executionContextCreated' ||
      message.method === 'Runtime.executionContextDestroyed'
    ) {
      this.#eventLog.push(
        `${message.method}:${JSON.stringify(message.params)?.slice(0, 500) ?? ''}`
      );
      this.#eventLog = this.#eventLog.slice(-20);
    }
    if (message.method === 'Target.attachedToTarget') {
      const attached = readAttachedTarget(message.params);
      if (
        !attached ||
        attached.type !== 'service_worker' ||
        !isExtensionServiceWorkerUrl(attached.url, this.#extensionId)
      ) {
        return;
      }
      const preparation = this.#prepareAttachedTarget(attached)
        .catch((error: unknown) => {
          this.#rejectBootstrapWaiter(error instanceof Error ? error : new Error(String(error)));
        })
        .finally(() => this.#preparations.delete(preparation));
      this.#preparations.add(preparation);
      return;
    }

    if (message.method === 'Runtime.executionContextCreated') {
      this.#executionContextObserved = true;
      const waiter = this.#bootstrapWaiter;
      if (waiter && !waiter.claimed && message.sessionId) {
        waiter.claimed = true;
        const preparation = this.#prepareExistingSession(message.sessionId, waiter)
          .catch((error: unknown) => {
            this.#completeBootstrapWaiter(
              waiter,
              error instanceof Error ? error : new Error(String(error))
            );
          })
          .finally(() => this.#preparations.delete(preparation));
        this.#preparations.add(preparation);
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

  async #prepareAttachedTarget(attached: AttachedTarget): Promise<void> {
    const client = this.#requireClient();
    const waiter = this.#bootstrapWaiter;
    const isReplacement = waiter !== undefined && !waiter.claimed;
    if (isReplacement) {
      waiter.claimed = true;
    }
    let setupError: Error | undefined;

    try {
      await client.send('Runtime.enable', {}, attached.sessionId);
      this.#instrumentedSessionId = attached.sessionId;
      if (isReplacement && waiter?.probeExpression) {
        await client.send(
          'Runtime.evaluate',
          { expression: waiter.probeExpression },
          attached.sessionId
        );
      }
    } catch (error) {
      setupError = error instanceof Error ? error : new Error(String(error));
    } finally {
      if (attached.waitingForDebugger) {
        try {
          await client.send('Runtime.runIfWaitingForDebugger', {}, attached.sessionId);
        } catch (error) {
          setupError ??= error instanceof Error ? error : new Error(String(error));
        }
      }
    }

    if (!isReplacement || !waiter) {
      return;
    }
    this.#completeBootstrapWaiter(waiter, setupError);
  }

  async #prepareExistingSession(sessionId: string, waiter: BootstrapWaiter): Promise<void> {
    let setupError: Error | undefined;
    try {
      if (waiter.probeExpression) {
        await this.#requireClient().send(
          'Runtime.evaluate',
          { expression: waiter.probeExpression },
          sessionId
        );
      }
    } catch (error) {
      setupError = error instanceof Error ? error : new Error(String(error));
    } finally {
      try {
        await this.#requireClient().send('Runtime.runIfWaitingForDebugger', {}, sessionId);
      } catch (error) {
        setupError ??= error instanceof Error ? error : new Error(String(error));
      }
    }
    this.#completeBootstrapWaiter(waiter, setupError);
  }

  async #waitForWorkerMetadata(): Promise<{
    registrationScope: string;
    versionId: string;
  }> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (this.#registrationScope && this.#versionId) {
        return {
          registrationScope: this.#registrationScope,
          versionId: this.#versionId,
        };
      }
      await delay(25);
    }
    throw new Error('CDP did not expose the packaged service-worker registration metadata.');
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
    throw new Error('CDP did not observe the initial packaged worker execution context.');
  }

  #completeBootstrapWaiter(waiter: BootstrapWaiter, error?: Error): void {
    if (this.#bootstrapWaiter !== waiter) {
      return;
    }
    this.#bootstrapWaiter = undefined;
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
