import { describe, expect, it, vi } from 'vitest';
import { parsePlaywrightAuthorityV1 } from '../../mv3/harness/playwright-authority';
import {
  acquirePlaywrightOwner,
  PlaywrightConnectFailedError,
  type BrowserCdpSessionPort,
  type BrowserContextPort,
  type BrowserPort,
  type CdpSessionPort,
  type PagePort,
  type PlaywrightAuthority,
  type PlaywrightConnectPort,
  type PlaywrightTransportPort,
  type WorkerPort,
} from '../../mv3/harness/playwright-owner';

const EXTENSION_ID = 'a'.repeat(32);
const AUTHORITY_RESULT = parsePlaywrightAuthorityV1({
  extensionId: EXTENSION_ID,
  registrationId: 'registration-1',
  scopeURL: `chrome-extension://${EXTENSION_ID}/`,
  scriptURL: `chrome-extension://${EXTENSION_ID}/background/service-worker.js`,
  targetId: 'worker-target-1',
  versionId: 'version-1',
});
if (!AUTHORITY_RESULT.ok) {
  throw new Error('Playwright owner test authority is invalid.');
}
const AUTHORITY: PlaywrightAuthority = AUTHORITY_RESULT.authority;

const BROWSER_VERSION = Object.freeze({
  jsVersion: '14.9.207.21',
  product: 'Chrome/149.0.7827.55',
  protocolVersion: '1.3',
  revision: '@3188f8a607ae7e067593be8aab7f02d2451fec07',
  userAgent: 'Mozilla/5.0 Chrome/149.0.7827.55',
});

type EventListener = (event: Record<string, unknown>) => void;

class FakePage implements PagePort {
  closed = false;
  readonly events: string[];
  #url: string;

  constructor(url: string, events: string[]) {
    this.#url = url;
    this.events = events;
  }

  url(): string {
    return this.#url;
  }

  async goto(url: string): Promise<void> {
    this.#url = url;
    this.events.push(`page.goto:${url}`);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.events.push(`page.close:${this.#url}`);
  }
}

class FakeWorker implements WorkerPort {
  constructor(readonly workerUrl: string) {}

  url(): string {
    return this.workerUrl;
  }
}

class FakeSession implements CdpSessionPort {
  readonly sent: Array<{ method: string; params: Readonly<Record<string, unknown>> }> = [];
  readonly events: string[];
  readonly #listeners = new Map<string, Set<EventListener>>();
  onSend: ((method: string, params: Readonly<Record<string, unknown>>) => unknown) | undefined;

  constructor(events: string[]) {
    this.events = events;
  }

  on(event: string, listener: EventListener): void {
    const listeners = this.#listeners.get(event) ?? new Set<EventListener>();
    listeners.add(listener);
    this.#listeners.set(event, listeners);
  }

  off(event: string, listener: EventListener): void {
    this.#listeners.get(event)?.delete(listener);
  }

  emit(event: string, payload: Record<string, unknown>): void {
    for (const listener of this.#listeners.get(event) ?? []) {
      listener(payload);
    }
  }

  async send(
    method: string,
    params: Readonly<Record<string, unknown>> = {}
  ): Promise<Record<string, unknown>> {
    this.sent.push({ method, params });
    this.events.push(`send:${method}`);
    return (this.onSend?.(method, params) ?? {}) as Record<string, unknown>;
  }

  async detach(): Promise<void> {
    this.events.push('session.detach');
  }
}

class FakeTransport implements PlaywrightTransportPort {
  readonly events: string[];
  readonly openReceipt = Object.freeze({
    schemaVersion: 1 as const,
    processGeneration: 7,
    leaseEpoch: 8,
    transportId: 'playwright-transport-8',
  });
  readonly closed: Promise<{
    readonly schemaVersion: 1;
    readonly processGeneration: number;
    readonly leaseEpoch: number;
    readonly transportId: string;
    readonly code: number;
    readonly reason: string;
  }>;
  onmessage?: (message: object) => void;
  onclose?: (reason?: string) => void;
  #resolveClosed!: (receipt: {
    readonly schemaVersion: 1;
    readonly processGeneration: number;
    readonly leaseEpoch: number;
    readonly transportId: string;
    readonly code: number;
    readonly reason: string;
  }) => void;
  #closed = false;

  constructor(events: string[]) {
    this.events = events;
    this.closed = new Promise((resolve) => {
      this.#resolveClosed = resolve;
    });
  }

  open(): void {
    this.events.push('transport.open');
  }

  send(): void {}

  close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.events.push('transport.close');
    const receipt = Object.freeze({
      ...this.openReceipt,
      code: 1000,
      reason: 'closed',
    });
    this.#resolveClosed(receipt);
    this.onclose?.(receipt.reason);
  }
}

interface HarnessFakes {
  readonly browser: FakeBrowser;
  readonly browserSession: FakeSession;
  readonly connect: PlaywrightConnectPort;
  readonly context: FakeContext;
  readonly events: string[];
  readonly sentinel: FakePage;
  readonly sentinelSession: FakeSession;
  readonly transport: FakeTransport;
}

class FakeContext implements BrowserContextPort {
  readonly #pages: FakePage[];
  readonly #workers: FakeWorker[];
  readonly #sentinelSession: FakeSession;
  readonly events: string[];

  constructor(
    pages: FakePage[],
    workers: FakeWorker[],
    sentinelSession: FakeSession,
    events: string[]
  ) {
    this.#pages = pages;
    this.#workers = workers;
    this.#sentinelSession = sentinelSession;
    this.events = events;
  }

  pages(): PagePort[] {
    return [...this.#pages];
  }

  serviceWorkers(): WorkerPort[] {
    return [...this.#workers];
  }

  async newCDPSession(): Promise<CdpSessionPort> {
    return this.#sentinelSession;
  }

  async newPage(): Promise<PagePort> {
    const page = new FakePage('about:blank', this.events);
    this.#pages.push(page);
    return page;
  }
}

class FakeBrowser implements BrowserPort {
  readonly #contexts: BrowserContextPort[];
  readonly #browserSession: BrowserCdpSessionPort;
  readonly #transport: FakeTransport;
  readonly #listeners = new Set<() => void>();
  readonly events: string[];

  constructor(
    contexts: BrowserContextPort[],
    browserSession: BrowserCdpSessionPort,
    transport: FakeTransport,
    events: string[]
  ) {
    this.#contexts = contexts;
    this.#browserSession = browserSession;
    this.#transport = transport;
    this.events = events;
  }

  contexts(): BrowserContextPort[] {
    return [...this.#contexts];
  }

  async newBrowserCDPSession(): Promise<BrowserCdpSessionPort> {
    return this.#browserSession;
  }

  on(event: 'disconnected', listener: () => void): void {
    if (event === 'disconnected') {
      this.#listeners.add(listener);
    }
  }

  off(event: 'disconnected', listener: () => void): void {
    if (event === 'disconnected') {
      this.#listeners.delete(listener);
    }
  }

  async close(): Promise<void> {
    this.events.push('browser.close');
    for (const listener of this.#listeners) {
      listener();
    }
    this.events.push('browser.disconnected');
    this.#transport.close();
  }
}

function createFakes(
  overrides: {
    readonly contextCount?: number;
    readonly pageUrls?: readonly string[];
    readonly workerUrls?: readonly string[];
    readonly identity?: Readonly<{ workerUrl: string; registrationScope: string }>;
    readonly secondUniqueContextId?: string;
  } = {}
): HarnessFakes {
  const events: string[] = [];
  const transport = new FakeTransport(events);
  const sentinel = new FakePage('about:blank', events);
  const sentinelSession = new FakeSession(events);
  const browserSession = new FakeSession(events);
  const pageUrls = overrides.pageUrls ?? ['about:blank'];
  const workerUrls = overrides.workerUrls ?? [AUTHORITY.scriptURL];
  const pages = pageUrls.map((url, index) =>
    index === 0 && url === 'about:blank' ? sentinel : new FakePage(url, events)
  );
  const workers = workerUrls.map((url) => new FakeWorker(url));
  const context = new FakeContext(pages, workers, sentinelSession, events);

  sentinelSession.onSend = (method) => {
    if (method === 'ServiceWorker.enable') {
      sentinelSession.emit('ServiceWorker.workerRegistrationUpdated', {
        registrations: [
          {
            isDeleted: false,
            registrationId: AUTHORITY.registrationId,
            scopeURL: AUTHORITY.scopeURL,
          },
        ],
      });
      sentinelSession.emit('ServiceWorker.workerVersionUpdated', {
        versions: [
          {
            registrationId: AUTHORITY.registrationId,
            runningStatus: 'running',
            scriptURL: AUTHORITY.scriptURL,
            status: 'activated',
            targetId: AUTHORITY.targetId,
            versionId: AUTHORITY.versionId,
          },
        ],
      });
    }
    return {};
  };

  browserSession.onSend = (method, params) => {
    if (method === 'Browser.getVersion') {
      return BROWSER_VERSION;
    }
    if (method === 'Target.getTargets') {
      return {
        targetInfos: [
          {
            attached: true,
            targetId: AUTHORITY.targetId,
            type: 'service_worker',
            url: AUTHORITY.scriptURL,
          },
        ],
      };
    }
    if (method === 'Target.attachToTarget') {
      return { sessionId: 'nested-session-1' };
    }
    if (method === 'Target.sendMessageToTarget') {
      const nested = JSON.parse(String(params.message)) as {
        id: number;
        method: string;
        params: Record<string, unknown>;
      };
      if (nested.method === 'Runtime.enable') {
        browserSession.emit('Target.receivedMessageFromTarget', {
          message: JSON.stringify({
            method: 'Runtime.executionContextCreated',
            params: { context: { uniqueId: 'unique-context-1' } },
          }),
          sessionId: 'nested-session-1',
        });
        if (overrides.secondUniqueContextId) {
          browserSession.emit('Target.receivedMessageFromTarget', {
            message: JSON.stringify({
              method: 'Runtime.executionContextCreated',
              params: { context: { uniqueId: overrides.secondUniqueContextId } },
            }),
            sessionId: 'nested-session-1',
          });
        }
      }
      const result =
        nested.method === 'Runtime.evaluate'
          ? {
              result: {
                value:
                  overrides.identity ??
                  Object.freeze({
                    registrationScope: AUTHORITY.scopeURL,
                    workerUrl: AUTHORITY.scriptURL,
                  }),
              },
            }
          : {};
      browserSession.emit('Target.receivedMessageFromTarget', {
        message: JSON.stringify({ id: nested.id, result }),
        sessionId: 'nested-session-1',
      });
      return {};
    }
    if (method === 'Target.detachFromTarget') {
      browserSession.emit('Target.detachedFromTarget', { sessionId: 'nested-session-1' });
      return {};
    }
    return {};
  };

  const contextCount = overrides.contextCount ?? 1;
  const contexts = Array.from({ length: contextCount }, () => context);
  const browser = new FakeBrowser(contexts, browserSession, transport, events);
  const connectOverCDP = vi.fn(async () => browser);
  return {
    browser,
    browserSession,
    connect: { connectOverCDP },
    context,
    events,
    sentinel,
    sentinelSession,
    transport,
  };
}

function acquire(fakes: HarnessFakes) {
  return acquirePlaywrightOwner({
    authority: AUTHORITY,
    browserVersion: BROWSER_VERSION,
    connect: fakes.connect,
    handoffTimeoutMs: 15_000,
    leaseEpoch: 8,
    onDiagnostic: vi.fn(),
    onProtocolFailure: vi.fn(),
    playwrightEpoch: 9,
    processGeneration: 7,
    releaseTimeoutMs: 5_000,
    transport: fakes.transport,
  });
}

describe('acquirePlaywrightOwner', () => {
  it('connects through the already-open public transport and proves the exact handoff', async () => {
    const fakes = createFakes();

    const owner = await acquire(fakes);

    expect(fakes.connect.connectOverCDP).toHaveBeenCalledWith(fakes.transport, {
      isLocal: true,
      noDefaults: true,
      timeout: 15_000,
    });
    expect(fakes.sentinelSession.sent[0]).toEqual({ method: 'ServiceWorker.enable', params: {} });
    expect(fakes.browserSession.sent).toContainEqual({
      method: 'Target.getTargets',
      params: {
        filter: [{ type: 'service_worker', exclude: false }, { exclude: true }],
      },
    });
    expect(fakes.browserSession.sent).toContainEqual({
      method: 'Target.attachToTarget',
      params: { flatten: false, targetId: AUTHORITY.targetId },
    });
    const nestedMethods = fakes.browserSession.sent
      .filter(({ method }) => method === 'Target.sendMessageToTarget')
      .map(({ params }) => JSON.parse(String(params.message)).method);
    expect(nestedMethods.slice(0, 3)).toEqual([
      'Inspector.enable',
      'Runtime.enable',
      'Runtime.evaluate',
    ]);
    expect(owner.handoff).toEqual({
      leaseEpoch: 8,
      playwrightEpoch: 9,
      processGeneration: 7,
      schemaVersion: 1,
      workerUrl: AUTHORITY.scriptURL,
    });

    await owner.release();
  });

  it('tracks only facade-created pages and releases every proof in causal order', async () => {
    const fakes = createFakes();
    const owner = await acquire(fakes);
    const page = await owner.facade.openFixturePage(
      `chrome-extension://${EXTENSION_ID}/src/sidepanel/index.html`
    );

    const receipt = await owner.release();

    expect(page).toBeInstanceOf(FakePage);
    expect(fakes.sentinel.closed).toBe(false);
    expect(receipt).toEqual({
      browserCloseResolved: true,
      disconnectedObserved: true,
      leaseEpoch: 8,
      playwrightEpoch: 9,
      processGeneration: 7,
      schemaVersion: 1,
      transportClose: {
        code: 1000,
        leaseEpoch: 8,
        processGeneration: 7,
        reason: 'closed',
        schemaVersion: 1,
        transportId: 'playwright-transport-8',
      },
    });
    const fixtureClose = fakes.events.findIndex((event) =>
      event.startsWith('page.close:chrome-extension')
    );
    const runtimeDisable = fakes.events.indexOf(
      'send:Target.sendMessageToTarget',
      fixtureClose + 1
    );
    const serviceWorkerDisable = fakes.events.indexOf('send:ServiceWorker.disable');
    const browserClose = fakes.events.indexOf('browser.close');
    const transportClose = fakes.events.indexOf('transport.close');
    expect(fixtureClose).toBeGreaterThan(-1);
    expect(runtimeDisable).toBeGreaterThan(fixtureClose);
    expect(serviceWorkerDisable).toBeGreaterThan(runtimeDisable);
    expect(browserClose).toBeGreaterThan(serviceWorkerDisable);
    expect(transportClose).toBeGreaterThan(browserClose);
  });

  it('invalidates the epoch-bound facade before release starts', async () => {
    const fakes = createFakes();
    const owner = await acquire(fakes);

    await owner.release();

    await expect(
      owner.facade.openFixturePage(`chrome-extension://${EXTENSION_ID}/src/sidepanel/index.html`)
    ).rejects.toThrow('Playwright epoch is no longer current');
    await expect(owner.facade.evaluateInServiceWorker('1 + 1')).rejects.toThrow(
      'Playwright epoch is no longer current'
    );
  });

  it('evaluates effects only inside the frozen unique service-worker context', async () => {
    const fakes = createFakes();
    const owner = await acquire(fakes);

    await owner.facade.evaluateInServiceWorker('globalThis.location.href');

    const evaluation = fakes.browserSession.sent
      .filter(({ method }) => method === 'Target.sendMessageToTarget')
      .map(({ params }) => JSON.parse(String(params.message)))
      .find(
        (message: { method: string; params: Record<string, unknown> }) =>
          message.method === 'Runtime.evaluate' &&
          message.params.expression === 'globalThis.location.href'
      );
    expect(evaluation.params).toEqual({
      awaitPromise: true,
      expression: 'globalThis.location.href',
      returnByValue: true,
      uniqueContextId: 'unique-context-1',
    });

    await owner.release();
  });

  it.each([
    ['zero contexts', { contextCount: 0 }],
    ['two contexts', { contextCount: 2 }],
    ['zero sentinels', { pageUrls: [] }],
    ['two sentinels', { pageUrls: ['about:blank', 'about:blank'] }],
    ['zero workers', { workerUrls: [] }],
    ['two workers', { workerUrls: [AUTHORITY.scriptURL, AUTHORITY.scriptURL] }],
    ['wrong worker URL', { workerUrls: [`chrome-extension://${EXTENSION_ID}/wrong.js`] }],
  ])('rejects %s before exposing the facade', async (_label, overrides) => {
    const fakes = createFakes(overrides);

    await expect(acquire(fakes)).rejects.toThrow();

    expect(fakes.events).toContain('browser.close');
    await expect(fakes.transport.closed).resolves.toMatchObject({
      transportId: 'playwright-transport-8',
    });
  });

  it('rejects divergent native URL/scope identity before exposing the facade', async () => {
    const fakes = createFakes({
      identity: {
        registrationScope: AUTHORITY.scopeURL,
        workerUrl: `${AUTHORITY.scriptURL}?drift`,
      },
    });

    await expect(acquire(fakes)).rejects.toThrow('identity does not match');
  });

  it('rejects a second unique runtime context before exposing the facade', async () => {
    const fakes = createFakes({ secondUniqueContextId: 'unique-context-2' });

    await expect(acquire(fakes)).rejects.toThrow('exactly one unique runtime context');
  });

  it('revokes facade effects when a second runtime context appears after handoff', async () => {
    const fakes = createFakes();
    const owner = await acquire(fakes);
    fakes.browserSession.emit('Target.receivedMessageFromTarget', {
      message: JSON.stringify({
        method: 'Runtime.executionContextCreated',
        params: { context: { uniqueId: 'unexpected-context-2' } },
      }),
      sessionId: 'nested-session-1',
    });
    await Promise.resolve();

    await expect(owner.facade.evaluateInServiceWorker('1 + 1')).rejects.toThrow(
      'exactly one unique runtime context'
    );

    await owner.release();
  });

  it('closes the tracked transport when connectOverCDP rejects before returning a Browser', async () => {
    const fakes = createFakes();
    const connectFailure = new Error('connect failed');
    const connect: PlaywrightConnectPort = {
      connectOverCDP: vi.fn(async () => {
        throw connectFailure;
      }),
    };

    await expect(
      acquirePlaywrightOwner({
        authority: AUTHORITY,
        browserVersion: BROWSER_VERSION,
        connect,
        handoffTimeoutMs: 15_000,
        leaseEpoch: 8,
        onDiagnostic: vi.fn(),
        onProtocolFailure: vi.fn(),
        playwrightEpoch: 9,
        processGeneration: 7,
        releaseTimeoutMs: 5_000,
        transport: fakes.transport,
      })
    ).rejects.toBeInstanceOf(PlaywrightConnectFailedError);
    await expect(fakes.transport.closed).resolves.toMatchObject({
      leaseEpoch: 8,
      processGeneration: 7,
      transportId: 'playwright-transport-8',
    });
  });
});
