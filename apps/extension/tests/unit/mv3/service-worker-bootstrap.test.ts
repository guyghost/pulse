import type { BrowserContext, CDPSession, Page, Worker } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRuntimeDiagnostics } from '../../mv3/diagnostics';
import { ServiceWorkerBootstrapObserver } from '../../mv3/service-worker-bootstrap';

const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const FOREIGN_EXTENSION_ID = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
const WORKER_URL = `chrome-extension://${EXTENSION_ID}/service-worker-loader.js`;
const WORKER_SCOPE = `chrome-extension://${EXTENSION_ID}/`;
const REGISTRATION_ID = 'registration-1';
const VERSION_ID = 'version-1';
const IDENTITY_HANDSHAKE_EXPRESSION =
  '(() => ({ workerUrl: globalThis.location.href, registrationScope: globalThis.registration.scope }))()';
const MISSING_UNIQUE_ID = Symbol('missing uniqueId');
const SERVICE_WORKER_TARGET_FILTER = [
  { type: 'service_worker', exclude: false },
  { exclude: true },
] as const;

type SocketListener = (event: { data?: string }) => void;
type ConnectionOutcome = 'open' | 'timeout' | 'error';

interface SentCommand {
  readonly id: number;
  readonly method: string;
  readonly params?: unknown;
  readonly sessionId?: string;
}

interface PlannedResponse {
  readonly method: string;
  readonly hold?: boolean;
  readonly result?: unknown;
  readonly error?: string;
}

interface HeldResponse {
  readonly command: SentCommand;
  readonly plan: PlannedResponse;
  readonly respond: (override?: Omit<PlannedResponse, 'method' | 'hold'>) => void;
}

class FakeWebSocket {
  static readonly OPEN = 1;
  static latest: FakeWebSocket | null = null;
  static initialPlans: PlannedResponse[] = [];
  static nextAutoInitialContext = true;
  static nextInitialWaitingForDebugger = true;
  static nextConnectionOutcome: ConnectionOutcome = 'open';

  readonly sent: SentCommand[] = [];
  readonly #listeners = new Map<string, Set<SocketListener>>();
  readonly #plans: PlannedResponse[];
  readonly #held: HeldResponse[] = [];
  readonly #autoInitialContext: boolean;
  readonly #initialWaitingForDebugger: boolean;
  readonly #targetInfos = new Map<string, { targetId: string; type: string; url: string }>([
    ['target-extension', { targetId: 'target-extension', type: 'service_worker', url: WORKER_URL }],
  ]);
  detachEffect: ((command: SentCommand) => void) | null | undefined;
  readyState = FakeWebSocket.OPEN;
  closeCalls = 0;
  #initialContextSent = false;

  constructor(_url: string) {
    this.#plans = [...FakeWebSocket.initialPlans];
    this.#autoInitialContext = FakeWebSocket.nextAutoInitialContext;
    this.#initialWaitingForDebugger = FakeWebSocket.nextInitialWaitingForDebugger;
    FakeWebSocket.initialPlans = [];
    FakeWebSocket.nextAutoInitialContext = true;
    FakeWebSocket.nextInitialWaitingForDebugger = true;
    FakeWebSocket.latest = this;
    const connectionOutcome = FakeWebSocket.nextConnectionOutcome;
    FakeWebSocket.nextConnectionOutcome = 'open';
    if (connectionOutcome !== 'timeout') {
      queueMicrotask(() => this.#emit(connectionOutcome, {}));
    }
  }

  addEventListener(type: string, listener: SocketListener): void {
    const listeners = this.#listeners.get(type) ?? new Set<SocketListener>();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  send(raw: string): void {
    const command = JSON.parse(raw) as SentCommand;
    this.sent.push(command);
    const planIndex = this.#plans.findIndex((candidate) => candidate.method === command.method);
    const plan =
      planIndex >= 0
        ? this.#plans.splice(planIndex, 1)[0]!
        : ({ method: command.method } satisfies PlannedResponse);
    const respond = (override?: Omit<PlannedResponse, 'method' | 'hold'>): void => {
      const outcome = { ...plan, ...override };
      if (outcome.error !== undefined) {
        this.emitProtocol({ id: command.id, error: { message: outcome.error } });
        return;
      }
      const result = Object.prototype.hasOwnProperty.call(outcome, 'result')
        ? outcome.result
        : this.#defaultResult(command);
      this.emitProtocol({ id: command.id, result });
      this.#emitSuccessfulCommandEffects(command);
    };
    if (plan.hold) {
      this.#held.push({ command, plan, respond });
      return;
    }
    queueMicrotask(() => respond());
  }

  close(): void {
    this.closeCalls += 1;
    this.readyState = 3;
    this.#emit('close', {});
  }

  holdNext(method: string): void {
    this.#plans.push({ method, hold: true });
  }

  respondNext(method: string, result: unknown): void {
    this.#plans.push({ method, result });
  }

  failNext(method: string, error: string): void {
    this.#plans.push({ method, error });
  }

  heldCount(method: string): number {
    return this.#held.filter((candidate) => candidate.command.method === method).length;
  }

  heldCommands(method: string): SentCommand[] {
    return this.#held
      .filter((candidate) => candidate.command.method === method)
      .map((candidate) => candidate.command);
  }

  releaseHeld(method: string, override?: Omit<PlannedResponse, 'method' | 'hold'>): SentCommand {
    const index = this.#held.findIndex((candidate) => candidate.command.method === method);
    if (index < 0) {
      throw new Error(`No held ${method} response exists.`);
    }
    const [held] = this.#held.splice(index, 1);
    held!.respond(override);
    return held!.command;
  }

  releaseAllHeld(): void {
    while (this.#held.length > 0) {
      this.#held.shift()!.respond();
    }
  }

  emitAttached(targetId: string, sessionId: string, url: string, waitingForDebugger = true): void {
    this.#targetInfos.set(targetId, { targetId, type: 'service_worker', url });
    this.emitProtocol({
      method: 'Target.attachedToTarget',
      params: {
        sessionId,
        waitingForDebugger,
        targetInfo: { targetId, type: 'service_worker', url },
      },
    });
  }

  emitDetached(targetId: string, sessionId: string): void {
    this.emitProtocol({
      method: 'Target.detachedFromTarget',
      params: { targetId, sessionId },
    });
  }

  removeTarget(targetId: string): void {
    this.#targetInfos.delete(targetId);
  }

  emitTargetDestroyed(targetId: string): void {
    this.removeTarget(targetId);
    this.emitProtocol({ method: 'Target.targetDestroyed', params: { targetId } });
  }

  commandCount(method: string): number {
    return this.sent.filter((command) => command.method === method).length;
  }

  emitExecutionContext(
    sessionId: string,
    executionContextId: number,
    uniqueId: unknown | typeof MISSING_UNIQUE_ID = `unique-${executionContextId}`
  ): void {
    this.emitProtocol({
      method: 'Runtime.executionContextCreated',
      sessionId,
      params: {
        context: {
          id: executionContextId,
          origin: `chrome-extension://${EXTENSION_ID}`,
          ...(uniqueId === MISSING_UNIQUE_ID ? {} : { uniqueId }),
        },
      },
    });
  }

  emitProtocol(message: object): void {
    this.#emit('message', { data: JSON.stringify(message) });
  }

  #defaultResult(command: SentCommand): unknown {
    if (command.method === 'Runtime.evaluate') {
      const params = isRecord(command.params) ? command.params : {};
      if (params.expression === IDENTITY_HANDSHAKE_EXPRESSION) {
        return {
          result: {
            type: 'object',
            value: { workerUrl: WORKER_URL, registrationScope: WORKER_SCOPE },
          },
        };
      }
      return { result: { type: 'number', value: 42 } };
    }
    if (command.method === 'Target.getTargets') {
      return {
        targetInfos: [...this.#targetInfos.values()],
      };
    }
    return {};
  }

  #emitSuccessfulCommandEffects(command: SentCommand): void {
    if (command.method === 'Target.autoAttachRelated') {
      this.emitAttached(
        'target-extension',
        'session-extension',
        WORKER_URL,
        this.#initialWaitingForDebugger
      );
    }
    if (command.method === 'Target.detachFromTarget') {
      if (this.detachEffect === null) {
        return;
      }
      if (this.detachEffect) {
        this.detachEffect(command);
        return;
      }
      const params = isRecord(command.params) ? command.params : {};
      if (params.sessionId === 'session-extension') {
        this.emitDetached('target-extension', 'session-extension');
        this.removeTarget('target-extension');
      }
    }
    if (
      this.#autoInitialContext &&
      command.method === 'Runtime.enable' &&
      command.sessionId === 'session-extension' &&
      !this.#initialContextSent
    ) {
      this.#initialContextSent = true;
      this.emitExecutionContext('session-extension', 7, 'unique-initial');
    }
  }

  #emit(type: string, event: { data?: string }): void {
    for (const listener of this.#listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

class FakeServiceWorkerCdp {
  readonly #listeners = new Map<string, Set<(payload: never) => void>>();
  stopEffect: (() => void) | null = null;
  startEffect: (() => void) | null = null;
  holdStop = false;
  stopCalls = 0;
  startCalls = 0;
  stopError: Error | undefined;
  initialVersionOverrides: VersionOverrides = {};
  #releaseStop: (() => void) | undefined;

  on(event: string, listener: (payload: never) => void): void {
    const listeners = this.#listeners.get(event) ?? new Set<(payload: never) => void>();
    listeners.add(listener);
    this.#listeners.set(event, listeners);
  }

  async send(method: string): Promise<object> {
    if (method === 'ServiceWorker.enable') {
      queueMicrotask(() => {
        this.#emit('ServiceWorker.workerRegistrationUpdated', {
          registrations: [
            { registrationId: REGISTRATION_ID, isDeleted: false, scopeURL: WORKER_SCOPE },
          ],
        });
        this.emitVersion(this.initialVersionOverrides);
      });
    }
    if (method === 'ServiceWorker.stopWorker') {
      this.stopCalls += 1;
      this.stopEffect?.();
      if (this.holdStop) {
        await new Promise<void>((resolve) => {
          this.#releaseStop = resolve;
        });
      }
      if (this.stopError) {
        throw this.stopError;
      }
    }
    if (method === 'ServiceWorker.startWorker') {
      this.startCalls += 1;
      this.startEffect?.();
    }
    return {};
  }

  releaseStop(): void {
    const release = this.#releaseStop;
    if (!release) {
      throw new Error('No held ServiceWorker.stopWorker response exists.');
    }
    this.#releaseStop = undefined;
    release();
  }

  emitRegistration(
    overrides: Partial<{
      registrationId: string;
      isDeleted: boolean;
      scopeURL: string;
    }> = {}
  ): void {
    this.#emit('ServiceWorker.workerRegistrationUpdated', {
      registrations: [
        {
          registrationId: REGISTRATION_ID,
          isDeleted: false,
          scopeURL: WORKER_SCOPE,
          ...overrides,
        },
      ],
    });
  }

  emitVersion(overrides: VersionOverrides = {}): void {
    this.#emit('ServiceWorker.workerVersionUpdated', {
      versions: [
        {
          versionId: VERSION_ID,
          registrationId: REGISTRATION_ID,
          scriptURL: WORKER_URL,
          runningStatus: 'running',
          status: 'activated',
          targetId: 'target-extension',
          ...overrides,
        },
      ],
    });
  }

  async detach(): Promise<void> {}

  #emit(event: string, payload: object): void {
    for (const listener of this.#listeners.get(event) ?? []) {
      listener(payload as never);
    }
  }
}

type VersionOverrides = Partial<{
  versionId: string;
  registrationId: string;
  scriptURL: string;
  runningStatus: 'stopped' | 'starting' | 'running' | 'stopping';
  status: 'new' | 'installing' | 'installed' | 'activating' | 'activated' | 'redundant';
  targetId: string | undefined;
}>;

interface ObserverRig {
  readonly observer: ServiceWorkerBootstrapObserver;
  readonly serviceWorkerCdp: FakeServiceWorkerCdp;
  readonly currentWorker: Worker;
  readonly worker: Worker;
  readonly setServiceWorkers: (workers: Worker[]) => void;
}

interface StartedRig extends ObserverRig {
  readonly socket: FakeWebSocket;
}

interface RestartAttempt {
  readonly promise: Promise<Worker>;
  readonly status: () => 'pending' | 'resolved' | 'rejected';
}

const activeObservers = new Set<ServiceWorkerBootstrapObserver>();
const activeSockets = new Set<FakeWebSocket>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function runtimeEvaluateCommands(socket: FakeWebSocket): SentCommand[] {
  return socket.sent.filter((command) => command.method === 'Runtime.evaluate');
}

function runtimeResumeCommands(socket: FakeWebSocket): SentCommand[] {
  return socket.sent.filter((command) => command.method === 'Runtime.runIfWaitingForDebugger');
}

function exactHandshakeResult(value: unknown): unknown {
  return { result: { type: 'object', value } };
}

function createObserver(): ObserverRig {
  vi.stubGlobal('WebSocket', FakeWebSocket);
  const serviceWorkerCdp = new FakeServiceWorkerCdp();
  const exactWorkerIdentity = () => ({
    workerUrl: WORKER_URL,
    registrationScope: WORKER_SCOPE,
  });
  const currentWorker = { url: () => WORKER_URL, evaluate: exactWorkerIdentity } as Worker;
  const worker = { url: () => WORKER_URL, evaluate: exactWorkerIdentity } as Worker;
  let serviceWorkers = [worker];
  const context = {
    newCDPSession: async () => serviceWorkerCdp as unknown as CDPSession,
    serviceWorkers: () => serviceWorkers,
  } as unknown as BrowserContext;
  const observer = new ServiceWorkerBootstrapObserver({
    context,
    controlPage: {} as Page,
    diagnostics: createRuntimeDiagnostics(),
    extensionId: EXTENSION_ID,
    instrumentWorker: vi.fn(),
    webSocketUrl: 'ws://missionpulse.test/devtools/browser/test',
  });
  activeObservers.add(observer);
  return {
    observer,
    serviceWorkerCdp,
    currentWorker,
    worker,
    setServiceWorkers: (workers) => {
      serviceWorkers = workers;
    },
  };
}

async function startRig(options: { initialVersion?: VersionOverrides } = {}): Promise<StartedRig> {
  const rig = createObserver();
  rig.serviceWorkerCdp.initialVersionOverrides = options.initialVersion ?? {};
  await rig.observer.start();
  const socket = FakeWebSocket.latest;
  if (!socket) {
    throw new Error('The fake browser CDP socket was not created.');
  }
  activeSockets.add(socket);
  rig.serviceWorkerCdp.stopEffect = () => {
    rig.serviceWorkerCdp.emitVersion({ runningStatus: 'stopped', targetId: undefined });
  };
  rig.serviceWorkerCdp.startEffect = () => {
    socket.emitAttached('target-extension', 'session-extension', WORKER_URL);
    rig.serviceWorkerCdp.emitVersion({
      runningStatus: 'starting',
      status: 'activated',
      targetId: 'target-extension',
    });
  };
  socket.sent.length = 0;
  return { ...rig, socket };
}

async function beginRestart(rig: StartedRig, probeExpression?: string): Promise<RestartAttempt> {
  const previousStopCalls = rig.serviceWorkerCdp.stopCalls;
  let currentStatus: 'pending' | 'resolved' | 'rejected' = 'pending';
  const promise = rig.observer.restart(rig.currentWorker, probeExpression);
  void promise.then(
    () => {
      currentStatus = 'resolved';
    },
    () => {
      currentStatus = 'rejected';
    }
  );
  await vi.waitFor(() => expect(rig.serviceWorkerCdp.stopCalls).toBe(previousStopCalls + 1));
  await flushTasks();
  return { promise, status: () => currentStatus };
}

async function flushTasks(milliseconds = 0): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

afterEach(async () => {
  vi.useRealTimers();
  for (const socket of activeSockets) {
    socket.releaseAllHeld();
  }
  await Promise.allSettled([...activeObservers].map((observer) => observer.stop()));
  activeObservers.clear();
  activeSockets.clear();
  FakeWebSocket.latest = null;
  FakeWebSocket.initialPlans = [];
  FakeWebSocket.nextAutoInitialContext = true;
  FakeWebSocket.nextInitialWaitingForDebugger = true;
  FakeWebSocket.nextConnectionOutcome = 'open';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ServiceWorkerBootstrapObserver uniqueId correlation', () => {
  it('uses the naturally detached activated worker as quiescence without stop or detach', async () => {
    const rig = await startRig({
      initialVersion: { status: 'new', runningStatus: 'starting' },
    });
    const restart = rig.observer.restart(rig.currentWorker);
    void restart.catch(() => undefined);
    await flushTasks();

    rig.socket.emitDetached('target-extension', 'session-extension');
    rig.socket.removeTarget('target-extension');
    rig.serviceWorkerCdp.emitVersion({
      status: 'activated',
      runningStatus: 'stopped',
      targetId: undefined,
    });

    await vi.waitFor(() => expect(rig.serviceWorkerCdp.startCalls).toBe(1));
    rig.socket.emitExecutionContext('session-extension', 8, 'unique-natural-quiescence');

    await expect(restart).resolves.toBe(rig.worker);
    expect(rig.serviceWorkerCdp.stopCalls).toBe(0);
    expect(rig.socket.commandCount('Target.detachFromTarget')).toBe(0);
    expect(rig.socket.commandCount('Target.setAutoAttach')).toBe(1);
  });

  it('acknowledges the exact browser-root auto-attach command before startWorker', async () => {
    const rig = await startRig();
    rig.socket.holdNext('Target.setAutoAttach');
    const restart = rig.observer.restart(rig.currentWorker);
    void restart.catch(() => undefined);

    await vi.waitFor(() => expect(rig.socket.heldCount('Target.setAutoAttach')).toBe(1));
    expect(rig.serviceWorkerCdp.startCalls).toBe(0);
    const [armCommand] = rig.socket.heldCommands('Target.setAutoAttach');
    expect(armCommand).toEqual({
      id: expect.any(Number),
      method: 'Target.setAutoAttach',
      params: {
        autoAttach: true,
        waitForDebuggerOnStart: true,
        flatten: true,
        filter: SERVICE_WORKER_TARGET_FILTER,
      },
    });
    expect(armCommand?.sessionId).toBeUndefined();

    rig.socket.releaseHeld('Target.setAutoAttach');
    await vi.waitFor(() => expect(rig.serviceWorkerCdp.startCalls).toBe(1));
    rig.socket.emitExecutionContext('session-extension', 8, 'unique-after-root-arm');

    await expect(restart).resolves.toBe(rig.worker);
  });

  it('rejects a browser-root auto-attach failure with zero startWorker calls', async () => {
    const rig = await startRig();
    rig.socket.failNext('Target.setAutoAttach', 'root auto-attach rejected');
    const restart = rig.observer.restart(rig.currentWorker);
    void restart.catch(() => undefined);

    void vi
      .waitFor(() => expect(rig.serviceWorkerCdp.startCalls).toBe(1))
      .then(() =>
        rig.socket.emitExecutionContext('session-extension', 8, 'unique-without-root-arm')
      )
      .catch(() => undefined);

    await expect(restart).rejects.toThrow('root auto-attach rejected');
    expect(rig.serviceWorkerCdp.startCalls).toBe(0);
  });

  it('treats a second admissible execution context in one restart generation as terminal', async () => {
    const rig = await startRig();
    rig.socket.holdNext('Runtime.evaluate');
    const restart = await beginRestart(rig);
    await vi.waitFor(() => expect(rig.serviceWorkerCdp.startCalls).toBe(1));

    rig.socket.emitExecutionContext('session-extension', 8, 'unique-claim-a');
    await vi.waitFor(() => expect(rig.socket.heldCount('Runtime.evaluate')).toBe(1));
    rig.socket.emitExecutionContext('session-extension', 9, 'unique-claim-b');
    rig.socket.releaseHeld('Runtime.evaluate', {
      result: exactHandshakeResult({
        workerUrl: WORKER_URL,
        registrationScope: WORKER_SCOPE,
      }),
    });

    await expect(restart.promise).rejects.toThrow(/second|context|claim/i);
    await expect(rig.observer.evaluateInCorrelatedContext('42')).rejects.toThrow(
      'No current post-restart extension worker context is correlated.'
    );
  });

  it('disarms browser-root auto-attach during cleanup even before a restart arm', async () => {
    const rig = await startRig();

    await rig.observer.stop();

    const disarmCommand = rig.socket.sent.at(-1);
    expect(disarmCommand).toEqual({
      id: expect.any(Number),
      method: 'Target.setAutoAttach',
      params: {
        autoAttach: false,
        waitForDebuggerOnStart: false,
        flatten: true,
      },
    });
    expect(disarmCommand?.sessionId).toBeUndefined();
  });

  it('waits for the exact activated and running version before issuing stopWorker', async () => {
    const rig = await startRig({
      initialVersion: { status: 'new', runningStatus: 'starting' },
    });
    const restart = rig.observer.restart(rig.currentWorker);
    void restart.catch(() => undefined);
    await flushTasks();

    expect(rig.serviceWorkerCdp.stopCalls).toBe(0);
    expect(rig.serviceWorkerCdp.startCalls).toBe(0);

    for (const status of ['installing', 'installed', 'activating'] as const) {
      rig.serviceWorkerCdp.emitVersion({ status, runningStatus: 'running' });
      await flushTasks();
      expect(rig.serviceWorkerCdp.stopCalls).toBe(0);
    }

    rig.serviceWorkerCdp.emitVersion({ status: 'activated', runningStatus: 'starting' });
    await flushTasks();
    expect(rig.serviceWorkerCdp.stopCalls).toBe(0);

    rig.serviceWorkerCdp.emitVersion({ status: 'activated', runningStatus: 'running' });
    await vi.waitFor(() => expect(rig.serviceWorkerCdp.stopCalls).toBe(1));
    await vi.waitFor(() => expect(rig.serviceWorkerCdp.startCalls).toBe(1));
    rig.socket.emitExecutionContext('session-extension', 8, 'unique-after-initial-activation');

    await expect(restart).resolves.toBe(rig.worker);
  });

  it('charges initial lifecycle readiness to the single restart deadline', async () => {
    const rig = await startRig({
      initialVersion: { status: 'new', runningStatus: 'starting' },
    });
    vi.useFakeTimers();
    const restart = rig.observer.restart(rig.currentWorker);
    void restart.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(20_000);

    await expect(restart).rejects.toThrow('readiness');
    expect(rig.serviceWorkerCdp.stopCalls).toBe(0);
    expect(rig.socket.commandCount('Target.detachFromTarget')).toBe(0);
    expect(rig.serviceWorkerCdp.startCalls).toBe(0);
  });

  it('rejects registration deletion after stop with zero start calls', async () => {
    const rig = await startRig();
    rig.socket.holdNext('Target.getTargets');
    vi.useFakeTimers();
    const restart = rig.observer.restart(rig.currentWorker);
    void restart.catch(() => undefined);
    for (let index = 0; index < 16; index += 1) {
      await Promise.resolve();
    }
    expect(rig.socket.heldCount('Target.getTargets')).toBe(1);

    rig.serviceWorkerCdp.emitRegistration({ isDeleted: true });
    rig.socket.releaseHeld('Target.getTargets');
    await vi.advanceTimersByTimeAsync(20_000);

    await expect(restart).rejects.toThrow(/registration/i);
    expect(rig.serviceWorkerCdp.startCalls).toBe(0);
  });

  it('waits for the same replacement version before the identity handshake', async () => {
    const rig = await startRig();
    rig.serviceWorkerCdp.startEffect = () => {
      rig.socket.emitAttached('target-extension', 'session-extension', WORKER_URL);
    };
    const restart = await beginRestart(rig);
    await vi.waitFor(() => expect(rig.serviceWorkerCdp.startCalls).toBe(1));

    rig.socket.emitExecutionContext('session-extension', 8, 'unique-before-version-link');
    await flushTasks();
    expect(runtimeEvaluateCommands(rig.socket)).toEqual([]);
    expect(runtimeResumeCommands(rig.socket)).toEqual([]);

    rig.serviceWorkerCdp.emitVersion({
      status: 'activated',
      runningStatus: 'starting',
      targetId: 'target-extension',
    });

    await expect(restart.promise).resolves.toBe(rig.worker);
  });

  it('rejects a foreign replacement version before resuming bootstrap', async () => {
    const rig = await startRig();
    rig.serviceWorkerCdp.startEffect = () => {
      rig.socket.emitAttached('target-extension', 'session-extension', WORKER_URL);
      rig.serviceWorkerCdp.emitVersion({
        registrationId: 'foreign-registration',
        status: 'activated',
        runningStatus: 'starting',
        targetId: 'target-extension',
      });
    };
    const restart = await beginRestart(rig);
    rig.socket.emitExecutionContext('session-extension', 8, 'unique-foreign-version');

    await expect(restart.promise).rejects.toThrow(/registration|version/i);
    expect(runtimeResumeCommands(rig.socket)).toEqual([]);
  });

  it('requires the exact stopped version after the stop response before detaching', async () => {
    const rig = await startRig();
    rig.serviceWorkerCdp.stopEffect = null;
    const restart = await beginRestart(rig);

    expect(rig.socket.commandCount('Target.detachFromTarget')).toBe(0);
    expect(rig.serviceWorkerCdp.startCalls).toBe(0);

    rig.serviceWorkerCdp.emitVersion({
      versionId: 'foreign-version',
      registrationId: 'foreign-registration',
      scriptURL: `chrome-extension://${FOREIGN_EXTENSION_ID}/service-worker-loader.js`,
      runningStatus: 'stopped',
      targetId: undefined,
    });
    rig.serviceWorkerCdp.emitVersion({ runningStatus: 'stopping', targetId: undefined });
    await flushTasks();
    expect(rig.socket.commandCount('Target.detachFromTarget')).toBe(0);

    rig.serviceWorkerCdp.emitVersion({ runningStatus: 'stopped', targetId: undefined });
    await vi.waitFor(() => expect(rig.socket.commandCount('Target.detachFromTarget')).toBe(1));
    await vi.waitFor(() => expect(rig.serviceWorkerCdp.startCalls).toBe(1));
    rig.socket.emitExecutionContext('session-extension', 8, 'unique-stopped-after-response');

    await expect(restart.promise).resolves.toBe(rig.worker);
  });

  it('retains exact stopped proof before the stop response and detaches only after that response', async () => {
    const rig = await startRig();
    rig.serviceWorkerCdp.holdStop = true;
    const restart = rig.observer.restart(rig.currentWorker);
    void restart.catch(() => undefined);
    await vi.waitFor(() => expect(rig.serviceWorkerCdp.stopCalls).toBe(1));

    expect(rig.socket.commandCount('Target.detachFromTarget')).toBe(0);
    expect(rig.serviceWorkerCdp.startCalls).toBe(0);

    rig.serviceWorkerCdp.releaseStop();
    await vi.waitFor(() => expect(rig.socket.commandCount('Target.detachFromTarget')).toBe(1));
    await vi.waitFor(() => expect(rig.serviceWorkerCdp.startCalls).toBe(1));
    rig.socket.emitExecutionContext('session-extension', 8, 'unique-stopped-before-response');

    await expect(restart).resolves.toBe(rig.worker);
  });

  it('times out a foreign stopped version with zero detach and zero start calls', async () => {
    const rig = await startRig();
    rig.serviceWorkerCdp.stopEffect = null;
    vi.useFakeTimers();
    const restart = rig.observer.restart(rig.currentWorker);
    void restart.catch(() => undefined);
    for (let index = 0; index < 8; index += 1) {
      await Promise.resolve();
    }

    rig.serviceWorkerCdp.emitVersion({
      versionId: 'foreign-version',
      registrationId: 'foreign-registration',
      scriptURL: `chrome-extension://${FOREIGN_EXTENSION_ID}/service-worker-loader.js`,
      runningStatus: 'stopped',
      targetId: undefined,
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(rig.socket.commandCount('Target.detachFromTarget')).toBe(0);
    expect(rig.serviceWorkerCdp.startCalls).toBe(0);

    await vi.advanceTimersByTimeAsync(20_000);

    await expect(restart).rejects.toThrow('exact stopped service-worker version');
    expect(rig.socket.commandCount('Target.detachFromTarget')).toBe(0);
    expect(rig.serviceWorkerCdp.startCalls).toBe(0);
  });

  it('treats stop command rejection as terminal even after exact stopped proof', async () => {
    const rig = await startRig();
    rig.serviceWorkerCdp.stopError = new Error('stop command rejected');

    await expect(rig.observer.restart(rig.currentWorker)).rejects.toThrow('stop command rejected');
    expect(rig.socket.commandCount('Target.detachFromTarget')).toBe(0);
    expect(rig.serviceWorkerCdp.startCalls).toBe(0);
  });

  it('keeps a bounded recent ServiceWorker event log in timeout diagnostics', async () => {
    const rig = await startRig();
    rig.serviceWorkerCdp.stopEffect = null;
    vi.useFakeTimers();
    const restart = rig.observer.restart(rig.currentWorker);
    void restart.catch(() => undefined);
    for (let index = 0; index < 8; index += 1) {
      await Promise.resolve();
    }

    for (let index = 0; index < 25; index += 1) {
      rig.serviceWorkerCdp.emitVersion({
        versionId: `status-marker-${index}`,
        registrationId: `foreign-registration-${index}`,
        scriptURL: `chrome-extension://${FOREIGN_EXTENSION_ID}/service-worker-loader.js`,
        runningStatus: 'stopping',
        targetId: undefined,
      });
    }
    await vi.advanceTimersByTimeAsync(20_000);

    const error = await restart.then(
      () => null,
      (reason: unknown) => reason
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('ServiceWorker.workerVersionUpdated');
    expect((error as Error).message).toContain('status-marker-24');
    expect((error as Error).message).not.toContain('status-marker-0"');
  });

  it('consumes an exact detach observed before the stop response without issuing a detach command', async () => {
    const rig = await startRig();
    rig.serviceWorkerCdp.holdStop = true;
    rig.serviceWorkerCdp.stopEffect = () => {
      rig.serviceWorkerCdp.emitVersion({ runningStatus: 'stopped', targetId: undefined });
      rig.socket.emitDetached('target-extension', 'session-extension');
      rig.socket.removeTarget('target-extension');
    };
    const restart = rig.observer.restart(rig.currentWorker);
    void restart.catch(() => undefined);
    await vi.waitFor(() => expect(rig.serviceWorkerCdp.stopCalls).toBe(1));

    expect(rig.serviceWorkerCdp.startCalls).toBe(0);
    expect(rig.socket.commandCount('Target.detachFromTarget')).toBe(0);
    rig.serviceWorkerCdp.releaseStop();
    await vi.waitFor(() => expect(rig.serviceWorkerCdp.startCalls).toBe(1));

    rig.socket.emitExecutionContext('session-extension', 8, 'unique-detached-before-stop-reply');

    await expect(restart).resolves.toBe(rig.worker);
    expect(rig.serviceWorkerCdp.startCalls).toBe(1);
    expect(rig.socket.commandCount('Target.detachFromTarget')).toBe(0);
  });

  it('waits for an exact detach event after a successful detach response', async () => {
    const rig = await startRig();
    rig.socket.detachEffect = null;
    const restart = await beginRestart(rig);

    await vi.waitFor(() => expect(rig.socket.commandCount('Target.detachFromTarget')).toBe(1));
    expect(rig.serviceWorkerCdp.startCalls).toBe(0);

    rig.socket.emitDetached('target-extension', 'session-extension');
    rig.socket.removeTarget('target-extension');
    await vi.waitFor(() => expect(rig.serviceWorkerCdp.startCalls).toBe(1));
    rig.socket.emitExecutionContext('session-extension', 8, 'unique-detach-after-response');

    await expect(restart.promise).resolves.toBe(rig.worker);
    expect(rig.socket.commandCount('Target.detachFromTarget')).toBe(1);
  });

  it('retains an exact detach event before the detach command response', async () => {
    const rig = await startRig();
    rig.socket.detachEffect = null;
    rig.socket.holdNext('Target.detachFromTarget');
    const restart = await beginRestart(rig);
    await vi.waitFor(() => expect(rig.socket.heldCount('Target.detachFromTarget')).toBe(1));

    rig.socket.emitDetached('target-extension', 'session-extension');
    rig.socket.removeTarget('target-extension');
    await flushTasks();
    expect(rig.serviceWorkerCdp.startCalls).toBe(0);

    rig.socket.releaseHeld('Target.detachFromTarget');
    await vi.waitFor(() => expect(rig.serviceWorkerCdp.startCalls).toBe(1));
    rig.socket.emitExecutionContext('session-extension', 8, 'unique-detach-before-response');

    await expect(restart.promise).resolves.toBe(rig.worker);
    expect(rig.socket.commandCount('Target.detachFromTarget')).toBe(1);
  });

  it('treats detach command rejection as terminal even without a start', async () => {
    const rig = await startRig();
    rig.socket.failNext('Target.detachFromTarget', 'No session with given id');
    const restart = await beginRestart(rig);

    await expect(restart.promise).rejects.toThrow('No session with given id');
    expect(rig.socket.commandCount('Target.detachFromTarget')).toBe(1);
    expect(rig.serviceWorkerCdp.startCalls).toBe(0);
  });

  it('does not treat targetDestroyed as exact session revocation', async () => {
    const rig = await startRig();
    rig.socket.detachEffect = null;
    vi.useFakeTimers();
    const restart = rig.observer.restart(rig.currentWorker);
    void restart.catch(() => undefined);
    for (let index = 0; index < 12; index += 1) {
      await Promise.resolve();
    }
    expect(rig.socket.commandCount('Target.detachFromTarget')).toBe(1);

    rig.socket.emitTargetDestroyed('target-extension');
    await vi.advanceTimersByTimeAsync(20_000);

    await expect(restart).rejects.toThrow('exact pre-stop attachment detachment');
    expect(rig.serviceWorkerCdp.startCalls).toBe(0);
  });

  it('keeps polling while the old target remains present and never starts', async () => {
    const rig = await startRig();
    rig.socket.detachEffect = () => {
      rig.socket.emitDetached('target-extension', 'session-extension');
    };
    vi.useFakeTimers();
    const restart = rig.observer.restart(rig.currentWorker);
    void restart.catch(() => undefined);
    for (let index = 0; index < 12; index += 1) {
      await Promise.resolve();
    }

    await vi.advanceTimersByTimeAsync(20_000);

    await expect(restart).rejects.toThrow('old service-worker target absence');
    expect(rig.serviceWorkerCdp.startCalls).toBe(0);
  });

  it('rejects an old-target reattachment before start authorization', async () => {
    const rig = await startRig();
    rig.socket.holdNext('Target.getTargets');
    const restart = await beginRestart(rig);
    await vi.waitFor(() => expect(rig.socket.heldCount('Target.getTargets')).toBe(1));

    rig.socket.emitAttached('target-extension', 'session-rebound', WORKER_URL);

    await expect(restart.promise).rejects.toThrow('reattached before restart was authorized');
    expect(rig.serviceWorkerCdp.startCalls).toBe(0);
  });

  it('rejects an unpaused replacement target before identity handshake', async () => {
    const rig = await startRig();
    rig.serviceWorkerCdp.startEffect = () => {
      rig.socket.emitAttached('target-extension', 'session-replacement', WORKER_URL, false);
    };
    const restart = await beginRestart(rig);

    await expect(restart.promise).rejects.toThrow('was not paused for debugger bootstrap');
    expect(rig.serviceWorkerCdp.startCalls).toBe(1);
    expect(runtimeEvaluateCommands(rig.socket)).toEqual([]);
  });

  it('starts the restart deadline before stopWorker and gives bootstrap only the remaining time', async () => {
    const rig = await startRig();
    vi.useFakeTimers();
    rig.serviceWorkerCdp.holdStop = true;
    rig.serviceWorkerCdp.stopEffect = () => {
      rig.serviceWorkerCdp.emitVersion({ runningStatus: 'stopped', targetId: undefined });
      rig.socket.emitDetached('target-extension', 'session-extension');
      rig.socket.removeTarget('target-extension');
    };
    let status: 'pending' | 'rejected' = 'pending';
    const restart = rig.observer.restart(rig.currentWorker);
    void restart.catch(() => {
      status = 'rejected';
    });
    for (let index = 0; index < 8; index += 1) {
      await Promise.resolve();
    }
    expect(rig.serviceWorkerCdp.stopCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(5_000);
    rig.serviceWorkerCdp.releaseStop();
    await vi.advanceTimersByTimeAsync(0);
    expect(rig.serviceWorkerCdp.startCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(14_999);
    expect(status).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);

    expect(status).toBe('rejected');
    await expect(restart).rejects.toThrow('Timed out waiting');
  });

  it('charges a held Playwright worker identity check to the original restart deadline', async () => {
    const rig = await startRig();
    const heldWorker = {
      url: () => WORKER_URL,
      evaluate: () => new Promise<never>(() => undefined),
    } as unknown as Worker;
    rig.setServiceWorkers([heldWorker]);
    vi.useFakeTimers();
    let status: 'pending' | 'rejected' = 'pending';
    const restart = rig.observer.restart(rig.currentWorker);
    void restart.catch(() => {
      status = 'rejected';
    });
    for (let index = 0; index < 32; index += 1) {
      await Promise.resolve();
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(rig.serviceWorkerCdp.startCalls).toBe(1);

    rig.socket.emitExecutionContext('session-extension', 8, 'unique-held-playwright-worker');
    await vi.advanceTimersByTimeAsync(0);
    for (let index = 0; index < 32; index += 1) {
      await Promise.resolve();
    }

    await vi.advanceTimersByTimeAsync(20_000);

    expect(status).toBe('rejected');
    await expect(restart).rejects.toThrow('Playwright replacement worker identity');
  });

  it.each(['timeout', 'error'] as const)(
    'closes the provisional CDP socket when connection ends with %s',
    async (outcome) => {
      FakeWebSocket.nextConnectionOutcome = outcome;
      if (outcome === 'timeout') {
        vi.useFakeTimers();
      }
      const rig = createObserver();
      const start = rig.observer.start();
      void start.catch(() => undefined);
      const socket = FakeWebSocket.latest!;
      activeSockets.add(socket);

      if (outcome === 'timeout') {
        await vi.advanceTimersByTimeAsync(10_000);
      }

      await expect(start).rejects.toThrow(
        outcome === 'timeout' ? 'Timed out connecting' : 'connection failed'
      );
      expect(socket.closeCalls).toBe(1);
      expect(socket.readyState).not.toBe(FakeWebSocket.OPEN);
    }
  );

  it('rejects missing, malformed, oversized and controlled uniqueIds without numeric fallback', async () => {
    const rig = await startRig();
    const restart = await beginRestart(rig);
    const invalidUniqueIds: Array<unknown | typeof MISSING_UNIQUE_ID> = [
      MISSING_UNIQUE_ID,
      '',
      42,
      'é'.repeat(2049),
      'unique\0nul',
      'unique\rcr',
      'unique\nlf',
    ];

    invalidUniqueIds.forEach((uniqueId, index) => {
      rig.socket.emitExecutionContext('session-extension', 100 + index, uniqueId);
    });
    await flushTasks();

    expect(restart.status()).toBe('pending');
    expect(runtimeEvaluateCommands(rig.socket)).toEqual([]);

    const exactMaximumUniqueId = 'x'.repeat(4096);
    rig.socket.emitExecutionContext('session-extension', 200, exactMaximumUniqueId);
    await expect(restart.promise).resolves.toBe(rig.worker);
    const handshake = runtimeEvaluateCommands(rig.socket)[0]!;
    expect(handshake.params).toMatchObject({ uniqueContextId: exactMaximumUniqueId });
    expect(handshake.params).not.toHaveProperty('contextId');
  });

  it('never retains a rejected uniqueId in timeout diagnostics', async () => {
    const rig = await startRig();
    vi.useFakeTimers();
    const marker = '__SECRET_INVALID_UNIQUE_ID__\n';
    const restart = rig.observer.restart(rig.currentWorker);
    void restart.catch(() => undefined);
    for (let index = 0; index < 8; index += 1) {
      await Promise.resolve();
    }
    expect(rig.serviceWorkerCdp.stopCalls).toBe(1);
    rig.socket.emitExecutionContext('session-extension', 201, marker);
    await vi.advanceTimersByTimeAsync(20_000);

    const error = await restart.then(
      () => null,
      (reason: unknown) => reason
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('Timed out waiting');
    expect((error as Error).message).not.toContain('__SECRET_INVALID_UNIQUE_ID__');
  });

  it('uses the fixed exact identity handshake before any caller probe', async () => {
    const rig = await startRig();
    const restart = await beginRestart(rig, 'callerControlledProbe()');

    rig.socket.emitExecutionContext('session-extension', 8, 'unique-handshake');
    await expect(restart.promise).resolves.toBe(rig.worker);

    const evaluations = runtimeEvaluateCommands(rig.socket);
    expect(evaluations).toHaveLength(2);
    expect(evaluations[0]).toMatchObject({
      method: 'Runtime.evaluate',
      sessionId: 'session-extension',
      params: {
        expression: IDENTITY_HANDSHAKE_EXPRESSION,
        uniqueContextId: 'unique-handshake',
        awaitPromise: true,
        returnByValue: true,
      },
    });
    expect(evaluations[0]!.params).not.toHaveProperty('contextId');
    expect(evaluations[1]).toMatchObject({
      params: {
        expression: 'callerControlledProbe()',
        uniqueContextId: 'unique-handshake',
      },
    });
    expect(evaluations[1]!.params).not.toHaveProperty('contextId');
  });

  it('accepts a reused Playwright Worker object only after post-restart identity revalidation', async () => {
    const rig = await startRig();
    rig.setServiceWorkers([rig.currentWorker]);
    const restart = await beginRestart(rig);

    rig.socket.emitExecutionContext('session-extension', 8, 'unique-reused-playwright-worker');

    await expect(restart.promise).resolves.toBe(rig.currentWorker);
  });

  it('arms diagnostics without waiting for a context on an already-running initial target', async () => {
    FakeWebSocket.nextInitialWaitingForDebugger = false;
    FakeWebSocket.nextAutoInitialContext = false;
    const rig = createObserver();

    await expect(rig.observer.start()).resolves.toBeUndefined();

    const socket = FakeWebSocket.latest!;
    activeSockets.add(socket);
    expect(runtimeEvaluateCommands(socket)).toEqual([]);
    expect(runtimeResumeCommands(socket)).toEqual([]);
  });

  it('does not resume the initial attachment before its fixed identity handshake succeeds', async () => {
    FakeWebSocket.initialPlans = [{ method: 'Runtime.evaluate', hold: true }];
    const rig = createObserver();
    const start = rig.observer.start();
    void start.catch(() => undefined);

    await vi.waitFor(() => expect(FakeWebSocket.latest).not.toBeNull());
    const socket = FakeWebSocket.latest!;
    activeSockets.add(socket);
    await flushTasks(20);

    expect(socket.heldCount('Runtime.evaluate')).toBe(1);
    expect(runtimeResumeCommands(socket)).toEqual([]);

    socket.releaseHeld('Runtime.evaluate', {
      result: exactHandshakeResult({ workerUrl: WORKER_URL, registrationScope: WORKER_SCOPE }),
    });
    await expect(start).resolves.toBeUndefined();
    expect(runtimeResumeCommands(socket)).toHaveLength(1);
  });

  it('does not resume a replacement attachment before a context identity is accepted', async () => {
    const rig = await startRig();
    const restart = await beginRestart(rig);

    rig.socket.emitDetached('target-extension', 'session-extension');
    rig.socket.emitAttached('target-extension', 'session-extension', WORKER_URL);
    await flushTasks();

    expect(runtimeResumeCommands(rig.socket)).toEqual([]);

    rig.socket.emitExecutionContext('session-extension', 8, 'unique-identified-replacement');
    await expect(restart.promise).resolves.toBe(rig.worker);
    expect(runtimeResumeCommands(rig.socket)).toHaveLength(1);
  });

  it('keeps a rejected identity claim single-assignment for the restart generation', async () => {
    const rig = await startRig();
    rig.socket.respondNext(
      'Runtime.evaluate',
      exactHandshakeResult({
        workerUrl: WORKER_URL,
        registrationScope: `chrome-extension://${FOREIGN_EXTENSION_ID}/`,
      })
    );
    const restart = await beginRestart(rig);

    rig.socket.emitExecutionContext('session-extension', 8, 'unique-rejected-identity');
    await flushTasks();

    expect(restart.status()).toBe('pending');
    expect(runtimeResumeCommands(rig.socket)).toEqual([]);

    rig.socket.emitExecutionContext('session-extension', 9, 'unique-accepted-identity');
    await expect(restart.promise).rejects.toThrow(/second|context|claim/i);
    expect(runtimeResumeCommands(rig.socket)).toEqual([]);
  });

  it('rejects exceptionDetails even when Runtime.evaluate also returns an exact identity value', async () => {
    const rig = await startRig();
    rig.socket.respondNext('Runtime.evaluate', {
      ...exactHandshakeResult({ workerUrl: WORKER_URL, registrationScope: WORKER_SCOPE }),
      exceptionDetails: { text: 'synthetic identity exception' },
    });
    const restart = await beginRestart(rig);

    rig.socket.emitExecutionContext('session-extension', 8, 'unique-exception-identity');
    await flushTasks();

    expect(restart.status()).toBe('pending');
    expect(runtimeResumeCommands(rig.socket)).toEqual([]);

    rig.socket.emitExecutionContext('session-extension', 9, 'unique-clean-identity');
    await expect(restart.promise).rejects.toThrow(/second|context|claim/i);
  });

  it.each([
    ['missing field', { workerUrl: WORKER_URL }],
    [
      'wrong registration scope',
      {
        workerUrl: WORKER_URL,
        registrationScope: `chrome-extension://${FOREIGN_EXTENSION_ID}/`,
      },
    ],
    [
      'wrong worker url',
      {
        workerUrl: `chrome-extension://${EXTENSION_ID}/unexpected-worker.js`,
        registrationScope: WORKER_SCOPE,
      },
    ],
    [
      'non-root registration scope',
      { workerUrl: WORKER_URL, registrationScope: `${WORKER_SCOPE}nested/` },
    ],
    [
      'crossed registration protocol',
      { workerUrl: WORKER_URL, registrationScope: `https://${EXTENSION_ID}/` },
    ],
    [
      'extra field',
      { workerUrl: WORKER_URL, registrationScope: WORKER_SCOPE, unapprovedExtra: true },
    ],
  ])(
    'rejects a second claim after an invalid handshake result: %s',
    async (_label, invalidResult) => {
      const rig = await startRig();
      rig.socket.respondNext('Runtime.evaluate', exactHandshakeResult(invalidResult));
      const restart = await beginRestart(rig);

      rig.socket.emitExecutionContext('session-extension', 8, 'unique-invalid-handshake');
      await flushTasks();
      expect(restart.status()).toBe('pending');

      rig.socket.emitExecutionContext('session-extension', 9, 'unique-valid-handshake');
      await expect(restart.promise).rejects.toThrow(/second|context|claim/i);
    }
  );

  it('preserves one original timeout while rejecting a second claim after protocol failure', async () => {
    const rig = await startRig();
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    rig.socket.failNext('Runtime.evaluate', 'Cannot find context with specified unique id');
    const restart = await beginRestart(rig);
    const originalRestartBudgets = timeout.mock.calls
      .map(([, delay]) => delay)
      .filter((delay): delay is number => typeof delay === 'number' && delay > 1_000);

    rig.socket.emitExecutionContext('session-extension', 8, 'unique-stale-a');
    await flushTasks();
    expect(restart.status()).toBe('pending');
    const budgetsAfterStaleClaim = timeout.mock.calls
      .map(([, delay]) => delay)
      .filter((delay): delay is number => typeof delay === 'number' && delay > 1_000);
    expect(budgetsAfterStaleClaim).toEqual(originalRestartBudgets);

    rig.socket.emitExecutionContext('session-extension', 9, 'unique-current-b');
    await expect(restart.promise).rejects.toThrow(/second|context|claim/i);
    const finalRestartBudgets = timeout.mock.calls
      .map(([, delay]) => delay)
      .filter((delay): delay is number => typeof delay === 'number' && delay > 1_000);
    expect(finalRestartBudgets).toEqual(originalRestartBudgets);
    expect(finalRestartBudgets.every((delay) => delay <= 20_000)).toBe(true);
  });

  it('rejects a second current context while the first identity handshake is pending', async () => {
    const rig = await startRig();
    const restart = await beginRestart(rig);

    rig.socket.emitDetached('target-extension', 'session-extension');
    rig.socket.emitAttached('target-extension', 'session-extension', WORKER_URL);
    await flushTasks();
    rig.socket.holdNext('Runtime.evaluate');

    rig.socket.emitExecutionContext('session-extension', 8, 'unique-late-event-a');
    await vi.waitFor(() => expect(rig.socket.heldCount('Runtime.evaluate')).toBe(1));
    rig.socket.emitExecutionContext('session-extension', 9, 'unique-current-event-b');
    await flushTasks();

    expect(restart.status()).toBe('rejected');
    expect(runtimeEvaluateCommands(rig.socket)).toHaveLength(1);

    rig.socket.releaseHeld('Runtime.evaluate', {
      error: 'Cannot find context with specified unique id',
    });
    await expect(restart.promise).rejects.toThrow(/second|context|claim/i);

    expect(runtimeEvaluateCommands(rig.socket).map((command) => command.params)).toEqual([
      expect.objectContaining({ uniqueContextId: 'unique-late-event-a' }),
    ]);
  });

  it.each(['success', 'failure'] as const)(
    'rejects replacement context B while a delayed handshake A returns %s',
    async (lateOutcome) => {
      const rig = await startRig();
      rig.socket.holdNext('Runtime.evaluate');
      const restart = await beginRestart(rig);

      rig.socket.emitExecutionContext('session-extension', 8, 'unique-delayed-a');
      await vi.waitFor(() => expect(rig.socket.heldCount('Runtime.evaluate')).toBe(1));

      rig.socket.emitDetached('target-extension', 'session-extension');
      rig.socket.emitAttached('target-extension', 'session-extension', WORKER_URL);
      await flushTasks();
      rig.socket.emitExecutionContext('session-extension', 8, 'unique-current-b');
      await expect(restart.promise).rejects.toThrow(/second|context|claim/i);

      rig.socket.releaseHeld(
        'Runtime.evaluate',
        lateOutcome === 'success'
          ? {
              result: exactHandshakeResult({
                workerUrl: WORKER_URL,
                registrationScope: WORKER_SCOPE,
              }),
            }
          : { error: 'late stale handshake failure' }
      );
      await flushTasks();
    }
  );

  it.each(['success', 'failure'] as const)(
    'rejects replacement context B while delayed resume A returns %s',
    async (lateOutcome) => {
      const rig = await startRig();
      rig.socket.holdNext('Runtime.runIfWaitingForDebugger');
      const restart = await beginRestart(rig);

      rig.socket.emitExecutionContext('session-extension', 8, 'unique-resume-a');
      await vi.waitFor(() =>
        expect(rig.socket.heldCount('Runtime.runIfWaitingForDebugger')).toBe(1)
      );

      rig.socket.emitDetached('target-extension', 'session-extension');
      rig.socket.emitAttached('target-extension', 'session-extension', WORKER_URL);
      await flushTasks();
      rig.socket.emitExecutionContext('session-extension', 8, 'unique-resume-b');
      await expect(restart.promise).rejects.toThrow(/second|context|claim/i);

      rig.socket.releaseHeld(
        'Runtime.runIfWaitingForDebugger',
        lateOutcome === 'success' ? {} : { error: 'late stale resume failure' }
      );
      await flushTasks();
    }
  );

  it.each(['success', 'failure'] as const)(
    'rejects replacement context B while delayed caller probe A returns %s',
    async (lateOutcome) => {
      const rig = await startRig();
      rig.socket.respondNext(
        'Runtime.evaluate',
        exactHandshakeResult({ workerUrl: WORKER_URL, registrationScope: WORKER_SCOPE })
      );
      rig.socket.holdNext('Runtime.evaluate');
      const restart = await beginRestart(rig, 'delayedCallerProbe()');

      rig.socket.emitExecutionContext('session-extension', 8, 'unique-probe-a');
      await vi.waitFor(() => expect(rig.socket.heldCount('Runtime.evaluate')).toBe(1));
      expect(rig.socket.heldCommands('Runtime.evaluate')[0]!.params).toMatchObject({
        expression: 'delayedCallerProbe()',
        uniqueContextId: 'unique-probe-a',
      });

      rig.socket.emitDetached('target-extension', 'session-extension');
      rig.socket.emitAttached('target-extension', 'session-extension', WORKER_URL);
      await flushTasks();
      rig.socket.emitExecutionContext('session-extension', 9, 'unique-probe-b');
      await expect(restart.promise).rejects.toThrow(/second|context|claim/i);

      rig.socket.releaseHeld(
        'Runtime.evaluate',
        lateOutcome === 'success'
          ? { result: { result: { type: 'number', value: 7 } } }
          : { error: 'late stale caller probe failure' }
      );
      await flushTasks();
    }
  );

  it('rejects a delayed correlated evaluation whose published context became stale', async () => {
    const rig = await startRig();
    const restart = await beginRestart(rig);
    rig.socket.emitExecutionContext('session-extension', 8, 'unique-published-a');
    await expect(restart.promise).resolves.toBe(rig.worker);

    rig.socket.respondNext('Runtime.evaluate', {
      result: { type: 'number', value: 42 },
      exceptionDetails: {},
    });
    await expect(
      rig.observer.evaluateInCorrelatedContext('emptyExceptionDetails()')
    ).rejects.toThrow('exceptionDetails');

    rig.socket.holdNext('Runtime.evaluate');
    const evaluation = rig.observer.evaluateInCorrelatedContext('slowRead()');
    void evaluation.catch(() => undefined);
    await vi.waitFor(() => expect(rig.socket.heldCount('Runtime.evaluate')).toBe(1));
    const held = rig.socket.heldCommands('Runtime.evaluate')[0]!;
    expect(held.params).toMatchObject({ uniqueContextId: 'unique-published-a' });
    expect(held.params).not.toHaveProperty('contextId');

    rig.socket.emitDetached('target-extension', 'session-extension');
    rig.socket.emitAttached('target-extension', 'session-extension', WORKER_URL);
    rig.socket.releaseHeld('Runtime.evaluate', {
      result: { result: { type: 'number', value: 42 } },
    });

    await expect(evaluation).rejects.toThrow('stale');
  });

  it('ignores a late Runtime.enable success from attachment A while initial B is current', async () => {
    FakeWebSocket.initialPlans = [{ method: 'Runtime.enable', hold: true }];
    FakeWebSocket.nextAutoInitialContext = false;
    const rig = createObserver();
    let startStatus: 'pending' | 'resolved' | 'rejected' = 'pending';
    const start = rig.observer.start();
    void start.then(
      () => {
        startStatus = 'resolved';
      },
      () => {
        startStatus = 'rejected';
      }
    );
    await vi.waitFor(() => expect(FakeWebSocket.latest).not.toBeNull());
    const socket = FakeWebSocket.latest!;
    activeSockets.add(socket);
    await vi.waitFor(() => expect(socket.heldCount('Runtime.enable')).toBe(1));

    socket.emitDetached('target-extension', 'session-extension');
    socket.holdNext('Runtime.enable');
    socket.emitAttached('target-extension', 'session-extension', WORKER_URL);
    await vi.waitFor(() => expect(socket.heldCount('Runtime.enable')).toBe(2));

    socket.releaseHeld('Runtime.enable');
    socket.emitExecutionContext('session-extension', 8, 'unique-initial-b');
    await flushTasks(40);
    expect(startStatus).toBe('pending');

    socket.releaseHeld('Runtime.enable');
    await expect(start).resolves.toBeUndefined();
  });

  it('ignores a late Runtime.enable error from detached A instead of rejecting waiter B', async () => {
    const rig = await startRig();
    const restart = await beginRestart(rig);

    rig.socket.emitDetached('target-extension', 'session-extension');
    rig.socket.holdNext('Runtime.enable');
    rig.socket.emitAttached('target-extension', 'session-extension', WORKER_URL);
    await vi.waitFor(() => expect(rig.socket.heldCount('Runtime.enable')).toBe(1));

    rig.socket.emitDetached('target-extension', 'session-extension');
    rig.socket.emitAttached('target-extension', 'session-extension', WORKER_URL);
    await flushTasks();
    rig.socket.releaseHeld('Runtime.enable', { error: 'late detached Runtime.enable failure' });
    await flushTasks();
    expect(restart.status()).toBe('pending');

    rig.socket.emitExecutionContext('session-extension', 9, 'unique-attachment-b');
    await expect(restart.promise).resolves.toBe(rig.worker);
  });

  it('settles cleanup when a CDP response remains held after the original timeout', async () => {
    const rig = await startRig();
    vi.useFakeTimers();
    rig.socket.holdNext('Runtime.evaluate');
    const restart = rig.observer.restart(rig.currentWorker);
    void restart.catch(() => undefined);
    for (let index = 0; index < 8; index += 1) {
      await Promise.resolve();
    }
    expect(rig.serviceWorkerCdp.stopCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(0);
    for (let index = 0; index < 32; index += 1) {
      await Promise.resolve();
    }
    expect(rig.serviceWorkerCdp.startCalls).toBe(1);

    rig.socket.emitExecutionContext('session-extension', 8, 'unique-held-past-timeout');
    await vi.advanceTimersByTimeAsync(0);
    for (let index = 0; index < 16; index += 1) {
      await Promise.resolve();
    }
    expect(rig.socket.heldCount('Runtime.evaluate')).toBe(1);

    await vi.advanceTimersByTimeAsync(20_000);
    await expect(restart).rejects.toThrow('Timed out waiting');

    let stopStatus: 'pending' | 'resolved' | 'rejected' = 'pending';
    const stop = rig.observer.stop();
    void stop.then(
      () => {
        stopStatus = 'resolved';
      },
      () => {
        stopStatus = 'rejected';
      }
    );
    for (let index = 0; index < 32; index += 1) {
      await Promise.resolve();
    }

    await expect(stop).resolves.toBeUndefined();
    expect(stopStatus).toBe('resolved');
  });

  it('rejects a foreign browser-root service-worker attachment as profile contamination', async () => {
    const rig = await startRig();
    const restart = await beginRestart(rig);

    rig.socket.emitAttached(
      'target-foreign',
      'session-foreign',
      `chrome-extension://${FOREIGN_EXTENSION_ID}/service-worker-loader.js`
    );
    rig.socket.emitExecutionContext('session-foreign', 99, 'unique-foreign');
    await expect(restart.promise).rejects.toThrow(/foreign|contaminant/i);
    expect(runtimeEvaluateCommands(rig.socket)).toEqual([]);
  });
});
