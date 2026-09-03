import { describe, expect, it } from 'vitest';
import type { TJMHistory, TJMRecord } from '$lib/core/types/tjm';
import {
  analyzeTJMHistory,
  filterTJMHistoryByPeriod,
  TJM_PERIODS,
} from '$lib/core/tjm-history/index';

// Fixed reference time: 2026-08-21T12:00:00Z → date-only "2026-08-21".
const NOW = new Date('2026-08-21T12:00:00.000Z');

const makeRecord = (overrides: Partial<TJMRecord> = {}): TJMRecord => ({
  stack: 'react',
  date: '2026-08-21',
  min: 450,
  max: 650,
  average: 550,
  sampleCount: 3,
  seniority: null,
  region: null,
  ...overrides,
});

const makeHistory = (records: TJMRecord[]): TJMHistory => ({ records });

describe('filterTJMHistoryByPeriod', () => {
  it('exposes the three presets from the model', () => {
    expect([...TJM_PERIODS]).toEqual(['7d', '30d', 'all']);
  });

  it("returns the history unchanged for 'all' (identity invariant)", () => {
    const history = makeHistory([
      makeRecord({ date: '2020-01-01' }),
      makeRecord({ date: '2026-08-20' }),
    ]);

    expect(filterTJMHistoryByPeriod(history, 'all', NOW)).toBe(history);
  });

  it("keeps only records within the last 7 days for '7d' (boundary inclusive)", () => {
    const history = makeHistory([
      makeRecord({ stack: 'old', date: '2026-08-13' }), // 8 days before 08-21 → excluded
      makeRecord({ stack: 'edge', date: '2026-08-14' }), // exactly cutoff → included
      makeRecord({ stack: 'recent', date: '2026-08-20' }),
      makeRecord({ stack: 'today', date: '2026-08-21' }),
    ]);

    const filtered = filterTJMHistoryByPeriod(history, '7d', NOW);
    expect(filtered.records.map((r) => r.stack)).toEqual(['edge', 'recent', 'today']);
  });

  it("keeps only records within the last 30 days for '30d'", () => {
    const history = makeHistory([
      makeRecord({ stack: 'old', date: '2026-07-21' }), // 31 days before → excluded
      makeRecord({ stack: 'edge', date: '2026-07-22' }), // exactly cutoff → included
      makeRecord({ stack: 'recent', date: '2026-08-01' }),
    ]);

    const filtered = filterTJMHistoryByPeriod(history, '30d', NOW);
    expect(filtered.records.map((r) => r.stack)).toEqual(['edge', 'recent']);
  });

  it('is monotonic: 7d ⊆ 30d ⊆ all for the same history and now', () => {
    const dates = ['2026-08-21', '2026-08-15', '2026-08-01', '2026-07-25', '2026-06-01'];
    const history = makeHistory(dates.map((date, i) => makeRecord({ stack: `s${i}`, date })));

    const all = filterTJMHistoryByPeriod(history, 'all', NOW).records;
    const d30 = filterTJMHistoryByPeriod(history, '30d', NOW).records;
    const d7 = filterTJMHistoryByPeriod(history, '7d', NOW).records;

    const stacksOf = (records: TJMRecord[]) => new Set(records.map((r) => r.stack));
    for (const record of d7) {
      expect(stacksOf(d30)).toContain(record.stack);
    }
    for (const record of d30) {
      expect(stacksOf(all)).toContain(record.stack);
    }
  });

  it('returns an empty history when the window contains no records', () => {
    const history = makeHistory([makeRecord({ date: '2026-01-01' })]);

    expect(filterTJMHistoryByPeriod(history, '7d', NOW)).toEqual({ records: [] });
    expect(analyzeTJMHistory(filterTJMHistoryByPeriod(history, '7d', NOW), NOW)).toBeNull();
  });

  it('is deterministic from the injected now (no hidden clock)', () => {
    const history = makeHistory([makeRecord({ date: '2026-08-20' })]);
    const later = new Date('2026-08-28T12:00:00.000Z');

    // In-window at NOW, out-of-window one week later.
    expect(filterTJMHistoryByPeriod(history, '7d', NOW).records).toHaveLength(1);
    expect(filterTJMHistoryByPeriod(history, '7d', later).records).toHaveLength(0);
  });
});
