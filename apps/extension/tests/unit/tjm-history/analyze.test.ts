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
  seniority: null,
  region: null,
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
    expect(analysis!.regionInsights).toBeDefined();
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

  it('computes region insights from records with region data', () => {
    const history = makeHistory([
      makeRecord({ stack: 'react', average: 600, sampleCount: 5, region: 'ile-de-france' }),
      makeRecord({ stack: 'vue', average: 580, sampleCount: 3, region: 'ile-de-france' }),
      makeRecord({ stack: 'react', average: 480, sampleCount: 4, region: 'lyon' }),
      makeRecord({ stack: 'vue', average: 460, sampleCount: 2, region: 'lyon' }),
      makeRecord({ stack: 'react', average: 550, sampleCount: 3, region: 'remote' }),
    ]);

    const analysis = analyzeTJMHistory(history);
    expect(analysis).not.toBeNull();

    const { regionInsights } = analysis!;
    expect(regionInsights.length).toBeGreaterThanOrEqual(3);

    // Sorted by average desc → IDF should be first
    const idf = regionInsights.find((r) => r.region === 'ile-de-france');
    const lyon = regionInsights.find((r) => r.region === 'lyon');
    const remote = regionInsights.find((r) => r.region === 'remote');

    expect(idf).toBeDefined();
    expect(lyon).toBeDefined();
    expect(remote).toBeDefined();

    // IDF weighted average: (600*5 + 580*3) / 8 = 4740/8 = 593
    expect(idf!.average).toBe(593);
    expect(idf!.label).toBe('Île-de-France');

    // Lyon weighted average: (480*4 + 460*2) / 6 = 2840/6 = 473
    expect(lyon!.average).toBe(473);

    // IDF average > Lyon average
    expect(idf!.average).toBeGreaterThan(lyon!.average);
  });

  it('excludes other region with only 1 sample', () => {
    const history = makeHistory([
      makeRecord({ stack: 'react', average: 500, sampleCount: 1, region: 'other' }),
      makeRecord({ stack: 'react', average: 600, sampleCount: 5, region: 'ile-de-france' }),
    ]);

    const analysis = analyzeTJMHistory(history);
    expect(analysis).not.toBeNull();

    const otherInsight = analysis!.regionInsights.find((r) => r.region === 'other');
    expect(otherInsight).toBeUndefined();
  });
});
