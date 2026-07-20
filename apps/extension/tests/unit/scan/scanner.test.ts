import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { AppError } from '../../../src/lib/core/errors/app-error';
import type { ConnectorSearchContext } from '../../../src/lib/core/connectors/search-context';
import type { PlatformConnector } from '../../../src/lib/shell/connectors/platform-connector';
import type { CircuitRunLifecycleObserver } from '../../../src/lib/shell/health/circuit-breaker-runner';

const getSettingsMock = vi.hoisted(() => vi.fn());

// ── Mocks ────────────────────────────────────────────────────────────────

vi.mock('../../../src/lib/shell/connectors/index', () => ({
  getConnectors: vi.fn(),
  getConnector: vi.fn(),
}));

vi.mock('../../../src/lib/shell/storage/chrome-storage', () => ({
  getSettings: getSettingsMock,
}));

vi.mock('../../../src/lib/shell/settings-release/settings-release-reader', () => ({
  readSettingsReleaseSnapshot: vi.fn(async () => ({
    settings: await getSettingsMock(),
    onboardingCompleted: true,
    revision: 0,
    generation: 0,
  })),
}));

vi.mock('../../../src/lib/shell/storage/db', () => ({
  getProfile: vi.fn(),
  saveMissions: vi.fn(),
  purgeOldMissions: vi.fn().mockResolvedValue(0),
}));

vi.mock('../../../src/lib/shell/storage/session-storage', () => ({
  setScanState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/lib/core/scoring/dedup', () => ({
  deduplicateMissions: vi.fn((missions: Mission[]) => missions),
  deduplicateMissionsDetailed: vi.fn((missions: Mission[]) => ({
    missions,
    duplicateRelations: [],
  })),
}));

vi.mock('../../../src/lib/core/scoring/relevance', () => ({
  scoreMission: vi.fn(() => ({
    total: 50,
    breakdown: {
      stack: 20,
      location: 10,
      tjm: 12,
      remote: 8,
      seniorityBonus: 0,
      startDateBonus: 0,
    },
  })),
}));

vi.mock('../../../src/lib/shell/utils/connection-monitor', () => ({
  isOnline: vi.fn(() => true),
}));

vi.mock('../../../src/lib/shell/ai/semantic-scorer', () => ({
  scoreMissionsSemantic: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('../../../src/lib/shell/metrics/collector', () => ({
  metricsCollector: {
    recordTiming: vi.fn(),
    recordScanMetrics: vi.fn(),
  },
}));

// Mock withRetry and withResultRetry to just call the function directly (no actual retries in tests)
vi.mock('../../../src/lib/shell/utils/retry-strategy', () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  withResultRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

// Mock CircuitBreakerRunner — simule un circuit fermé qui passe directement au connecteur
vi.mock('../../../src/lib/shell/health/circuit-breaker-runner', () => ({
  runWithCircuitBreaker: vi.fn(
    async (
      connector: { fetchMissions: (n: number, c: unknown, s: unknown) => Promise<unknown> },
      now: number,
      context: unknown,
      signal: unknown
    ) => {
      const result = await connector.fetchMissions(now, context, signal);
      return {
        status: 'executed',
        result,
        snapshot: {
          connectorId: connector.id ?? 'test',
          circuitState: 'closed',
          consecutiveFailures: 0,
          totalFailures: 0,
          totalSuccesses: 1,
          lastSuccessAt: now,
          lastFailureAt: null,
          lastStateChangeAt: now,
          recentLatenciesMs: [100],
        },
      };
    }
  ),
}));

// Mock ProbeScheduler — no-op dans les tests
vi.mock('../../../src/lib/shell/health/probe-scheduler', () => ({
  syncProbeAlarm: vi.fn().mockResolvedValue(undefined),
}));

// Mock chrome.runtime.sendMessage (bridge health notifications, best-effort)
if (typeof chrome === 'undefined') {
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
    },
  });
}

// ── Imports (after mocks) ────────────────────────────────────────────────

import { isScanRunning, runScan, ScanError } from '../../../src/lib/shell/scan/scanner';
import { getConnectors, getConnector } from '../../../src/lib/shell/connectors/index';
import { getSettings } from '../../../src/lib/shell/storage/chrome-storage';
import { getProfile, purgeOldMissions, saveMissions } from '../../../src/lib/shell/storage/db';
import { deduplicateMissionsDetailed } from '../../../src/lib/core/scoring/dedup';
import { isOnline } from '../../../src/lib/shell/utils/connection-monitor';
import { metricsCollector } from '../../../src/lib/shell/metrics/collector';
import { runWithCircuitBreaker } from '../../../src/lib/shell/health/circuit-breaker-runner';

// ── Helpers ──────────────────────────────────────────────────────────────

let missionCounter = 0;

function makeMission(overrides: Partial<Mission> = {}): Mission {
  missionCounter++;
  return {
    id: `mission-${missionCounter}`,
    title: `Mission Test ${missionCounter}`,
    client: 'Client Test',
    description: 'Description de test',
    stack: ['TypeScript', 'Svelte'],
    tjm: 600,
    location: 'Paris',
    remote: 'hybrid',
    duration: '6 mois',
    startDate: null,
    url: `https://example.com/mission-${missionCounter}`,
    source: 'free-work',
    scrapedAt: new Date('2026-03-01'),
    score: null,
    semanticScore: null,
    semanticReason: null,
    ...overrides,
  };
}

function makeConnector(id: string, name: string, missions: Mission[]): PlatformConnector {
  return {
    id,
    name,
    baseUrl: `https://${id}.example.com`,
    icon: `https://${id}.example.com/favicon.ico`,
    detectSession: vi.fn().mockResolvedValue({ ok: true, value: true }),
    fetchMissions: vi.fn().mockResolvedValue({ ok: true, value: missions }),
    getLastSync: vi.fn().mockResolvedValue({ ok: true, value: null }),
  };
}

function makeFailingConnector(id: string, name: string, errorMessage: string): PlatformConnector {
  return {
    id,
    name,
    baseUrl: `https://${id}.example.com`,
    icon: `https://${id}.example.com/favicon.ico`,
    detectSession: vi.fn().mockResolvedValue({ ok: true, value: true }),
    fetchMissions: vi.fn().mockResolvedValue({
      ok: false,
      error: { type: 'CONNECTOR', message: errorMessage, connectorId: id },
    }),
    getLastSync: vi.fn().mockResolvedValue({ ok: true, value: null }),
  };
}

function defaultSettings(enabledConnectors: string[] = ['free-work']) {
  return {
    scanIntervalMinutes: 30,
    enabledConnectors,
    notifications: true,
    autoScan: true,
    maxSemanticPerScan: 10,
    notificationScoreThreshold: 70,
    respectRateLimits: true,
    customDelayMs: 0,
  };
}

// ── Setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  missionCounter = 0;

  // Default: online
  (isOnline as Mock).mockReturnValue(true);

  // Default: no profile
  (getProfile as Mock).mockResolvedValue(null);

  // Default: saveMissions succeeds
  (saveMissions as Mock).mockResolvedValue(undefined);

  // Default: dedup passes through
  (deduplicateMissionsDetailed as Mock).mockImplementation((missions: Mission[]) => ({
    missions,
    duplicateRelations: [],
  }));
});

// ── Tests ────────────────────────────────────────────────────────────────

describe('scanner — runScan', () => {
  // 1. Basic scan flow
  it('returns missions from mocked connectors', async () => {
    const missions = [makeMission(), makeMission()];
    const connector = makeConnector('free-work', 'Free-Work', missions);

    (getSettings as Mock).mockResolvedValue(defaultSettings(['free-work']));
    (getConnector as Mock).mockResolvedValue(connector);
    (getConnectors as Mock).mockResolvedValue([connector]);

    const result = await runScan();

    expect(result.missions).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.missions[0].id).toBe('mission-1');
    expect(result.missions[1].id).toBe('mission-2');
  });

  it('uses the admitted operation connector override instead of global settings', async () => {
    const globalConnector = makeConnector('free-work', 'Free-Work', [makeMission()]);
    const operationConnector = makeConnector('lehibou', 'LeHibou', [
      makeMission({ id: 'operation-scoped-mission', source: 'lehibou' }),
    ]);

    (getSettings as Mock).mockResolvedValue(defaultSettings(['free-work']));
    (getConnector as Mock).mockImplementation(async (connectorId: string) =>
      connectorId === 'lehibou' ? operationConnector : globalConnector
    );
    (getConnectors as Mock).mockResolvedValue([operationConnector]);

    const result = await runScan(undefined, undefined, {
      connectorIdsOverride: ['lehibou'],
    });

    expect(getConnectors).toHaveBeenCalledWith(['lehibou']);
    expect(operationConnector.fetchMissions).toHaveBeenCalledTimes(1);
    expect(globalConnector.fetchMissions).not.toHaveBeenCalled();
    expect(result.missions.map(({ id }) => id)).toEqual(['operation-scoped-mission']);
  });

  it('scores missions with the default profile when no saved profile exists', async () => {
    const missions = [makeMission()];
    const connector = makeConnector('free-work', 'Free-Work', missions);

    (getSettings as Mock).mockResolvedValue(defaultSettings(['free-work']));
    (getConnector as Mock).mockResolvedValue(connector);
    (getConnectors as Mock).mockResolvedValue([connector]);
    (getProfile as Mock).mockResolvedValue(null);

    const result = await runScan();

    expect(result.missions).toHaveLength(1);
    expect(result.missions[0].score).toBe(50);
    expect(result.missions[0].scoreBreakdown).not.toBeNull();
  });

  it('calls onConnectorResult with deterministic filtered and scored missions', async () => {
    const freshMission = makeMission({
      id: 'fresh-freelance',
      title: 'Mission freelance Svelte',
      description: 'Renfort freelance sur produit B2B',
      publishedAt: null,
    });
    const salariedMission = makeMission({
      id: 'salaried-cdi',
      title: 'Développeur Svelte CDI',
      description: 'Poste en CDI',
      publishedAt: null,
    });
    const staleMission = makeMission({
      id: 'stale-freelance',
      title: 'Mission freelance ancienne',
      description: 'Renfort freelance',
      publishedAt: '2020-01-01T00:00:00.000Z',
    });
    const connector = makeConnector('free-work', 'Free-Work', [
      freshMission,
      salariedMission,
      staleMission,
    ]);
    const onConnectorResult = vi.fn();

    (getSettings as Mock).mockResolvedValue(defaultSettings(['free-work']));
    (getConnector as Mock).mockResolvedValue(connector);
    (getConnectors as Mock).mockResolvedValue([connector]);

    await runScan(undefined, undefined, {
      pageDelayMs: 0,
      onConnectorResult,
    });

    expect(onConnectorResult).toHaveBeenCalledTimes(1);
    const partial = onConnectorResult.mock.calls[0][0] as {
      connectorId: string;
      connectorName: string;
      missions: Mission[];
    };
    expect(partial.connectorId).toBe('free-work');
    expect(partial.connectorName).toBe('Free-Work');
    expect(partial.missions).toHaveLength(1);
    expect(partial.missions[0]).toEqual(
      expect.objectContaining({
        id: 'fresh-freelance',
        score: 50,
        scoreBreakdown: expect.objectContaining({ total: 50 }),
      })
    );
  });

  it('emits retry lifecycle events live before the eventual connector success', async () => {
    const missions = [makeMission()];
    const connector = makeConnector('free-work', 'Free-Work', missions);
    const lifecycleEvents: Array<{ type: string; retryable?: boolean }> = [];

    (getSettings as Mock).mockResolvedValue(defaultSettings(['free-work']));
    (getConnector as Mock).mockResolvedValue(connector);
    (getConnectors as Mock).mockResolvedValue([connector]);
    (runWithCircuitBreaker as Mock).mockImplementationOnce(
      async (
        activeConnector: PlatformConnector,
        now: number,
        context?: ConnectorSearchContext,
        signal?: AbortSignal,
        lifecycle?: CircuitRunLifecycleObserver
      ) => {
        const retryableError: AppError = {
          type: 'network',
          message: 'Timeout transitoire',
          recoverable: true,
          retryable: true,
          timestamp: now,
        };
        lifecycle?.onRetryableFailure?.(retryableError, 1);
        lifecycle?.onRetryTimerFired?.(1);
        const result = await activeConnector.fetchMissions(now, context, signal);
        return {
          status: 'executed' as const,
          result,
          snapshot: {
            connectorId: activeConnector.id,
            circuitState: 'closed' as const,
            consecutiveFailures: 0,
            totalFailures: 1,
            totalSuccesses: 1,
            lastSuccessAt: now,
            lastFailureAt: now,
            lastStateChangeAt: now,
            recentLatenciesMs: [100],
          },
        };
      }
    );

    await runScan(undefined, undefined, {
      pageDelayMs: 0,
      onLifecycleEvent: (event) => lifecycleEvents.push(event),
    });

    expect(lifecycleEvents.map((event) => event.type)).toEqual([
      'CONNECTOR_STARTED',
      'CONNECTOR_FAILED',
      'RETRY_TIMER_FIRED',
      'CONNECTOR_STARTED',
      'CONNECTOR_SUCCEEDED',
    ]);
    expect(lifecycleEvents[1]).toEqual(
      expect.objectContaining({ type: 'CONNECTOR_FAILED', retryable: true })
    );
  });

  it('retains the mutex and cancellation until every started connector cleanup settles', async () => {
    const lifecycleEvents: string[] = [];
    let releaseSecondCleanup: (() => void) | undefined;
    let secondObservedAbort = false;
    let observeFirstAbort: (() => void) | undefined;
    const firstAbortObserved = new Promise<void>((resolve) => {
      observeFirstAbort = resolve;
    });
    const firstConnector: PlatformConnector = {
      ...makeConnector('free-work', 'Free-Work', []),
      fetchMissions: vi.fn(
        (_now: number, _context?: ConnectorSearchContext, signal?: AbortSignal) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener(
              'abort',
              () => {
                observeFirstAbort?.();
                reject(new DOMException('First connector aborted.', 'AbortError'));
              },
              { once: true }
            );
          })
      ),
    };
    const secondConnector: PlatformConnector = {
      ...makeConnector('lehibou', 'LeHibou', []),
      fetchMissions: vi.fn(
        (_now: number, _context?: ConnectorSearchContext, signal?: AbortSignal) =>
          new Promise((resolve) => {
            signal?.addEventListener(
              'abort',
              () => {
                secondObservedAbort = true;
              },
              { once: true }
            );
            releaseSecondCleanup = () => resolve({ ok: true, value: [] });
          })
      ),
    };

    (getSettings as Mock)
      .mockResolvedValueOnce(defaultSettings(['free-work', 'lehibou']))
      .mockResolvedValue(defaultSettings([]));
    (getConnector as Mock).mockImplementation(async (id: string) =>
      id === 'free-work' ? firstConnector : secondConnector
    );
    (getConnectors as Mock).mockResolvedValue([firstConnector, secondConnector]);

    const unhandledRejection = vi.fn();
    process.on('unhandledRejection', unhandledRejection);
    const controller = new AbortController();
    let originalSettled = false;
    const scanOutcome = runScan(controller.signal, undefined, {
      pageDelayMs: 0,
      onLifecycleEvent: (event) =>
        lifecycleEvents.push(`${event.type}:${'connectorId' in event ? event.connectorId : '*'}`),
    }).then(
      () => {
        originalSettled = true;
        return 'resolved' as const;
      },
      (error: unknown) => {
        originalSettled = true;
        return error;
      }
    );

    try {
      await vi.waitFor(() => {
        expect(firstConnector.fetchMissions).toHaveBeenCalledTimes(1);
        expect(secondConnector.fetchMissions).toHaveBeenCalledTimes(1);
      });
      controller.abort();
      await firstAbortObserved;
      await new Promise((resolve) => setTimeout(resolve, 0));

      const settledBeforeSecondCleanup = originalSettled;
      const mutexWhileCleaning = await runScan().then(
        () => null,
        (error: unknown) => error
      );

      releaseSecondCleanup?.();
      const originalOutcome = await scanOutcome;
      await Promise.resolve();

      expect(secondObservedAbort).toBe(true);
      expect(settledBeforeSecondCleanup).toBe(false);
      expect(isScanRunning()).toBe(false);
      expect(mutexWhileCleaning).toMatchObject({ code: 'MUTEX' });
      expect(originalOutcome).toMatchObject({ code: 'CANCELLED' });
      expect(lifecycleEvents).not.toContain('CONNECTOR_SUCCEEDED:lehibou');
      expect(unhandledRejection).not.toHaveBeenCalled();
    } finally {
      releaseSecondCleanup?.();
      process.off('unhandledRejection', unhandledRejection);
    }
  });

  it('preserves the first non-cancellation failure when abort arrives during pool cleanup', async () => {
    let rejectFirst: ((error: Error) => void) | undefined;
    let releaseSecond: (() => void) | undefined;
    let observeSecondAbort: (() => void) | undefined;
    const secondAbortObserved = new Promise<void>((resolve) => {
      observeSecondAbort = resolve;
    });
    const firstConnector: PlatformConnector = {
      ...makeConnector('free-work', 'Free-Work', []),
      fetchMissions: vi.fn(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirst = reject;
          })
      ),
    };
    const secondConnector: PlatformConnector = {
      ...makeConnector('lehibou', 'LeHibou', []),
      fetchMissions: vi.fn(
        (_now: number, _context?: ConnectorSearchContext, signal?: AbortSignal) =>
          new Promise((resolve) => {
            signal?.addEventListener('abort', () => observeSecondAbort?.(), { once: true });
            releaseSecond = () => resolve({ ok: true, value: [] });
          })
      ),
    };
    (getSettings as Mock).mockResolvedValue(defaultSettings(['free-work', 'lehibou']));
    (getConnector as Mock).mockImplementation(async (id: string) =>
      id === 'free-work' ? firstConnector : secondConnector
    );
    (getConnectors as Mock).mockResolvedValue([firstConnector, secondConnector]);

    const controller = new AbortController();
    const outcome = runScan(controller.signal).then(
      () => null,
      (error: unknown) => error
    );
    await vi.waitFor(() => {
      expect(firstConnector.fetchMissions).toHaveBeenCalledTimes(1);
      expect(secondConnector.fetchMissions).toHaveBeenCalledTimes(1);
    });
    rejectFirst?.(new Error('primary connector crash'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await secondAbortObserved;
    releaseSecond?.();

    await expect(outcome).resolves.toMatchObject({ message: 'primary connector crash' });
    await expect(outcome).resolves.not.toMatchObject({ code: 'CANCELLED' });
  });

  // 2. Empty connectors
  it('returns empty when no connectors enabled', async () => {
    (getSettings as Mock).mockResolvedValue(defaultSettings([]));

    const result = await runScan();

    expect(result.missions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].connectorId).toBe('*');
  });

  // 3. Connector errors — partial failures
  it('returns missions from working connectors when some fail', async () => {
    const missions = [makeMission({ source: 'free-work' })];
    const goodConnector = makeConnector('free-work', 'Free-Work', missions);
    const badConnector = makeFailingConnector('lehibou', 'LeHibou', 'Auth required');

    (getSettings as Mock).mockResolvedValue(defaultSettings(['free-work', 'lehibou']));
    (getConnector as Mock).mockImplementation(async (id: string) => {
      if (id === 'free-work') {
        return goodConnector;
      }
      if (id === 'lehibou') {
        return badConnector;
      }
      return null;
    });
    (getConnectors as Mock).mockResolvedValue([goodConnector, badConnector]);

    const result = await runScan(undefined, undefined, { pageDelayMs: 0 });

    expect(result.missions).toHaveLength(1);
    expect(result.missions[0].source).toBe('free-work');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].connectorId).toBe('lehibou');
  });

  // 4. All connectors fail
  it('returns no missions and errors when all connectors fail', async () => {
    const bad1 = makeFailingConnector('free-work', 'Free-Work', 'Timeout');
    const bad2 = makeFailingConnector('lehibou', 'LeHibou', 'Network error');

    (getSettings as Mock).mockResolvedValue(defaultSettings(['free-work', 'lehibou']));
    (getConnector as Mock).mockImplementation(async (id: string) => {
      if (id === 'free-work') {
        return bad1;
      }
      if (id === 'lehibou') {
        return bad2;
      }
      return null;
    });
    (getConnectors as Mock).mockResolvedValue([bad1, bad2]);

    const result = await runScan(undefined, undefined, { pageDelayMs: 0 });

    expect(result.missions).toHaveLength(0);
    expect(result.errors).toHaveLength(2);
  });

  // 5. Abort signal
  it('rejects with a typed CANCELLED error when already aborted', async () => {
    const controller = new AbortController();
    const missions = [makeMission()];
    const connector = makeConnector('free-work', 'Free-Work', missions);

    (getSettings as Mock).mockResolvedValue(defaultSettings(['free-work']));
    (getConnector as Mock).mockResolvedValue(connector);
    (getConnectors as Mock).mockResolvedValue([connector]);

    // Abort before scan starts fetching connectors
    controller.abort();

    await expect(runScan(controller.signal)).rejects.toMatchObject({
      name: 'ScanError',
      code: 'CANCELLED',
    });
    expect(saveMissions).not.toHaveBeenCalled();
  });

  it('does not post-process, persist, purge, emit done, or record metrics after cancellation', async () => {
    const controller = new AbortController();
    const missions = [makeMission()];
    const connector = makeConnector('free-work', 'Free-Work', missions);
    const onDetailedProgress = vi.fn(
      (info: { phase: 'connecting' | 'scanning' | 'post-processing' | 'done' }) => {
        if (info.phase === 'post-processing') {
          controller.abort();
        }
      }
    );

    (getSettings as Mock).mockResolvedValue(defaultSettings(['free-work']));
    (getConnector as Mock).mockResolvedValue(connector);
    (getConnectors as Mock).mockResolvedValue([connector]);

    await expect(
      runScan(controller.signal, undefined, { pageDelayMs: 0, onDetailedProgress })
    ).rejects.toMatchObject({ code: 'CANCELLED' });

    expect(deduplicateMissionsDetailed).not.toHaveBeenCalled();
    expect(saveMissions).not.toHaveBeenCalled();
    expect(purgeOldMissions).not.toHaveBeenCalled();
    expect(metricsCollector.recordScanMetrics).not.toHaveBeenCalled();
    expect(onDetailedProgress).not.toHaveBeenCalledWith(expect.objectContaining({ phase: 'done' }));
  });

  // 6. Mutex — concurrent calls
  it('throws ScanError with code MUTEX on concurrent calls', async () => {
    const missions = [makeMission()];
    const connector = makeConnector('free-work', 'Free-Work', missions);

    (getSettings as Mock).mockResolvedValue(defaultSettings(['free-work']));
    (getConnector as Mock).mockResolvedValue(connector);
    (getConnectors as Mock).mockResolvedValue([connector]);

    // Start first scan but don't await yet
    const firstScan = runScan(undefined, undefined, { pageDelayMs: 0 });

    // Second scan should throw MUTEX
    await expect(runScan()).rejects.toThrow(ScanError);
    await expect(runScan()).rejects.toThrow(/déjà en cours/);

    // Wait for first scan to finish to clean up mutex
    await firstScan;

    // After first scan completes, a new scan should work fine
    const thirdScan = await runScan(undefined, undefined, { pageDelayMs: 0 });
    expect(thirdScan.missions).toHaveLength(1);
  });

  // 7. Progress callback
  it('calls onProgress with correct current/total/connectorName', async () => {
    const m1 = [makeMission({ source: 'free-work' })];
    const m2 = [makeMission({ source: 'lehibou' })];
    const c1 = makeConnector('free-work', 'Free-Work', m1);
    const c2 = makeConnector('lehibou', 'LeHibou', m2);

    (getSettings as Mock).mockResolvedValue(defaultSettings(['free-work', 'lehibou']));
    (getConnector as Mock).mockImplementation(async (id: string) => {
      if (id === 'free-work') {
        return c1;
      }
      if (id === 'lehibou') {
        return c2;
      }
      return null;
    });
    (getConnectors as Mock).mockResolvedValue([c1, c2]);

    const progressCalls: Array<{ current: number; total: number; connectorName: string }> = [];
    const onProgress = vi.fn((info) => progressCalls.push(info));

    await runScan(undefined, onProgress, { pageDelayMs: 0 });

    // Should be called for each connector + final call
    expect(onProgress).toHaveBeenCalledTimes(3);

    // First connector: current=0, total=2
    expect(progressCalls[0]).toEqual({ current: 0, total: 2, connectorName: 'Free-Work' });
    // Second connector: current=1, total=2
    expect(progressCalls[1]).toEqual({ current: 1, total: 2, connectorName: 'LeHibou' });
    // Final: current=2, total=2
    expect(progressCalls[2]).toEqual({ current: 2, total: 2, connectorName: '' });
  });

  // 8. Deduplication
  it('deduplicates missions from different connectors', async () => {
    const sharedMission = makeMission({ id: 'dup-1', title: 'Dev React Senior' });
    const uniqueMission = makeMission({ id: 'unique-1', title: 'Dev Vue.js' });

    const c1 = makeConnector('free-work', 'Free-Work', [sharedMission]);
    const c2 = makeConnector('lehibou', 'LeHibou', [
      { ...sharedMission, id: 'dup-2', source: 'lehibou' as const },
      uniqueMission,
    ]);

    (getSettings as Mock).mockResolvedValue(defaultSettings(['free-work', 'lehibou']));
    (getConnector as Mock).mockImplementation(async (id: string) => {
      if (id === 'free-work') {
        return c1;
      }
      if (id === 'lehibou') {
        return c2;
      }
      return null;
    });
    (getConnectors as Mock).mockResolvedValue([c1, c2]);

    // Mock dedup to actually remove duplicates (by title)
    (deduplicateMissionsDetailed as Mock).mockImplementation((missions: Mission[]) => {
      const seen = new Map<string, Mission>();
      const duplicateRelations: {
        canonicalMissionId: string;
        duplicateMissionId: string;
        confidence: number;
        reason: string;
      }[] = [];
      for (const m of missions) {
        if (!seen.has(m.title)) {
          seen.set(m.title, m);
        } else {
          duplicateRelations.push({
            canonicalMissionId: seen.get(m.title)?.id ?? m.id,
            duplicateMissionId: m.id,
            confidence: 1,
            reason: 'test_duplicate_title',
          });
        }
      }
      return { missions: [...seen.values()], duplicateRelations };
    });

    const result = await runScan(undefined, undefined, { pageDelayMs: 0 });

    // deduplicateMissionsDetailed was called with all 3 missions
    expect(deduplicateMissionsDetailed).toHaveBeenCalledTimes(1);
    const dedupArg = (deduplicateMissionsDetailed as Mock).mock.calls[0][0] as Mission[];
    expect(dedupArg).toHaveLength(3);

    // Result should have 2 unique missions (after dedup by title)
    expect(result.missions).toHaveLength(2);
    expect(result.duplicateRelations).toEqual([
      {
        canonicalMissionId: 'dup-1',
        duplicateMissionId: 'dup-2',
        confidence: 1,
        reason: 'test_duplicate_title',
      },
    ]);
  });

  // 9. Offline check
  it('throws ScanError with code OFFLINE when navigator is offline', async () => {
    (isOnline as Mock).mockReturnValue(false);
    (getSettings as Mock).mockResolvedValue(defaultSettings(['free-work']));

    try {
      await runScan();
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ScanError);
      expect((error as ScanError).code).toBe('OFFLINE');
    }
  });

  // Additional: unknown connector IDs are reported as errors
  it('reports unknown connector IDs as errors', async () => {
    const missions = [makeMission()];
    const connector = makeConnector('free-work', 'Free-Work', missions);

    (getSettings as Mock).mockResolvedValue(defaultSettings(['free-work', 'unknown-connector']));
    (getConnector as Mock).mockImplementation(async (id: string) => {
      if (id === 'free-work') {
        return connector;
      }
      return null;
    });
    (getConnectors as Mock).mockResolvedValue([connector]);

    const result = await runScan(undefined, undefined, { pageDelayMs: 0 });

    expect(result.missions).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].connectorId).toBe('unknown-connector');
    expect(result.errors[0].message).toContain('introuvable');
  });

  // Canonical persistence belongs to the service-worker persisting state.
  it('returns scored missions without persisting inside the scanner', async () => {
    const missions = [makeMission()];
    const connector = makeConnector('free-work', 'Free-Work', missions);

    (getSettings as Mock).mockResolvedValue(defaultSettings(['free-work']));
    (getConnector as Mock).mockResolvedValue(connector);
    (getConnectors as Mock).mockResolvedValue([connector]);

    const result = await runScan(undefined, undefined, { pageDelayMs: 0 });

    expect(result.missions).toHaveLength(1);
    expect(saveMissions).not.toHaveBeenCalled();
  });
});
