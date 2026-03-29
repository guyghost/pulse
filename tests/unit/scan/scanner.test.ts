import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { PlatformConnector } from '../../../src/lib/shell/connectors/platform-connector';

// ── Mocks ────────────────────────────────────────────────────────────────

vi.mock('../../../src/lib/shell/connectors/index', () => ({
  getConnectors: vi.fn(),
  getConnector: vi.fn(),
}));

vi.mock('../../../src/lib/shell/storage/chrome-storage', () => ({
  getSettings: vi.fn(),
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
}));

vi.mock('../../../src/lib/core/scoring/relevance', () => ({
  scoreMission: vi.fn(() => 50),
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

// ── Imports (after mocks) ────────────────────────────────────────────────

import { runScan, ScanError } from '../../../src/lib/shell/scan/scanner';
import { getConnectors, getConnector } from '../../../src/lib/shell/connectors/index';
import { getSettings } from '../../../src/lib/shell/storage/chrome-storage';
import { getProfile, saveMissions } from '../../../src/lib/shell/storage/db';
import { deduplicateMissions } from '../../../src/lib/core/scoring/dedup';
import { isOnline } from '../../../src/lib/shell/utils/connection-monitor';

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
  (deduplicateMissions as Mock).mockImplementation((m: Mission[]) => m);
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
      if (id === 'free-work') return goodConnector;
      if (id === 'lehibou') return badConnector;
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
      if (id === 'free-work') return bad1;
      if (id === 'lehibou') return bad2;
      return null;
    });
    (getConnectors as Mock).mockResolvedValue([bad1, bad2]);

    const result = await runScan(undefined, undefined, { pageDelayMs: 0 });

    expect(result.missions).toHaveLength(0);
    expect(result.errors).toHaveLength(2);
  });

  // 5. Abort signal
  it('stops scan when abort signal is triggered', async () => {
    const controller = new AbortController();
    const missions = [makeMission()];
    const connector = makeConnector('free-work', 'Free-Work', missions);

    (getSettings as Mock).mockResolvedValue(defaultSettings(['free-work']));
    (getConnector as Mock).mockResolvedValue(connector);
    (getConnectors as Mock).mockResolvedValue([connector]);

    // Abort before scan starts fetching connectors
    controller.abort();

    const result = await runScan(controller.signal);

    // Aborted scan returns empty missions
    expect(result.missions).toHaveLength(0);
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
      if (id === 'free-work') return c1;
      if (id === 'lehibou') return c2;
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
      if (id === 'free-work') return c1;
      if (id === 'lehibou') return c2;
      return null;
    });
    (getConnectors as Mock).mockResolvedValue([c1, c2]);

    // Mock dedup to actually remove duplicates (by title)
    (deduplicateMissions as Mock).mockImplementation((missions: Mission[]) => {
      const seen = new Map<string, Mission>();
      for (const m of missions) {
        if (!seen.has(m.title)) {
          seen.set(m.title, m);
        }
      }
      return [...seen.values()];
    });

    const result = await runScan(undefined, undefined, { pageDelayMs: 0 });

    // deduplicateMissions was called with all 3 missions
    expect(deduplicateMissions).toHaveBeenCalledTimes(1);
    const dedupArg = (deduplicateMissions as Mock).mock.calls[0][0] as Mission[];
    expect(dedupArg).toHaveLength(3);

    // Result should have 2 unique missions (after dedup by title)
    expect(result.missions).toHaveLength(2);
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
      if (id === 'free-work') return connector;
      return null;
    });
    (getConnectors as Mock).mockResolvedValue([connector]);

    const result = await runScan(undefined, undefined, { pageDelayMs: 0 });

    expect(result.missions).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].connectorId).toBe('unknown-connector');
    expect(result.errors[0].message).toContain('introuvable');
  });

  // Additional: missions are persisted via saveMissions
  it('persists scored missions via saveMissions', async () => {
    const missions = [makeMission()];
    const connector = makeConnector('free-work', 'Free-Work', missions);

    (getSettings as Mock).mockResolvedValue(defaultSettings(['free-work']));
    (getConnector as Mock).mockResolvedValue(connector);
    (getConnectors as Mock).mockResolvedValue([connector]);

    await runScan(undefined, undefined, { pageDelayMs: 0 });

    expect(saveMissions).toHaveBeenCalledTimes(1);
    expect((saveMissions as Mock).mock.calls[0][0]).toHaveLength(1);
  });
});
