import { describe, expect, it } from 'vitest';
import type { TJMHistory, TJMRecord } from '$lib/core/types/tjm';
import { analyzeTJMHistory } from '$lib/core/tjm-history/index';

const makeRecord = (overrides: Partial<TJMRecord> = {}): TJMRecord => ({
  stack: 'react',
  date: '2026-04-01',
  min: 450,
  max: 650,
  average: 550,
  sampleCount: 3,
  ...overrides,
});

const makeHistory = (records: TJMRecord[]): TJMHistory => ({ records });

describe('analyzeTJMHistory', () => {
  it('returns null for empty history', () => {
    expect(analyzeTJMHistory({ records: [] })).toBeNull();
  });

  it('builds a dashboard-ready analysis from latest stack stats', () => {
    const history = makeHistory([
      makeRecord({ stack: 'react', date: '2026-04-01', average: 520, min: 480, max: 560 }),
      makeRecord({ stack: 'react', date: '2026-04-02', average: 590, min: 540, max: 640 }),
      makeRecord({ stack: 'typescript', date: '2026-04-01', average: 500, min: 450, max: 550 }),
      makeRecord({ stack: 'typescript', date: '2026-04-02', average: 560, min: 510, max: 610 }),
      makeRecord({ stack: 'node', date: '2026-04-01', average: 470, min: 430, max: 520 }),
      makeRecord({ stack: 'node', date: '2026-04-02', average: 530, min: 490, max: 570 }),
    ]);

    const analysis = analyzeTJMHistory(history);

    expect(analysis).not.toBeNull();
    expect(analysis!.trend).toBe('up');
    expect(analysis!.dataPoints).toBe(6);
    expect(analysis!.lastUpdated).toBe('2026-04-02');
    expect(analysis!.topStacks).toHaveLength(3);
    expect(analysis!.confirmed.median).toBeGreaterThan(0);
    expect(analysis!.senior.max).toBeGreaterThanOrEqual(analysis!.confirmed.max);
  });

  it('marks the market as down when most tracked stacks are decreasing', () => {
    const history = makeHistory([
      makeRecord({ stack: 'react', date: '2026-04-01', average: 600 }),
      makeRecord({ stack: 'react', date: '2026-04-02', average: 520 }),
      makeRecord({ stack: 'vue', date: '2026-04-01', average: 580 }),
      makeRecord({ stack: 'vue', date: '2026-04-02', average: 510 }),
      makeRecord({ stack: 'node', date: '2026-04-01', average: 540 }),
      makeRecord({ stack: 'node', date: '2026-04-02', average: 535 }),
    ]);

    const analysis = analyzeTJMHistory(history);

    expect(analysis).not.toBeNull();
    expect(analysis!.trend).toBe('down');
    expect(analysis!.trendDetail).toContain('ralentit');
    expect(analysis!.recommendation).toContain('cœur de marché');
  });

  it('falls back to duplicated slices when there are too few stacks', () => {
    const history = makeHistory([
      makeRecord({ stack: 'react', date: '2026-04-01', average: 550 }),
      makeRecord({ stack: 'typescript', date: '2026-04-01', average: 650 }),
    ]);

    const analysis = analyzeTJMHistory(history);

    expect(analysis).not.toBeNull();
    expect(analysis!.junior.min).toBeGreaterThan(0);
    expect(analysis!.confirmed.min).toBeGreaterThan(0);
    expect(analysis!.senior.min).toBeGreaterThan(0);
  });
});
