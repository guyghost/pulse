import { describe, expect, it } from 'vitest';
import {
  buildScanRunSummaries,
  getWeekStart,
  mergeScanRunRecords,
  type ScanRunRecord,
} from '../../../src/lib/core/scan/scan-runs-presentation';
import type {
  ConnectorStatus,
  PersistedConnectorStatus,
} from '../../../src/lib/core/types/connector-status';

// Reference week: Monday September 7 2026 → Sunday September 13 2026 (local).
const NOW = new Date(2026, 8, 10, 14, 30).getTime(); // jeudi 10 sept. 14:30
const WEEK_START = new Date(2026, 8, 7, 0, 0, 0, 0).getTime(); // lundi 7 sept. 00:00
const TUE = new Date(2026, 8, 8, 9, 0).getTime();
const THU = new Date(2026, 8, 10, 9, 0).getTime();
const THU_LATER = new Date(2026, 8, 10, 11, 15).getTime();

function record(overrides: Partial<ScanRunRecord> & { connectorId: string }): ScanRunRecord {
  return {
    connectorName: overrides.connectorId,
    state: 'done',
    missionsCount: 5,
    startedAt: null,
    lastSyncAt: THU,
    ...overrides,
  };
}

function liveStatus(
  overrides: Partial<ConnectorStatus> & { connectorId: string }
): ConnectorStatus {
  return {
    connectorName: overrides.connectorId,
    state: 'fetching',
    missionsCount: 0,
    error: null,
    retryCount: 0,
    startedAt: THU,
    completedAt: null,
    ...overrides,
  };
}

function persistedStatus(
  overrides: Partial<PersistedConnectorStatus> & { connectorId: string }
): PersistedConnectorStatus {
  return {
    connectorName: overrides.connectorId,
    lastState: 'done',
    missionsCount: 3,
    error: null,
    lastSyncAt: TUE,
    lastSuccessAt: TUE,
    ...overrides,
  };
}

describe('getWeekStart', () => {
  it('returns Monday 00:00 local for a weekday timestamp (default weekStartsOn: 1)', () => {
    expect(getWeekStart(NOW)).toBe(WEEK_START);
  });

  it('maps a Sunday to the Monday that started its week', () => {
    const sunday = new Date(2026, 8, 13, 23, 59).getTime();
    expect(getWeekStart(sunday)).toBe(WEEK_START);
  });

  it('returns the same Monday for the Monday itself', () => {
    const mondayNoon = new Date(2026, 8, 7, 12, 0).getTime();
    expect(getWeekStart(mondayNoon)).toBe(WEEK_START);
  });

  it('supports a Sunday-based week (weekStartsOn: 0)', () => {
    const sundayStart = new Date(2026, 8, 6, 0, 0, 0, 0).getTime();
    expect(getWeekStart(NOW, 0)).toBe(sundayStart);
  });

  it('is pure: same input, same output', () => {
    expect(getWeekStart(NOW)).toBe(getWeekStart(NOW));
  });
});

describe('mergeScanRunRecords', () => {
  it('lets the live status win over the persisted one', () => {
    const merged = mergeScanRunRecords(
      [liveStatus({ connectorId: 'freework', state: 'fetching', missionsCount: 7 })],
      [persistedStatus({ connectorId: 'freework' })]
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      connectorId: 'freework',
      state: 'fetching',
      missionsCount: 7,
    });
  });

  it('falls back lastSyncAt to the persisted one when the live has none (pending)', () => {
    const merged = mergeScanRunRecords(
      [
        liveStatus({
          connectorId: 'freework',
          state: 'pending',
          startedAt: null,
          completedAt: null,
        }),
      ],
      [persistedStatus({ connectorId: 'freework' })]
    );

    expect(merged[0]).toMatchObject({ state: 'pending', startedAt: null, lastSyncAt: TUE });
  });

  it('uses the live completedAt as lastSyncAt for a done run', () => {
    const merged = mergeScanRunRecords(
      [liveStatus({ connectorId: 'freework', state: 'done', completedAt: THU_LATER })],
      [persistedStatus({ connectorId: 'freework' })]
    );

    expect(merged[0]).toMatchObject({ state: 'done', lastSyncAt: THU_LATER });
  });

  it('keeps persisted-only connectors and union-merges both sets', () => {
    const merged = mergeScanRunRecords(
      [liveStatus({ connectorId: 'freework' })],
      [
        persistedStatus({ connectorId: 'freework' }),
        persistedStatus({ connectorId: 'lejdd', lastState: 'error' }),
      ]
    );

    expect(merged.map((r) => r.connectorId).sort()).toEqual(['freework', 'lejdd']);
    expect(merged.find((r) => r.connectorId === 'lejdd')).toMatchObject({
      state: 'error',
      lastSyncAt: TUE,
    });
  });

  it('treats non-finite persisted timestamps as absent', () => {
    const merged = mergeScanRunRecords(
      [],
      [persistedStatus({ connectorId: 'freework', lastSyncAt: Number.NaN })]
    );

    expect(merged[0].lastSyncAt).toBeNull();
  });
});

describe('buildScanRunSummaries', () => {
  it('projects a done run with full progress, recent runAt and tone done', () => {
    const [item] = buildScanRunSummaries([record({ connectorId: 'freework' })], WEEK_START, NOW);

    expect(item).toMatchObject({
      connectorId: 'freework',
      name: 'freework',
      state: 'done',
      missionsCount: 5,
      tone: 'done',
      progress: 1,
      runAt: THU,
    });
  });

  it('maps every connector state to the documented tone/progress pair', () => {
    const states = [
      { state: 'done' as const, tone: 'done', progress: 1 },
      { state: 'fetching' as const, tone: 'active', progress: 0.5 },
      { state: 'retrying' as const, tone: 'active', progress: 0.5 },
      { state: 'detecting' as const, tone: 'active', progress: 0.25 },
      { state: 'pending' as const, tone: 'waiting', progress: 0 },
      { state: 'error' as const, tone: 'attention', progress: 0 },
    ];

    const items = buildScanRunSummaries(
      states.map((s, i) =>
        record({
          connectorId: `c${i}`,
          state: s.state,
          startedAt: THU,
          lastSyncAt: s.state === 'done' || s.state === 'error' ? THU : null,
        })
      ),
      WEEK_START,
      NOW
    );

    for (const expected of states) {
      const item = items.find((i) => i.state === expected.state);
      expect(item?.tone).toBe(expected.tone);
      expect(item?.progress).toBe(expected.progress);
    }
  });

  it('sorts active first, then error, then done by recency, then waiting', () => {
    const items = buildScanRunSummaries(
      [
        record({ connectorId: 'old-done', lastSyncAt: TUE }),
        record({ connectorId: 'broken', state: 'error', lastSyncAt: THU_LATER }),
        record({ connectorId: 'queued', state: 'pending', startedAt: null, lastSyncAt: THU }),
        record({ connectorId: 'fresh-done', lastSyncAt: THU_LATER }),
        record({ connectorId: 'running', state: 'fetching', startedAt: THU, lastSyncAt: null }),
      ],
      WEEK_START,
      NOW
    );

    expect(items.map((i) => i.connectorId)).toEqual([
      'running',
      'broken',
      'fresh-done',
      'old-done',
      'queued',
    ]);
  });

  it('breaks ties deterministically by connectorId', () => {
    const items = buildScanRunSummaries(
      [
        record({ connectorId: 'bbb', lastSyncAt: THU }),
        record({ connectorId: 'aaa', lastSyncAt: THU }),
        record({ connectorId: 'ccc', state: 'fetching', startedAt: THU, lastSyncAt: null }),
        record({ connectorId: 'abb', state: 'fetching', startedAt: THU, lastSyncAt: null }),
      ],
      WEEK_START,
      NOW
    );

    expect(items.map((i) => i.connectorId)).toEqual(['abb', 'ccc', 'aaa', 'bbb']);
  });

  it('excludes runs before the week start', () => {
    const lastWeek = new Date(2026, 7, 28, 9, 0).getTime();
    const items = buildScanRunSummaries(
      [record({ connectorId: 'freework', lastSyncAt: lastWeek })],
      WEEK_START,
      NOW
    );

    expect(items).toEqual([]);
  });

  it('excludes runs in the future (never projects beyond now)', () => {
    const tomorrow = NOW + 24 * 60 * 60 * 1000;
    const items = buildScanRunSummaries(
      [record({ connectorId: 'freework', lastSyncAt: tomorrow })],
      WEEK_START,
      NOW
    );

    expect(items).toEqual([]);
  });

  it('includes records exactly at the week boundaries (inclusive bounds)', () => {
    const atStart = record({ connectorId: 'at-start', lastSyncAt: WEEK_START });
    const atNow = record({ connectorId: 'at-now', lastSyncAt: NOW });
    const items = buildScanRunSummaries([atStart, atNow], WEEK_START, NOW);

    expect(items.map((i) => i.connectorId)).toEqual(['at-now', 'at-start']);
  });

  it('excludes records without any datable timestamp', () => {
    const items = buildScanRunSummaries(
      [record({ connectorId: 'ghost', state: 'pending', startedAt: null, lastSyncAt: null })],
      WEEK_START,
      NOW
    );

    expect(items).toEqual([]);
  });

  it('resolves runAt from startedAt for active runs', () => {
    const [item] = buildScanRunSummaries(
      [record({ connectorId: 'freework', state: 'retrying', startedAt: THU, lastSyncAt: TUE })],
      WEEK_START,
      NOW
    );

    expect(item?.runAt).toBe(THU);
  });

  it('resolves runAt from lastSyncAt (completion) for terminal runs', () => {
    const [item] = buildScanRunSummaries(
      [record({ connectorId: 'freework', state: 'done', lastSyncAt: THU_LATER })],
      WEEK_START,
      NOW
    );

    expect(item?.runAt).toBe(THU_LATER);
  });

  it('clamps negative or non-finite missionsCount to 0', () => {
    const items = buildScanRunSummaries(
      [
        record({ connectorId: 'a', missionsCount: -4 }),
        record({ connectorId: 'b', missionsCount: Number.NaN }),
      ],
      WEEK_START,
      NOW
    );

    expect(items.map((i) => i.missionsCount)).toEqual([0, 0]);
  });

  it('returns an empty list for empty input', () => {
    expect(buildScanRunSummaries([], WEEK_START, NOW)).toEqual([]);
  });

  it('is deterministic for identical inputs', () => {
    const records = [
      record({ connectorId: 'freework' }),
      record({ connectorId: 'lejdd', lastSyncAt: TUE }),
    ];
    const first = buildScanRunSummaries(records, WEEK_START, NOW);
    const second = buildScanRunSummaries(records, WEEK_START, NOW);

    expect(first).toEqual(second);
  });
});
