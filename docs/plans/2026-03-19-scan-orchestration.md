> **⚠️ Historical document** — Ce plan a été rédigé pendant une phase antérieure du projet. Certains choix techniques mentionnés (XState, offscreen document, API Anthropic, Malt, Comet) ne reflètent plus l'architecture actuelle. Voir `README.md` et `AGENTS.md` pour l'état courant.


# Scan Orchestration par Actor Model — Plan d'implementation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remplacer le scanner imperatif par un actor model XState 5 donnant une visibilite fine par connecteur.

**Architecture:** Machine parente (scan orchestrator) qui spawn sequentiellement des acteurs enfants (connector actor) avec retry integre. Les statuts par connecteur sont observables en temps reel et persistes dans IndexedDB.

**Tech Stack:** XState 5 (setup, createMachine, fromPromise, assign), TypeScript strict, Svelte 5 runes, IndexedDB

**Design doc:** `docs/plans/2026-03-19-scan-orchestration-design.md`

---

### Task 1: Types ConnectorStatus (Core)

**Files:**
- Create: `src/lib/core/types/connector-status.ts`
- Test: `tests/unit/types/connector-status.test.ts`

**Step 1: Write the test**

```ts
// tests/unit/types/connector-status.test.ts
import { describe, it, expect } from 'vitest';
import type { ConnectorStatus, PersistedConnectorStatus } from '../../../src/lib/core/types/connector-status';

describe('ConnectorStatus types', () => {
  it('creates a valid pending status', () => {
    const status: ConnectorStatus = {
      connectorId: 'free-work',
      connectorName: 'Free-Work',
      state: 'pending',
      missionsCount: 0,
      error: null,
      retryCount: 0,
      startedAt: null,
      completedAt: null,
    };
    expect(status.state).toBe('pending');
    expect(status.error).toBeNull();
  });

  it('creates a valid persisted status', () => {
    const persisted: PersistedConnectorStatus = {
      connectorId: 'free-work',
      connectorName: 'Free-Work',
      lastState: 'done',
      missionsCount: 42,
      error: null,
      lastSyncAt: 1710000000000,
      lastSuccessAt: 1710000000000,
    };
    expect(persisted.lastState).toBe('done');
    expect(persisted.missionsCount).toBe(42);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/types/connector-status.test.ts`
Expected: FAIL — module not found

**Step 3: Write the types**

```ts
// src/lib/core/types/connector-status.ts
import type { AppError } from '../errors/app-error';

export type ConnectorState = 'pending' | 'detecting' | 'fetching' | 'retrying' | 'done' | 'error';

export interface ConnectorStatus {
  readonly connectorId: string;
  readonly connectorName: string;
  readonly state: ConnectorState;
  readonly missionsCount: number;
  readonly error: AppError | null;
  readonly retryCount: number;
  readonly startedAt: number | null;
  readonly completedAt: number | null;
}

export interface PersistedConnectorStatus {
  readonly connectorId: string;
  readonly connectorName: string;
  readonly lastState: 'done' | 'error';
  readonly missionsCount: number;
  readonly error: Record<string, unknown> | null;
  readonly lastSyncAt: number;
  readonly lastSuccessAt: number | null;
}

export function createInitialStatus(connectorId: string, connectorName: string): ConnectorStatus {
  return {
    connectorId,
    connectorName,
    state: 'pending',
    missionsCount: 0,
    error: null,
    retryCount: 0,
    startedAt: null,
    completedAt: null,
  };
}

export function toPersistedStatus(status: ConnectorStatus, now: number): PersistedConnectorStatus {
  return {
    connectorId: status.connectorId,
    connectorName: status.connectorName,
    lastState: status.state === 'error' ? 'error' : 'done',
    missionsCount: status.missionsCount,
    error: status.error ? { type: status.error.type, message: status.error.message } : null,
    lastSyncAt: now,
    lastSuccessAt: status.state === 'done' ? now : null,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/types/connector-status.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/core/types/connector-status.ts tests/unit/types/connector-status.test.ts
git commit -m "feat(core): add ConnectorStatus types for actor model orchestration"
```

---

### Task 2: Connector Actor Machine

**Files:**
- Create: `src/machines/connector.actor.ts`
- Test: `tests/unit/machines/connector-actor.test.ts`

**Step 1: Write the test**

```ts
// tests/unit/machines/connector-actor.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createActor } from 'xstate';
import { connectorActorMachine } from '../../../src/machines/connector.actor';
import type { Mission } from '../../../src/lib/core/types/mission';
import { createNetworkError } from '../../../src/lib/core/errors/app-error';

function makeMission(id: string): Mission {
  return {
    id,
    title: `Mission ${id}`,
    client: 'Acme',
    description: 'Test mission',
    stack: ['TypeScript'],
    tjm: 500,
    location: 'Paris',
    remote: 'full',
    duration: '3 mois',
    url: `https://example.com/${id}`,
    source: 'free-work',
    scrapedAt: new Date('2026-01-01'),
    score: 50,
    semanticScore: null,
    semanticReason: null,
  };
}

describe('connector actor machine', () => {
  it('goes idle -> detecting -> fetching -> done on success', async () => {
    const detectSession = vi.fn().mockResolvedValue({ ok: true, value: true });
    const fetchMissions = vi.fn().mockResolvedValue({ ok: true, value: [makeMission('1')] });

    const actor = createActor(connectorActorMachine, {
      input: {
        connectorId: 'free-work',
        connectorName: 'Free-Work',
        detectSession,
        fetchMissions,
      },
    });

    const states: string[] = [];
    actor.subscribe((s) => {
      const value = typeof s.value === 'string' ? s.value : Object.keys(s.value)[0];
      states.push(value);
    });

    actor.start();
    actor.send({ type: 'START' });

    // Wait for async transitions
    await vi.waitFor(() => {
      expect(actor.getSnapshot().status).toBe('done');
    });

    expect(states).toContain('detecting');
    expect(states).toContain('fetching');
    expect(actor.getSnapshot().context.missions).toHaveLength(1);
    expect(detectSession).toHaveBeenCalledOnce();
    expect(fetchMissions).toHaveBeenCalledOnce();
  });

  it('goes to error when session detection fails (non-retryable)', async () => {
    const detectSession = vi.fn().mockResolvedValue({
      ok: false,
      error: createNetworkError('403 Forbidden', { status: 403, retryable: false }, Date.now()),
    });
    const fetchMissions = vi.fn();

    const actor = createActor(connectorActorMachine, {
      input: {
        connectorId: 'lehibou',
        connectorName: 'LeHibou',
        detectSession,
        fetchMissions,
      },
    });

    actor.start();
    actor.send({ type: 'START' });

    await vi.waitFor(() => {
      expect(actor.getSnapshot().status).toBe('done');
    });

    expect(actor.getSnapshot().context.error).not.toBeNull();
    expect(fetchMissions).not.toHaveBeenCalled();
  });

  it('retries on retryable fetch error then succeeds', async () => {
    const detectSession = vi.fn().mockResolvedValue({ ok: true, value: true });
    const fetchMissions = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        error: createNetworkError('500 Server Error', { status: 500, retryable: true }, Date.now()),
      })
      .mockResolvedValueOnce({ ok: true, value: [makeMission('1')] });

    const actor = createActor(connectorActorMachine, {
      input: {
        connectorId: 'comet',
        connectorName: 'Comet',
        detectSession,
        fetchMissions,
      },
    });

    actor.start();
    actor.send({ type: 'START' });

    await vi.waitFor(() => {
      expect(actor.getSnapshot().status).toBe('done');
    }, { timeout: 10000 });

    expect(actor.getSnapshot().context.missions).toHaveLength(1);
    expect(actor.getSnapshot().context.retryCount).toBe(1);
    expect(fetchMissions).toHaveBeenCalledTimes(2);
  });

  it('goes to error after max retries exhausted', async () => {
    const retryableError = createNetworkError('500', { status: 500, retryable: true }, Date.now());
    const detectSession = vi.fn().mockResolvedValue({ ok: true, value: true });
    const fetchMissions = vi.fn().mockResolvedValue({ ok: false, error: retryableError });

    const actor = createActor(connectorActorMachine, {
      input: {
        connectorId: 'comet',
        connectorName: 'Comet',
        detectSession,
        fetchMissions,
        maxRetries: 2,
      },
    });

    actor.start();
    actor.send({ type: 'START' });

    await vi.waitFor(() => {
      expect(actor.getSnapshot().status).toBe('done');
    }, { timeout: 15000 });

    expect(actor.getSnapshot().context.error).not.toBeNull();
    expect(fetchMissions).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('skips detection when no session detected (not an error)', async () => {
    const detectSession = vi.fn().mockResolvedValue({ ok: true, value: false });
    const fetchMissions = vi.fn();

    const actor = createActor(connectorActorMachine, {
      input: {
        connectorId: 'lehibou',
        connectorName: 'LeHibou',
        detectSession,
        fetchMissions,
      },
    });

    actor.start();
    actor.send({ type: 'START' });

    await vi.waitFor(() => {
      expect(actor.getSnapshot().status).toBe('done');
    });

    // No session = error state with a session-expired error, but not a crash
    expect(actor.getSnapshot().context.error).not.toBeNull();
    expect(fetchMissions).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/machines/connector-actor.test.ts`
Expected: FAIL — module not found

**Step 3: Write the connector actor machine**

```ts
// src/machines/connector.actor.ts
import { setup, assign, fromPromise, sendParent } from 'xstate';
import type { Mission } from '../lib/core/types/mission';
import type { AppError, Result } from '$lib/core/errors';
import { createConnectorError } from '../lib/core/errors/app-error';
import { isRetryable } from '../lib/core/errors/app-error';

type DetectFn = (now: number) => Promise<Result<boolean, AppError>>;
type FetchFn = (now: number) => Promise<Result<Mission[], AppError>>;

export type ConnectorActorInput = {
  connectorId: string;
  connectorName: string;
  detectSession: DetectFn;
  fetchMissions: FetchFn;
  maxRetries?: number;
};

type ConnectorActorContext = {
  connectorId: string;
  connectorName: string;
  missions: Mission[];
  error: AppError | null;
  retryCount: number;
  maxRetries: number;
  startedAt: number;
  completedAt: number | null;
  detectSession: DetectFn;
  fetchMissions: FetchFn;
};

type ConnectorActorEvent =
  | { type: 'START' };

export const connectorActorMachine = setup({
  types: {
    context: {} as ConnectorActorContext,
    events: {} as ConnectorActorEvent,
    input: {} as ConnectorActorInput,
  },
  actors: {
    detect: fromPromise<Result<boolean, AppError>, { detectSession: DetectFn }>(
      ({ input }) => input.detectSession(Date.now())
    ),
    fetch: fromPromise<Result<Mission[], AppError>, { fetchMissions: FetchFn }>(
      ({ input }) => input.fetchMissions(Date.now())
    ),
    retryDelay: fromPromise<void, { retryCount: number }>(
      ({ input }) => {
        const delay = Math.min(1000 * Math.pow(2, input.retryCount), 10000);
        const jitter = Math.random() * 0.3 * delay;
        return new Promise((resolve) => setTimeout(resolve, delay + jitter));
      }
    ),
  },
  actions: {
    setDetectError: assign({
      error: (_, params: { error: AppError }) => params.error,
      completedAt: () => Date.now(),
    }),
    setFetchResult: assign({
      missions: (_, params: { missions: Mission[] }) => params.missions,
      completedAt: () => Date.now(),
    }),
    setFetchError: assign({
      error: (_, params: { error: AppError }) => params.error,
      completedAt: () => Date.now(),
    }),
    incrementRetry: assign({
      retryCount: ({ context }) => context.retryCount + 1,
    }),
    setNoSessionError: assign({
      error: ({ context }) => createConnectorError(
        `Session expirée pour ${context.connectorName}`,
        { connectorId: context.connectorId, phase: 'detect', recoverable: true },
        Date.now()
      ),
      completedAt: () => Date.now(),
    }),
  },
  guards: {
    canRetry: ({ context }) => context.retryCount < context.maxRetries,
    isRetryableError: (_, params: { error: AppError }) => isRetryable(params),
  },
}).createMachine({
  id: 'connectorActor',
  initial: 'idle',
  context: ({ input }) => ({
    connectorId: input.connectorId,
    connectorName: input.connectorName,
    missions: [],
    error: null,
    retryCount: 0,
    maxRetries: input.maxRetries ?? 3,
    startedAt: Date.now(),
    completedAt: null,
    detectSession: input.detectSession,
    fetchMissions: input.fetchMissions,
  }),
  states: {
    idle: {
      on: {
        START: { target: 'detecting' },
      },
    },
    detecting: {
      invoke: {
        src: 'detect',
        input: ({ context }) => ({ detectSession: context.detectSession }),
        onDone: [
          {
            guard: ({ event }) => event.output.ok && event.output.value === true,
            target: 'fetching',
          },
          {
            guard: ({ event }) => event.output.ok && event.output.value === false,
            target: 'done',
            actions: 'setNoSessionError',
          },
          {
            target: 'done',
            actions: {
              type: 'setDetectError',
              params: ({ event }) => ({ error: event.output.error }),
            },
          },
        ],
        onError: {
          target: 'done',
          actions: assign({
            error: ({ context }) => createConnectorError(
              `Erreur inattendue lors de la détection pour ${context.connectorName}`,
              { connectorId: context.connectorId, phase: 'detect' },
              Date.now()
            ),
            completedAt: () => Date.now(),
          }),
        },
      },
    },
    fetching: {
      invoke: {
        src: 'fetch',
        input: ({ context }) => ({ fetchMissions: context.fetchMissions }),
        onDone: [
          {
            guard: ({ event }) => event.output.ok,
            target: 'done',
            actions: {
              type: 'setFetchResult',
              params: ({ event }) => ({ missions: event.output.value }),
            },
          },
          {
            guard: ({ event, context }) =>
              !event.output.ok && isRetryable(event.output.error) && context.retryCount < context.maxRetries,
            target: 'retrying',
            actions: [
              'incrementRetry',
              assign({ error: ({ event }) => event.output.error }),
            ],
          },
          {
            target: 'done',
            actions: {
              type: 'setFetchError',
              params: ({ event }) => ({ error: event.output.error }),
            },
          },
        ],
        onError: {
          target: 'done',
          actions: assign({
            error: ({ context }) => createConnectorError(
              `Erreur inattendue lors du fetch pour ${context.connectorName}`,
              { connectorId: context.connectorId, phase: 'fetch' },
              Date.now()
            ),
            completedAt: () => Date.now(),
          }),
        },
      },
    },
    retrying: {
      invoke: {
        src: 'retryDelay',
        input: ({ context }) => ({ retryCount: context.retryCount }),
        onDone: { target: 'fetching' },
      },
    },
    done: {
      type: 'final',
    },
  },
});
```

**Note:** L'acteur utilise `type: 'final'` pour `done` — le parent detecte la fin via `onDone` du spawn. L'erreur et les missions sont dans le contexte du snapshot final.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/machines/connector-actor.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add src/machines/connector.actor.ts tests/unit/machines/connector-actor.test.ts
git commit -m "feat(machines): add connector actor machine with retry logic"
```

---

### Task 3: Scan Orchestrator Machine

**Files:**
- Create: `src/machines/scan.machine.ts`
- Test: `tests/unit/machines/scan-orchestrator.test.ts`

**Step 1: Write the test**

```ts
// tests/unit/machines/scan-orchestrator.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createActor } from 'xstate';
import { scanOrchestratorMachine } from '../../../src/machines/scan.machine';
import type { Mission } from '../../../src/lib/core/types/mission';

function makeMission(id: string, source: string): Mission {
  return {
    id,
    title: `Mission ${id}`,
    client: 'Acme',
    description: 'Test',
    stack: ['TypeScript'],
    tjm: 500,
    location: 'Paris',
    remote: 'full',
    duration: '3 mois',
    url: `https://example.com/${id}`,
    source: source as any,
    scrapedAt: new Date('2026-01-01'),
    score: 50,
    semanticScore: null,
    semanticReason: null,
  };
}

function makeConnectorDeps(id: string, name: string, missions: Mission[]) {
  return {
    connectorId: id,
    connectorName: name,
    detectSession: vi.fn().mockResolvedValue({ ok: true, value: true }),
    fetchMissions: vi.fn().mockResolvedValue({ ok: true, value: missions }),
  };
}

describe('scan orchestrator machine', () => {
  it('starts in idle, transitions to preparing on START_SCAN', () => {
    const actor = createActor(scanOrchestratorMachine, {
      input: { connectorDeps: [], isOnline: () => true },
    });
    actor.start();
    expect(actor.getSnapshot().value).toBe('idle');

    actor.send({ type: 'START_SCAN' });
    // Should move to preparing or scanning
    const state = actor.getSnapshot().value;
    expect(['preparing', 'scanning', 'done']).toContain(state);
    actor.stop();
  });

  it('completes a scan with two connectors sequentially', async () => {
    const deps = [
      makeConnectorDeps('free-work', 'Free-Work', [makeMission('fw-1', 'free-work')]),
      makeConnectorDeps('comet', 'Comet', [makeMission('c-1', 'comet')]),
    ];

    const actor = createActor(scanOrchestratorMachine, {
      input: { connectorDeps: deps, isOnline: () => true },
    });
    actor.start();
    actor.send({ type: 'START_SCAN' });

    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe('done');
    }, { timeout: 15000 });

    const ctx = actor.getSnapshot().context;
    expect(ctx.missions).toHaveLength(2);

    const statuses = ctx.connectorStatuses;
    expect(statuses.get('free-work')?.state).toBe('done');
    expect(statuses.get('comet')?.state).toBe('done');
    expect(statuses.get('free-work')?.missionsCount).toBe(1);
    expect(statuses.get('comet')?.missionsCount).toBe(1);
    actor.stop();
  });

  it('handles one connector failing without stopping the scan', async () => {
    const deps = [
      {
        connectorId: 'lehibou',
        connectorName: 'LeHibou',
        detectSession: vi.fn().mockResolvedValue({ ok: true, value: false }),
        fetchMissions: vi.fn(),
      },
      makeConnectorDeps('free-work', 'Free-Work', [makeMission('fw-1', 'free-work')]),
    ];

    const actor = createActor(scanOrchestratorMachine, {
      input: { connectorDeps: deps, isOnline: () => true },
    });
    actor.start();
    actor.send({ type: 'START_SCAN' });

    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe('done');
    }, { timeout: 15000 });

    const ctx = actor.getSnapshot().context;
    expect(ctx.missions).toHaveLength(1);
    expect(ctx.connectorStatuses.get('lehibou')?.error).not.toBeNull();
    expect(ctx.connectorStatuses.get('free-work')?.state).toBe('done');
    actor.stop();
  });

  it('goes to cancelled on CANCEL event during scanning', async () => {
    const slowFetch = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, value: [] }), 5000))
    );
    const deps = [{
      connectorId: 'slow',
      connectorName: 'Slow',
      detectSession: vi.fn().mockResolvedValue({ ok: true, value: true }),
      fetchMissions: slowFetch,
    }];

    const actor = createActor(scanOrchestratorMachine, {
      input: { connectorDeps: deps, isOnline: () => true },
    });
    actor.start();
    actor.send({ type: 'START_SCAN' });

    // Wait until we're in scanning state
    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe('scanning');
    });

    actor.send({ type: 'CANCEL' });
    expect(actor.getSnapshot().value).toBe('cancelled');
    actor.stop();
  });

  it('returns to idle from done on RESET', async () => {
    const deps = [
      makeConnectorDeps('free-work', 'Free-Work', [makeMission('fw-1', 'free-work')]),
    ];
    const actor = createActor(scanOrchestratorMachine, {
      input: { connectorDeps: deps, isOnline: () => true },
    });
    actor.start();
    actor.send({ type: 'START_SCAN' });

    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe('done');
    }, { timeout: 10000 });

    actor.send({ type: 'RESET' });
    expect(actor.getSnapshot().value).toBe('idle');
    actor.stop();
  });

  it('goes to done with error when offline', () => {
    const actor = createActor(scanOrchestratorMachine, {
      input: { connectorDeps: [], isOnline: () => false },
    });
    actor.start();
    actor.send({ type: 'START_SCAN' });

    const ctx = actor.getSnapshot().context;
    expect(ctx.globalError).not.toBeNull();
    actor.stop();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/machines/scan-orchestrator.test.ts`
Expected: FAIL — module not found

**Step 3: Write the scan orchestrator machine**

```ts
// src/machines/scan.machine.ts
import { setup, assign, createMachine, fromCallback, type ActorRefFrom } from 'xstate';
import { connectorActorMachine, type ConnectorActorInput } from './connector.actor';
import type { Mission } from '../lib/core/types/mission';
import type { ConnectorStatus } from '../lib/core/types/connector-status';
import { createInitialStatus } from '../lib/core/types/connector-status';

export type ConnectorDeps = ConnectorActorInput;

export type ScanOrchestratorInput = {
  connectorDeps: ConnectorDeps[];
  isOnline: () => boolean;
};

type ScanOrchestratorContext = {
  connectorStatuses: Map<string, ConnectorStatus>;
  currentConnectorIndex: number;
  connectorDeps: ConnectorDeps[];
  missions: Mission[];
  globalError: string | null;
  isOnline: () => boolean;
};

type ScanOrchestratorEvent =
  | { type: 'START_SCAN' }
  | { type: 'CANCEL' }
  | { type: 'RESET' }
  | { type: 'CONNECTOR_COMPLETED' };

export const scanOrchestratorMachine = setup({
  types: {
    context: {} as ScanOrchestratorContext,
    events: {} as ScanOrchestratorEvent,
    input: {} as ScanOrchestratorInput,
  },
  actors: {
    connectorActor: connectorActorMachine,
  },
  actions: {
    initStatuses: assign({
      connectorStatuses: ({ context }) => {
        const statuses = new Map<string, ConnectorStatus>();
        for (const dep of context.connectorDeps) {
          statuses.set(dep.connectorId, createInitialStatus(dep.connectorId, dep.connectorName));
        }
        return statuses;
      },
    }),
    updateStatusFromChild: assign({
      connectorStatuses: ({ context }, params: { connectorId: string; updates: Partial<ConnectorStatus> }) => {
        const newMap = new Map(context.connectorStatuses);
        const current = newMap.get(params.connectorId);
        if (current) {
          newMap.set(params.connectorId, { ...current, ...params.updates });
        }
        return newMap;
      },
    }),
    collectMissions: assign({
      missions: ({ context }, params: { connectorId: string; missions: Mission[] }) => {
        return [...context.missions, ...params.missions];
      },
    }),
    advanceConnector: assign({
      currentConnectorIndex: ({ context }) => context.currentConnectorIndex + 1,
    }),
    setOfflineError: assign({
      globalError: () => 'Aucune connexion internet',
    }),
  },
  guards: {
    isOnline: ({ context }) => context.isOnline(),
    hasMoreConnectors: ({ context }) => context.currentConnectorIndex < context.connectorDeps.length,
    noConnectors: ({ context }) => context.connectorDeps.length === 0,
  },
}).createMachine({
  id: 'scanOrchestrator',
  initial: 'idle',
  context: ({ input }) => ({
    connectorStatuses: new Map(),
    currentConnectorIndex: 0,
    connectorDeps: input.connectorDeps,
    missions: [],
    globalError: null,
    isOnline: input.isOnline,
  }),
  states: {
    idle: {
      on: {
        START_SCAN: [
          {
            guard: 'noConnectors',
            target: 'done',
          },
          {
            guard: { not: 'isOnline' },
            target: 'done',
            actions: 'setOfflineError',
          },
          {
            target: 'preparing',
          },
        ],
      },
    },
    preparing: {
      entry: 'initStatuses',
      always: { target: 'scanning' },
    },
    scanning: {
      entry: assign({
        connectorStatuses: ({ context }) => {
          const dep = context.connectorDeps[context.currentConnectorIndex];
          if (!dep) return context.connectorStatuses;
          const newMap = new Map(context.connectorStatuses);
          const current = newMap.get(dep.connectorId);
          if (current) {
            newMap.set(dep.connectorId, { ...current, state: 'detecting', startedAt: Date.now() });
          }
          return newMap;
        },
      }),
      invoke: {
        src: 'connectorActor',
        input: ({ context }) => {
          const dep = context.connectorDeps[context.currentConnectorIndex];
          return dep;
        },
        onSnapshot: {
          actions: assign({
            connectorStatuses: ({ context, event }) => {
              const dep = context.connectorDeps[context.currentConnectorIndex];
              if (!dep) return context.connectorStatuses;
              const snapshot = event.snapshot;
              if (snapshot.status !== 'active') return context.connectorStatuses;

              const childState = typeof snapshot.value === 'string'
                ? snapshot.value
                : Object.keys(snapshot.value)[0];

              const validStates = ['detecting', 'fetching', 'retrying'];
              if (!validStates.includes(childState)) return context.connectorStatuses;

              const newMap = new Map(context.connectorStatuses);
              const current = newMap.get(dep.connectorId);
              if (current) {
                newMap.set(dep.connectorId, {
                  ...current,
                  state: childState as ConnectorStatus['state'],
                  retryCount: snapshot.context.retryCount,
                });
              }
              return newMap;
            },
          }),
        },
        onDone: {
          actions: [
            // Update final status from child
            assign({
              connectorStatuses: ({ context, event }) => {
                const dep = context.connectorDeps[context.currentConnectorIndex];
                if (!dep) return context.connectorStatuses;
                const output = event.output;
                const newMap = new Map(context.connectorStatuses);
                const current = newMap.get(dep.connectorId);
                if (current) {
                  newMap.set(dep.connectorId, {
                    ...current,
                    state: output.context.error ? 'error' : 'done',
                    missionsCount: output.context.missions.length,
                    error: output.context.error,
                    retryCount: output.context.retryCount,
                    completedAt: Date.now(),
                  });
                }
                return newMap;
              },
              missions: ({ context, event }) => {
                const output = event.output;
                return [...context.missions, ...output.context.missions];
              },
              currentConnectorIndex: ({ context }) => context.currentConnectorIndex + 1,
            }),
          ],
          target: 'checkNext',
        },
      },
      on: {
        CANCEL: { target: 'cancelled' },
      },
    },
    checkNext: {
      always: [
        { guard: 'hasMoreConnectors', target: 'scanning' },
        { target: 'done' },
      ],
    },
    done: {
      on: {
        RESET: {
          target: 'idle',
          actions: assign({
            connectorStatuses: () => new Map(),
            currentConnectorIndex: () => 0,
            missions: () => [],
            globalError: () => null,
          }),
        },
        START_SCAN: {
          target: 'preparing',
          actions: assign({
            connectorStatuses: () => new Map(),
            currentConnectorIndex: () => 0,
            missions: () => [],
            globalError: () => null,
          }),
        },
      },
    },
    cancelled: {
      on: {
        RESET: {
          target: 'idle',
          actions: assign({
            connectorStatuses: () => new Map(),
            currentConnectorIndex: () => 0,
            missions: () => [],
            globalError: () => null,
          }),
        },
      },
    },
  },
});

export type ScanOrchestratorActor = ActorRefFrom<typeof scanOrchestratorMachine>;
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/machines/scan-orchestrator.test.ts`
Expected: PASS (6 tests)

**Note:** Le `onDone` d'un acteur invoque recoit le snapshot final du child actor dans `event.output`. Ajuster si l'API XState 5 differe — verifier la doc pour `invoke` + `onDone` avec des machines enfants.

**Step 5: Commit**

```bash
git add src/machines/scan.machine.ts tests/unit/machines/scan-orchestrator.test.ts
git commit -m "feat(machines): add scan orchestrator with sequential connector spawning"
```

---

### Task 4: IndexedDB — table `connector_status`

**Files:**
- Modify: `src/lib/shell/storage/db.ts` (lines 7-8 + new functions)
- Test: `tests/unit/storage/connector-status-db.test.ts`

**Step 1: Write the test**

```ts
// tests/unit/storage/connector-status-db.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { saveConnectorStatuses, getConnectorStatuses, clearConnectorStatuses } from '../../../src/lib/shell/storage/db';
import type { PersistedConnectorStatus } from '../../../src/lib/core/types/connector-status';

// fake-indexeddb is set up in the test setup

describe('connector_status storage', () => {
  beforeEach(async () => {
    await clearConnectorStatuses();
  });

  it('saves and retrieves connector statuses', async () => {
    const statuses: PersistedConnectorStatus[] = [
      {
        connectorId: 'free-work',
        connectorName: 'Free-Work',
        lastState: 'done',
        missionsCount: 10,
        error: null,
        lastSyncAt: Date.now(),
        lastSuccessAt: Date.now(),
      },
      {
        connectorId: 'comet',
        connectorName: 'Comet',
        lastState: 'error',
        missionsCount: 0,
        error: { type: 'network', message: '500 Server Error' },
        lastSyncAt: Date.now(),
        lastSuccessAt: null,
      },
    ];

    await saveConnectorStatuses(statuses);
    const result = await getConnectorStatuses();
    expect(result).toHaveLength(2);
    expect(result.find(s => s.connectorId === 'free-work')?.missionsCount).toBe(10);
    expect(result.find(s => s.connectorId === 'comet')?.lastState).toBe('error');
  });

  it('overwrites previous status on re-save', async () => {
    await saveConnectorStatuses([{
      connectorId: 'free-work',
      connectorName: 'Free-Work',
      lastState: 'error',
      missionsCount: 0,
      error: { type: 'network', message: 'timeout' },
      lastSyncAt: 1000,
      lastSuccessAt: null,
    }]);

    await saveConnectorStatuses([{
      connectorId: 'free-work',
      connectorName: 'Free-Work',
      lastState: 'done',
      missionsCount: 15,
      error: null,
      lastSyncAt: 2000,
      lastSuccessAt: 2000,
    }]);

    const result = await getConnectorStatuses();
    expect(result).toHaveLength(1);
    expect(result[0].lastState).toBe('done');
    expect(result[0].missionsCount).toBe(15);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/storage/connector-status-db.test.ts`
Expected: FAIL — functions not exported

**Step 3: Modify `db.ts`**

Changes:
- `DB_VERSION` from `1` to `2`
- Add `connector_status` store in `onupgradeneeded`
- Add `saveConnectorStatuses()`, `getConnectorStatuses()`, `clearConnectorStatuses()`

In `openDB()`, update the `onupgradeneeded` handler (around line 14-27):

```ts
request.onupgradeneeded = (event) => {
  const db = request.result;
  const oldVersion = (event as IDBVersionChangeEvent).oldVersion;

  if (oldVersion < 1) {
    const store = db.createObjectStore('missions', { keyPath: 'id' });
    store.createIndex('source', 'source', { unique: false });
    store.createIndex('scrapedAt', 'scrapedAt', { unique: false });
    db.createObjectStore('profile', { keyPath: 'id' });
  }
  if (oldVersion < 2) {
    db.createObjectStore('connector_status', { keyPath: 'connectorId' });
  }
};
```

Add at the end of `db.ts`:

```ts
// Connector Statuses
export async function saveConnectorStatuses(statuses: PersistedConnectorStatus[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('connector_status', 'readwrite');
  const store = tx.objectStore('connector_status');
  for (const status of statuses) {
    store.put(status);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getConnectorStatuses(): Promise<PersistedConnectorStatus[]> {
  return withStore<PersistedConnectorStatus[]>('connector_status', 'readonly', (store) => store.getAll());
}

export async function clearConnectorStatuses(): Promise<void> {
  return withStore<void>('connector_status', 'readwrite', (store) => store.clear());
}
```

Add import at top of `db.ts`:
```ts
import type { PersistedConnectorStatus } from '../../core/types/connector-status';
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/storage/connector-status-db.test.ts`
Expected: PASS

**Step 5: Run existing tests to ensure no regression**

Run: `pnpm vitest run tests/unit/storage/`
Expected: All PASS

**Step 6: Commit**

```bash
git add src/lib/shell/storage/db.ts src/lib/core/types/connector-status.ts tests/unit/storage/connector-status-db.test.ts
git commit -m "feat(storage): add connector_status table in IndexedDB v2"
```

---

### Task 5: Integrer dans FeedPage.svelte

**Files:**
- Modify: `src/ui/pages/FeedPage.svelte`
- Modify: `src/ui/organisms/ScanProgress.svelte` (adapter les props)

**Step 1: Modifier FeedPage.svelte — remplacer `runScan` par le scan actor**

Key changes in the `<script>` section:

1. Remove import of `runScan` from `$lib/shell/scan/scanner`
2. Add imports:
```ts
import { createActor } from 'xstate';
import { scanOrchestratorMachine, type ConnectorDeps } from '../../machines/scan.machine';
import { getConnector, getConnectorsMeta } from '$lib/shell/connectors/index';
import { getConnectorStatuses, saveConnectorStatuses } from '$lib/shell/storage/db';
import { toPersistedStatus, type ConnectorStatus } from '$lib/core/types/connector-status';
import { deduplicateMissions } from '$lib/core/scoring/dedup';
import { scoreMission } from '$lib/core/scoring/relevance';
import { isOnline } from '$lib/shell/utils/connection-monitor';
```

3. Replace `startScan()` function:
```ts
let scanActor = $state<ReturnType<typeof createActor<typeof scanOrchestratorMachine>> | null>(null);
let connectorStatuses = $state<Map<string, ConnectorStatus>>(new Map());
let persistedStatuses = $state<import('$lib/core/types/connector-status').PersistedConnectorStatus[]>([]);

// Load persisted statuses on mount
$effect(() => {
  getConnectorStatuses().then((s) => { persistedStatuses = s; }).catch(() => {});
});

async function startScan() {
  if (isLoading) return;
  feedActor.send({ type: 'LOAD' });

  const settings = await getSettings();
  const enabledIds = settings.enabledConnectors;

  // Build connector deps
  const deps: ConnectorDeps[] = [];
  const meta = getConnectorsMeta();
  for (const id of enabledIds) {
    const connector = await getConnector(id);
    if (!connector) continue;
    const m = meta.find((x) => x.id === id);
    deps.push({
      connectorId: connector.id,
      connectorName: m?.name ?? connector.name,
      detectSession: (now: number) => connector.detectSession(now),
      fetchMissions: (now: number) => connector.fetchMissions(now),
    });
  }

  const actor = createActor(scanOrchestratorMachine, {
    input: { connectorDeps: deps, isOnline },
  });

  // Observe statuses in real-time
  const sub = actor.subscribe((s) => {
    connectorStatuses = s.context.connectorStatuses;

    if (s.value === 'done') {
      const ctx = s.context;
      if (ctx.globalError) {
        feedActor.send({ type: 'LOAD_ERROR', error: ctx.globalError });
      } else if (ctx.missions.length === 0 && hasErrors(ctx.connectorStatuses)) {
        const errorMsg = [...ctx.connectorStatuses.values()]
          .filter((s) => s.error)
          .map((s) => `${s.connectorName}: ${s.error!.message}`)
          .join('\n');
        feedActor.send({ type: 'LOAD_ERROR', error: errorMsg });
      } else {
        // Dedup + score
        const deduped = deduplicateMissions(ctx.missions);
        getProfile().then((profile) => {
          const scored = profile
            ? deduped.map((m) => ({ ...m, score: scoreMission(m, profile) }))
            : deduped;
          feedActor.send({ type: 'MISSIONS_LOADED', missions: scored });
          // Persist
          saveMissions(scored).catch(() => {});
          chrome.storage.local.set({ lastGlobalSync: Date.now() }).catch(() => {});
          // Persist connector statuses
          const persisted = [...ctx.connectorStatuses.values()].map((s) => toPersistedStatus(s, Date.now()));
          saveConnectorStatuses(persisted).then(() => { persistedStatuses = persisted; }).catch(() => {});
        });
      }
      sub.unsubscribe();
      scanActor = null;
    }

    if (s.value === 'cancelled') {
      feedActor.send({ type: 'MISSIONS_LOADED', missions: feedSnapshot.context.missions });
      sub.unsubscribe();
      scanActor = null;
    }
  });

  scanActor = actor;
  actor.start();
  actor.send({ type: 'START_SCAN' });
}

function hasErrors(statuses: Map<string, ConnectorStatus>): boolean {
  return [...statuses.values()].some((s) => s.error !== null);
}

function stopScan() {
  if (scanActor) {
    scanActor.send({ type: 'CANCEL' });
  }
}
```

4. Remove old scan progress variables (`scanCurrent`, `scanTotal`, `scanConnectorName`, `scanPercent`) — replace with derived from `connectorStatuses`:
```ts
let scanProgress = $derived.by(() => {
  if (connectorStatuses.size === 0) return { current: 0, total: 0, percent: 0, connectorName: '' };
  const statuses = [...connectorStatuses.values()];
  const total = statuses.length;
  const completed = statuses.filter((s) => s.state === 'done' || s.state === 'error').length;
  const active = statuses.find((s) => s.state === 'detecting' || s.state === 'fetching' || s.state === 'retrying');
  return {
    current: completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    connectorName: active?.connectorName ?? '',
  };
});
```

5. Update `ScanProgress` component usage to pass `connectorStatuses` and `scanProgress`.

**Step 2: Update ScanProgress to accept new props**

Read `ScanProgress.svelte` first, then adapt it to accept `connectorStatuses: Map<string, ConnectorStatus>` and display per-connector state (colored dots, status text).

**Step 3: Run existing tests**

Run: `pnpm vitest run`
Expected: All pass (feed.test.ts should still pass since feed machine is unchanged)

**Step 4: Manual test in browser**

- Load extension
- Open side panel
- Click scan
- Verify per-connector progress appears
- Verify completed scan shows results

**Step 5: Commit**

```bash
git add src/ui/pages/FeedPage.svelte src/ui/organisms/ScanProgress.svelte
git commit -m "feat(ui): integrate scan orchestrator actor in FeedPage"
```

---

### Task 6: Adapter le Service Worker

**Files:**
- Modify: `src/background/index.ts`

**Step 1: Update auto-scan handler**

In the alarm listener (line 53-99), after `runScan()` succeeds, persist connector statuses:

```ts
import { saveConnectorStatuses } from '../lib/shell/storage/db';
import { toPersistedStatus, createInitialStatus } from '../lib/core/types/connector-status';
```

After `const result = await runScan();`, build and persist statuses:

```ts
// Build connector statuses from scan results
const connectorStatuses = result.errors.map((e) => ({
  connectorId: e.connectorId,
  connectorName: e.connectorId,
  lastState: 'error' as const,
  missionsCount: 0,
  error: { type: 'connector', message: e.message },
  lastSyncAt: Date.now(),
  lastSuccessAt: null,
}));

// Add successful connectors
const successfulIds = new Set(
  Object.keys(result.missions.reduce((acc, m) => {
    acc[m.source] = true;
    return acc;
  }, {} as Record<string, boolean>))
);
// Note: simplified — service worker doesn't need granular XState tracking
try {
  await saveConnectorStatuses([...connectorStatuses]);
} catch {}
```

**Note:** Le service worker garde `runScan()` car il ne peut pas utiliser XState. On persiste un statut simplifie. Quand le side panel se rouvre, il lit ces statuts depuis IndexedDB.

**Step 2: Run background tests**

Run: `pnpm vitest run tests/unit/background/`
Expected: PASS

**Step 3: Commit**

```bash
git add src/background/index.ts
git commit -m "feat(background): persist connector statuses in auto-scan"
```

---

### Task 7: Nettoyer l'ancien scanner

**Files:**
- Delete: `src/lib/shell/scan/scanner.ts` (only if no other imports remain)
- Modify: any remaining imports

**Step 1: Search for remaining imports**

Run: `grep -r "scan/scanner" src/`

If only `background/index.ts` still imports it (for auto-scan), keep it.
If nothing else imports it, delete it.

**Step 2: Update or delete scanner.test.ts**

Run: `pnpm vitest run tests/unit/scan/scanner.test.ts`
If it tests the old scanner, either:
- Delete it (replaced by connector-actor + scan-orchestrator tests)
- Or adapt it to test the new flow

**Step 3: Run full test suite**

Run: `pnpm vitest run`
Expected: All PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove old scanner, replaced by actor model orchestration"
```

---

### Task 8: Verification finale

**Step 1: Run full test suite**

Run: `pnpm vitest run`
Expected: All PASS

**Step 2: Build the extension**

Run: `pnpm build`
Expected: Build succeeds with no errors

**Step 3: Manual smoke test**

- Load extension in Chrome
- Open side panel
- Verify scan starts, shows per-connector progress
- Verify one connector failing shows error state (red) while others succeed
- Close and reopen side panel — verify persisted statuses appear
- Verify auto-scan via alarm still works (check service worker logs)

**Step 4: Final commit if needed**

```bash
git add -A
git commit -m "chore: final adjustments after scan orchestration integration"
```
