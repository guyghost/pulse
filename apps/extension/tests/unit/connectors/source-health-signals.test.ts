import { describe, it, expect } from 'vitest';
import {
  computeSourceHealthSignals,
  computeScoreStats,
  buildDedupStatsUpdate,
  DUPLICATES_WARN_RATE,
  DUPLICATES_ALERT_RATE,
  OFFTARGET_WARN_RATE,
  OFFTARGET_ALERT_RATE,
  STALE_SOURCE_THRESHOLD_MS,
  SCORE_OUT_OF_TARGET,
  type DedupStats,
  type ScoreStats,
  type SourceHealthSignal,
  type ConnectorHealthRecordInput,
} from '../../../src/lib/core/connectors/source-health-signals';
import type { PersistedConnectorStatus } from '../../../src/lib/core/types/connector-status';
import type { Mission } from '../../../src/lib/core/types/mission';

const NOW = new Date(1_700_000_000_000);
const NOW_MONTH_KEY = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`;
const DAY = 24 * 60 * 60 * 1000;

function makeRecord(
  overrides: Partial<ConnectorHealthRecordInput> = {}
): ConnectorHealthRecordInput {
  return {
    connectorId: 'free-work',
    lastSuccessAt: NOW.getTime(),
    consecutiveZeros: 0,
    ...overrides,
  };
}

function makeStatus(overrides: Partial<PersistedConnectorStatus> = {}): PersistedConnectorStatus {
  return {
    connectorId: 'free-work',
    connectorName: 'Free-Work',
    lastState: 'done',
    missionsCount: 3,
    error: null,
    lastSyncAt: NOW.getTime(),
    lastSuccessAt: NOW.getTime(),
    ...overrides,
  };
}

function makeDedupStats(overrides: Partial<DedupStats> = {}): DedupStats {
  return {
    lastScanAt: NOW.getTime(),
    rawCount: 100,
    mergedCount: 0,
    monthKey: NOW_MONTH_KEY,
    monthMergedCount: 0,
    ...overrides,
  };
}

function makeScoreStats(overrides: Partial<ScoreStats> = {}): ScoreStats {
  return {
    totalScored: 50,
    outOfTarget: 0,
    connectorCount: 2,
    ...overrides,
  };
}

function makeMission(fields: { score: number | null; source: Mission['source'] }): Mission {
  return {
    id: `m-${fields.source}-${fields.score}`,
    title: 'Mission',
    client: null,
    description: '',
    stack: [],
    tjm: null,
    location: null,
    remote: null,
    duration: null,
    startDate: null,
    publishedAt: null,
    url: `https://example.test/${fields.source}/${fields.score}`,
    source: fields.source,
    scoreBreakdown: null,
    score: fields.score,
    semanticScore: null,
    semanticReason: null,
    seniority: null,
  };
}

function byId(signals: SourceHealthSignal[]): Map<string, SourceHealthSignal> {
  return new Map(signals.map((signal) => [signal.id, signal]));
}

describe('computeSourceHealthSignals (Core)', () => {
  // ── Empty / inactive cases ─────────────────────────────────────────────

  it('returns no signals when there is no active connector', () => {
    const result = computeSourceHealthSignals(
      {
        healthRecords: [],
        persistedStatuses: [],
        dedupStats: makeDedupStats({ mergedCount: 50 }),
        scoreStats: makeScoreStats({ outOfTarget: 50 }),
      },
      NOW
    );

    expect(result.signals).toEqual([]);
    expect(result.activeConnectorCount).toBe(0);
  });

  it('counts active connectors as the union of records and statuses', () => {
    const result = computeSourceHealthSignals(
      {
        healthRecords: [makeRecord({ connectorId: 'free-work' })],
        persistedStatuses: [
          makeStatus({ connectorId: 'free-work' }),
          makeStatus({ connectorId: 'malt', connectorName: 'Malt' }),
        ],
        dedupStats: null,
        scoreStats: null,
      },
      NOW
    );

    expect(result.activeConnectorCount).toBe(2);
    expect(result.signals.length).toBe(4);
  });

  // ── Duplicates signal ──────────────────────────────────────────────────

  it('is ok when the merge rate is below the warn threshold', () => {
    const result = computeSourceHealthSignals(
      {
        healthRecords: [makeRecord()],
        persistedStatuses: [],
        dedupStats: makeDedupStats({ rawCount: 100, mergedCount: DUPLICATES_WARN_RATE - 1 }),
        scoreStats: null,
      },
      NOW
    );
    expect(byId(result.signals).get('duplicates')?.severity).toBe('ok');
  });

  it('is warn at exactly the warn threshold and alert at the alert threshold', () => {
    const warn = computeSourceHealthSignals(
      {
        healthRecords: [makeRecord()],
        persistedStatuses: [],
        dedupStats: makeDedupStats({ rawCount: 100, mergedCount: DUPLICATES_WARN_RATE }),
        scoreStats: null,
      },
      NOW
    );
    expect(byId(warn.signals).get('duplicates')?.severity).toBe('warn');

    const alert = computeSourceHealthSignals(
      {
        healthRecords: [makeRecord()],
        persistedStatuses: [],
        dedupStats: makeDedupStats({ rawCount: 100, mergedCount: DUPLICATES_ALERT_RATE }),
        scoreStats: null,
      },
      NOW
    );
    expect(byId(alert.signals).get('duplicates')?.severity).toBe('alert');
  });

  it('formats the monthly merged detail with pluralisation', () => {
    const result = computeSourceHealthSignals(
      {
        healthRecords: [makeRecord()],
        persistedStatuses: [],
        dedupStats: makeDedupStats({ rawCount: 100, mergedCount: 3, monthMergedCount: 1 }),
        scoreStats: null,
      },
      NOW
    );
    expect(byId(result.signals).get('duplicates')?.detail).toBe('1 fusionnée ce mois');
  });

  it('treats missing dedup stats as a clean duplicates signal', () => {
    const result = computeSourceHealthSignals(
      {
        healthRecords: [makeRecord()],
        persistedStatuses: [],
        dedupStats: null,
        scoreStats: null,
      },
      NOW
    );
    const duplicates = byId(result.signals).get('duplicates');
    expect(duplicates?.value).toBe(0);
    expect(duplicates?.severity).toBe('ok');
  });

  // ── Parsers signal ─────────────────────────────────────────────────────

  it('is ok when no connector has consecutive zeros', () => {
    const result = computeSourceHealthSignals(
      {
        healthRecords: [makeRecord({ consecutiveZeros: 0 })],
        persistedStatuses: [],
        dedupStats: null,
        scoreStats: null,
      },
      NOW
    );
    const parsers = byId(result.signals).get('parsers');
    expect(parsers?.value).toBe(0);
    expect(parsers?.severity).toBe('ok');
    expect(parsers?.ratio).toBe(0);
  });

  it('is warn with suspects below the broken threshold', () => {
    const result = computeSourceHealthSignals(
      {
        healthRecords: [makeRecord({ consecutiveZeros: 1 })],
        persistedStatuses: [],
        dedupStats: null,
        scoreStats: null,
      },
      NOW
    );
    const parsers = byId(result.signals).get('parsers');
    expect(parsers?.value).toBe(1);
    expect(parsers?.severity).toBe('warn');
  });

  it('is alert when the max consecutive zeros reaches the broken threshold', () => {
    const result = computeSourceHealthSignals(
      {
        healthRecords: [
          makeRecord({ connectorId: 'free-work', consecutiveZeros: 5 }),
          makeRecord({ connectorId: 'malt', consecutiveZeros: 1 }),
        ],
        persistedStatuses: [],
        dedupStats: null,
        scoreStats: null,
      },
      NOW
    );
    const parsers = byId(result.signals).get('parsers');
    expect(parsers?.value).toBe(2);
    expect(parsers?.severity).toBe('alert');
    expect(parsers?.ratio).toBe(1);
  });

  it('caps the parsers ratio at 1 when zeros exceed the threshold', () => {
    const result = computeSourceHealthSignals(
      {
        healthRecords: [makeRecord({ consecutiveZeros: 99 })],
        persistedStatuses: [],
        dedupStats: null,
        scoreStats: null,
      },
      NOW
    );
    expect(byId(result.signals).get('parsers')?.ratio).toBe(1);
  });

  // ── Stale signal ───────────────────────────────────────────────────────

  it('is ok when every source succeeded within the stale threshold', () => {
    const result = computeSourceHealthSignals(
      {
        healthRecords: [makeRecord({ lastSuccessAt: NOW.getTime() - STALE_SOURCE_THRESHOLD_MS })],
        persistedStatuses: [],
        dedupStats: null,
        scoreStats: null,
      },
      NOW
    );
    const stale = byId(result.signals).get('stale');
    expect(stale?.value).toBe(0);
    expect(stale?.severity).toBe('ok');
    expect(stale?.detail).toBe('Dernier succès < 48h');
  });

  it('is warn with one stale source and reports the delay in days', () => {
    const result = computeSourceHealthSignals(
      {
        healthRecords: [makeRecord({ lastSuccessAt: NOW.getTime() - 3 * DAY })],
        persistedStatuses: [],
        dedupStats: null,
        scoreStats: null,
      },
      NOW
    );
    const stale = byId(result.signals).get('stale');
    expect(stale?.value).toBe(1);
    expect(stale?.severity).toBe('warn');
    expect(stale?.detail).toBe('Dernier succès il y a 3j');
    expect(stale?.ratio).toBe(1);
  });

  it('is alert with two or more stale sources', () => {
    const result = computeSourceHealthSignals(
      {
        healthRecords: [
          makeRecord({ connectorId: 'free-work', lastSuccessAt: NOW.getTime() - 3 * DAY }),
          makeRecord({ connectorId: 'malt', lastSuccessAt: NOW.getTime() - 5 * DAY }),
        ],
        persistedStatuses: [],
        dedupStats: null,
        scoreStats: null,
      },
      NOW
    );
    expect(byId(result.signals).get('stale')?.severity).toBe('alert');
  });

  it('falls back to persisted statuses when the health record is missing', () => {
    const result = computeSourceHealthSignals(
      {
        healthRecords: [],
        persistedStatuses: [makeStatus({ lastSuccessAt: NOW.getTime() - 3 * DAY })],
        dedupStats: null,
        scoreStats: null,
      },
      NOW
    );
    expect(byId(result.signals).get('stale')?.value).toBe(1);
  });

  it('reports a never-succeeded source and mentions it in the detail', () => {
    const result = computeSourceHealthSignals(
      {
        healthRecords: [makeRecord({ lastSuccessAt: null })],
        persistedStatuses: [],
        dedupStats: null,
        scoreStats: null,
      },
      NOW
    );
    const stale = byId(result.signals).get('stale');
    expect(stale?.value).toBe(1);
    expect(stale?.detail).toBe('Dernier succès : jamais');
  });

  it('mixes never-succeeded and delayed sources in the detail', () => {
    const result = computeSourceHealthSignals(
      {
        healthRecords: [
          makeRecord({ connectorId: 'free-work', lastSuccessAt: null }),
          makeRecord({ connectorId: 'malt', lastSuccessAt: NOW.getTime() - 4 * DAY }),
        ],
        persistedStatuses: [],
        dedupStats: null,
        scoreStats: null,
      },
      NOW
    );
    expect(byId(result.signals).get('stale')?.detail).toBe('Dernier succès : jamais · il y a 4j');
  });

  // ── Off-target signal ──────────────────────────────────────────────────

  it('is ok below the off-target warn rate', () => {
    const result = computeSourceHealthSignals(
      {
        healthRecords: [makeRecord()],
        persistedStatuses: [],
        dedupStats: null,
        scoreStats: makeScoreStats({ totalScored: 100, outOfTarget: OFFTARGET_WARN_RATE - 1 }),
      },
      NOW
    );
    expect(byId(result.signals).get('offtarget')?.severity).toBe('ok');
  });

  it('is warn at the warn rate and alert at the alert rate', () => {
    const warn = computeSourceHealthSignals(
      {
        healthRecords: [makeRecord()],
        persistedStatuses: [],
        dedupStats: null,
        scoreStats: makeScoreStats({ totalScored: 100, outOfTarget: OFFTARGET_WARN_RATE }),
      },
      NOW
    );
    expect(byId(warn.signals).get('offtarget')?.severity).toBe('warn');

    const alert = computeSourceHealthSignals(
      {
        healthRecords: [makeRecord()],
        persistedStatuses: [],
        dedupStats: null,
        scoreStats: makeScoreStats({ totalScored: 100, outOfTarget: OFFTARGET_ALERT_RATE }),
      },
      NOW
    );
    expect(byId(alert.signals).get('offtarget')?.severity).toBe('alert');
  });

  it('ignores unscored missions in the off-target rate', () => {
    const scoreStats = computeScoreStats([
      makeMission({ score: 10, source: 'free-work' }),
      makeMission({ score: null, source: 'malt' }),
      makeMission({ score: 85, source: 'malt' }),
    ]);
    expect(scoreStats).toEqual({ totalScored: 2, outOfTarget: 1, connectorCount: 2 });
  });

  // ── Ordering & ratios ──────────────────────────────────────────────────

  it('sorts alerts before warns before ok signals', () => {
    const result = computeSourceHealthSignals(
      {
        healthRecords: [makeRecord({ consecutiveZeros: 5 })],
        persistedStatuses: [],
        dedupStats: makeDedupStats({ rawCount: 100, mergedCount: 20 }),
        scoreStats: makeScoreStats({ totalScored: 100, outOfTarget: 25 }),
      },
      NOW
    );
    const severities = result.signals.map((signal) => signal.severity);
    const rank = { alert: 0, warn: 1, ok: 2 } as const;
    const ranks = severities.map((severity) => rank[severity]);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(result.signals[0]?.severity).toBe('alert');
  });

  it('keeps the canonical order on severity and ratio ties', () => {
    const result = computeSourceHealthSignals(
      {
        healthRecords: [makeRecord()],
        persistedStatuses: [],
        dedupStats: null,
        scoreStats: null,
      },
      NOW
    );
    expect(result.signals.map((signal) => signal.id)).toEqual([
      'duplicates',
      'parsers',
      'stale',
      'offtarget',
    ]);
  });

  it('breaks severity ties by descending ratio', () => {
    const result = computeSourceHealthSignals(
      {
        healthRecords: [makeRecord()],
        persistedStatuses: [],
        dedupStats: makeDedupStats({ rawCount: 100, mergedCount: 50 }),
        scoreStats: makeScoreStats({ totalScored: 100, outOfTarget: 10 }),
      },
      NOW
    );
    // duplicates ratio 0.5 beats offtarget ratio 0.1 within the ok tier
    expect(result.signals[0]?.id).toBe('duplicates');
    expect(result.signals[0]?.ratio).toBe(0.5);
  });

  it('keeps every ratio within [0, 1]', () => {
    const result = computeSourceHealthSignals(
      {
        healthRecords: [makeRecord({ consecutiveZeros: 500 })],
        persistedStatuses: [makeStatus({ connectorId: 'malt', lastSuccessAt: null })],
        dedupStats: makeDedupStats({ rawCount: 1, mergedCount: 99 }),
        scoreStats: makeScoreStats({ totalScored: 0, outOfTarget: 99 }),
      },
      NOW
    );
    for (const signal of result.signals) {
      expect(signal.ratio).toBeGreaterThanOrEqual(0);
      expect(signal.ratio).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic for identical inputs', () => {
    const input = {
      healthRecords: [makeRecord({ consecutiveZeros: 1 })],
      persistedStatuses: [makeStatus({ connectorId: 'malt' })],
      dedupStats: makeDedupStats({ rawCount: 100, mergedCount: 6 }),
      scoreStats: makeScoreStats({ totalScored: 100, outOfTarget: 45 }),
    };
    const first = computeSourceHealthSignals(input, NOW);
    const second = computeSourceHealthSignals(input, NOW);
    expect(first).toEqual(second);
  });
});

describe('computeScoreStats (Core)', () => {
  it('returns zeros for an empty catalogue', () => {
    expect(computeScoreStats([])).toEqual({ totalScored: 0, outOfTarget: 0, connectorCount: 0 });
  });

  it('counts distinct sources only among scored missions', () => {
    const stats = computeScoreStats([
      makeMission({ score: 50, source: 'free-work' }),
      makeMission({ score: 60, source: 'free-work' }),
      makeMission({ score: null, source: 'lehibou' }),
      makeMission({ score: 35, source: 'malt' }),
    ]);
    expect(stats.totalScored).toBe(3);
    expect(stats.outOfTarget).toBe(1);
    expect(stats.connectorCount).toBe(2);
  });

  it('treats missions at the boundary score as on-target', () => {
    const stats = computeScoreStats([makeMission({ score: SCORE_OUT_OF_TARGET, source: 'malt' })]);
    expect(stats.outOfTarget).toBe(0);
    expect(stats.totalScored).toBe(1);
  });
});

describe('buildDedupStatsUpdate (Core)', () => {
  it('starts a fresh monthly counter when there is no previous stats', () => {
    const next = buildDedupStatsUpdate(null, { rawCount: 42, mergedCount: 3 }, NOW);
    expect(next).toEqual({
      lastScanAt: NOW.getTime(),
      rawCount: 42,
      mergedCount: 3,
      monthKey: NOW_MONTH_KEY,
      monthMergedCount: 3,
    });
  });

  it('accumulates the monthly counter within the same month', () => {
    const prev = makeDedupStats({ monthMergedCount: 5 });
    const next = buildDedupStatsUpdate(prev, { rawCount: 80, mergedCount: 2 }, NOW);
    expect(next.monthMergedCount).toBe(7);
    expect(next.mergedCount).toBe(2);
    expect(next.rawCount).toBe(80);
  });

  it('resets the monthly counter when the month rolls over', () => {
    const prev = makeDedupStats({ monthKey: '2026-01', monthMergedCount: 12 });
    const next = buildDedupStatsUpdate(prev, { rawCount: 80, mergedCount: 2 }, NOW);
    expect(next.monthMergedCount).toBe(2);
    expect(next.monthKey).not.toBe(prev.monthKey);
  });
});
