import { describe, expect, it } from 'vitest';
import type { TJMRecord } from '$lib/core/types/tjm';
import { buildTJMSeries } from '$lib/core/tjm-history/index';

const makeRecord = (overrides: Partial<TJMRecord> = {}): TJMRecord => ({
  stack: 'react',
  date: '2026-04-01',
  min: 450,
  max: 650,
  average: 550,
  sampleCount: 3,
  seniority: null,
  region: null,
  ...overrides,
});

describe('buildTJMSeries', () => {
  it('returns an empty series for empty input', () => {
    expect(buildTJMSeries([])).toEqual([]);
  });

  it('aggregates same-date records with a sample-weighted average', () => {
    const series = buildTJMSeries([
      makeRecord({ stack: 'react', date: '2026-04-01', average: 500, sampleCount: 3 }),
      makeRecord({ stack: 'node', date: '2026-04-01', average: 600, sampleCount: 1 }),
    ]);

    expect(series).toEqual([{ date: '2026-04-01', average: 525 }]);
  });

  it('sorts the series chronologically regardless of input order', () => {
    const series = buildTJMSeries([
      makeRecord({ date: '2026-04-03' }),
      makeRecord({ date: '2026-04-01' }),
      makeRecord({ date: '2026-04-02' }),
    ]);

    expect(series.map((point) => point.date)).toEqual(['2026-04-01', '2026-04-02', '2026-04-03']);
  });

  it('ignores records with a non-positive average or sample count', () => {
    const series = buildTJMSeries([
      makeRecord({ date: '2026-04-01', average: 0 }),
      makeRecord({ date: '2026-04-02', sampleCount: 0 }),
      makeRecord({ date: '2026-04-03', average: 550 }),
    ]);

    expect(series).toHaveLength(1);
    expect(series[0].date).toBe('2026-04-03');
  });

  it('keeps every point when the history fits within the bucket budget', () => {
    const records = Array.from({ length: 5 }, (_, i) => makeRecord({ date: `2026-04-0${i + 1}` }));

    expect(buildTJMSeries(records, 12)).toHaveLength(5);
  });

  it('resamples long histories into at most bucketCount contiguous points', () => {
    // 24 days in April + 12 days in May = 36 daily points, resampled to 12.
    const records = Array.from({ length: 36 }, (_, i) => {
      const day = i + 1;
      const date =
        day <= 24
          ? `2026-04-${String(day).padStart(2, '0')}`
          : `2026-05-${String(day - 24).padStart(2, '0')}`;
      return makeRecord({ date });
    });

    const series = buildTJMSeries(records, 12);

    expect(series).toHaveLength(12);
    expect(series[0].date).toBe('2026-04-03');
    expect(series[series.length - 1].date).toBe('2026-05-12');
    const dates = series.map((point) => point.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('never emits a non-positive average', () => {
    const series = buildTJMSeries([
      makeRecord({ date: '2026-04-01', average: 500, sampleCount: 1 }),
      makeRecord({ date: '2026-04-02', average: 600, sampleCount: 2 }),
    ]);

    for (const point of series) {
      expect(point.average).toBeGreaterThan(0);
    }
  });
});
