import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

// ── Minimal chrome.storage.local mock (in-memory) ─────────────────────────
// tests/unit/setup.ts does not mock chrome.storage, so we provide a minimal
// in-memory implementation scoped to this file. This does not affect other
// test files because each file gets its own module registry / globals state.

type Store = Record<string, unknown>;

const createChromeMock = () => {
  const store: Store = {};
  return {
    store,
    storage: {
      local: {
        get: vi.fn(async (key: string) => {
          if (typeof key === 'string') {
            return key in store ? { [key]: store[key] } : {};
          }
          return { ...store };
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        }),
      },
    },
  };
};

// ── Imports ───────────────────────────────────────────────────────────────

import {
  trackParserHealth,
  resetParserHealth,
  getAllParserHealth,
} from '../../../src/lib/shell/scan/parser-health';

const HEALTH_KEY = 'parser_health';

describe('parser-health (Shell)', () => {
  let chromeMock: ReturnType<typeof createChromeMock>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    chromeMock = createChromeMock();
    // Stub the global chrome object with our in-memory mock
    vi.stubGlobal('chrome', chromeMock);
    // Silence dev-only console.warn while allowing assertions
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  // ── trackParserHealth ───────────────────────────────────────────────────

  describe('trackParserHealth', () => {
    it('loads from storage, delegates, saves, and returns status', async () => {
      const status = await trackParserHealth('free-work', 0, 1_700_000_000_000);

      // Storage was read with the canonical key
      expect(chromeMock.storage.local.get).toHaveBeenCalledWith(HEALTH_KEY);
      // Storage was written with the canonical key
      expect(chromeMock.storage.local.set).toHaveBeenCalledTimes(1);
      const setArg = (chromeMock.storage.local.set as Mock).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(setArg).toHaveProperty(HEALTH_KEY);

      // Status reflects the (first-run) non-suspicious evaluation
      expect(status).toEqual({
        connectorId: 'free-work',
        missionCount: 0,
        previousCount: 0,
        isSuspicious: false,
      });
    });

    it('round-trips: a second call sees the record persisted by the first', async () => {
      const NOW = 1_700_000_000_000;

      // First call: connector had 5 missions
      await trackParserHealth('free-work', 5, NOW);

      // Second call: connector now returns 0 — should be suspicious
      const status = await trackParserHealth('free-work', 0, NOW + 1000);

      expect(status.previousCount).toBe(5);
      expect(status.missionCount).toBe(0);
      expect(status.isSuspicious).toBe(true);
      expect(status.warning).toContain('free-work');
      expect(status.warning).toContain('5');
    });

    it('persists the record with consecutiveZeros in storage', async () => {
      const NOW = 1_700_000_000_000;
      await trackParserHealth('lehibou', 0, NOW);

      const records = await getAllParserHealth();
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        connectorId: 'lehibou',
        lastMissionCount: 0,
        consecutiveZeros: 1,
      });
    });

    it('emits a dev console.warn when a suspicious pattern is detected', async () => {
      // Seed a successful record first
      await trackParserHealth('free-work', 10, 1_700_000_000_000);
      warnSpy.mockClear();

      // Now return 0 → suspicious
      await trackParserHealth('free-work', 0, 1_700_000_000_001);

      expect(warnSpy).toHaveBeenCalled();
      const firstCallArg = warnSpy.mock.calls[0][0] as string;
      expect(firstCallArg).toContain('[ParserHealth]');
      expect(firstCallArg).toContain('Parser anomaly');
    });

    it('emits a dev console.warn when consecutiveZeros reaches the threshold', async () => {
      const NOW = 1_700_000_000_000;
      // Seed a prior success so previousCount > 0
      await trackParserHealth('free-work', 4, NOW);

      // Feed 5 consecutive zeros
      warnSpy.mockClear();
      for (let i = 1; i <= 5; i++) {
        await trackParserHealth('free-work', 0, NOW + i);
      }

      // The broken-parser warning should have fired at least once (on the 5th)
      const brokenWarnings = warnSpy.mock.calls
        .map((c) => c[0] as string)
        .filter((s) => s.includes('consecutive scans'));
      expect(brokenWarnings.length).toBeGreaterThan(0);
    });

    it('still returns status when saveHealthRecords rejects (error tolerance)', async () => {
      // Force the underlying set to reject
      (chromeMock.storage.local.set as Mock).mockRejectedValueOnce(new Error('storage full'));

      // Should NOT throw — the save is fire-and-forget with .catch()
      const status = await trackParserHealth('free-work', 3, 1_700_000_000_000);

      expect(status.connectorId).toBe('free-work');
      expect(status.missionCount).toBe(3);
      expect(status.isSuspicious).toBe(false);
    });
  });

  // ── resetParserHealth ───────────────────────────────────────────────────

  describe('resetParserHealth', () => {
    it('deletes the connector record and saves', async () => {
      // Seed
      await trackParserHealth('free-work', 5, 1_700_000_000_000);
      expect(await getAllParserHealth()).toHaveLength(1);

      await resetParserHealth('free-work');

      // Storage was written (save after delete)
      expect(chromeMock.storage.local.set).toHaveBeenCalled();
      // Record is gone
      expect(await getAllParserHealth()).toHaveLength(0);
    });

    it('is a no-op save when the connector was never tracked', async () => {
      await resetParserHealth('never-tracked');
      // Still saves the (empty) map back
      expect(chromeMock.storage.local.set).toHaveBeenCalledTimes(1);
      expect(await getAllParserHealth()).toHaveLength(0);
    });
  });

  // ── getAllParserHealth ─────────────────────────────────────────────────

  describe('getAllParserHealth', () => {
    it('returns an empty array when no records exist', async () => {
      const records = await getAllParserHealth();
      expect(records).toEqual([]);
    });

    it('returns all tracked connectors', async () => {
      await trackParserHealth('free-work', 5, 1_700_000_000_000);
      await trackParserHealth('lehibou', 3, 1_700_000_000_001);

      const records = await getAllParserHealth();
      expect(records).toHaveLength(2);
      const ids = records.map((r) => r.connectorId).sort();
      expect(ids).toEqual(['free-work', 'lehibou']);
    });
  });
});
