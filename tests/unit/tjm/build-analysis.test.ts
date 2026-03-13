import { describe, it, expect } from 'vitest';
import { buildAnalysisFromAggregation } from '../../../src/lib/core/tjm/build-analysis';
import type { AggregatedTJM } from '../../../src/lib/core/tjm/aggregator';

const NOW = new Date('2026-03-13T12:00:00Z');

function makeAggregated(overrides: Partial<AggregatedTJM> = {}): AggregatedTJM {
  return {
    title: 'Developpeur React',
    location: 'Paris',
    min: 400,
    median: 500,
    max: 600,
    count: 10,
    stddev: 50,
    dataPoints: [],
    ...overrides,
  };
}

describe('buildAnalysisFromAggregation', () => {
  it('calcule les fourchettes junior = median * 0.8', () => {
    const result = buildAnalysisFromAggregation(makeAggregated(), NOW);
    expect(result.junior.median).toBe(400);
    expect(result.junior.min).toBe(320);
    expect(result.junior.max).toBe(480);
  });

  it('calcule les fourchettes confirmed = valeurs brutes', () => {
    const result = buildAnalysisFromAggregation(makeAggregated(), NOW);
    expect(result.confirmed.median).toBe(500);
    expect(result.confirmed.min).toBe(400);
    expect(result.confirmed.max).toBe(600);
  });

  it('calcule les fourchettes senior = median * 1.25', () => {
    const result = buildAnalysisFromAggregation(makeAggregated(), NOW);
    expect(result.senior.median).toBe(625);
    expect(result.senior.min).toBe(500);
    expect(result.senior.max).toBe(750);
  });

  it('calcule la confiance en combinant count et cv', () => {
    // count=10 -> countFactor = 10/20 = 0.5
    // cv = 50/500 = 0.1 -> cvFactor = 1 - 0.1 = 0.9
    // confidence = 0.5 * 0.6 + 0.9 * 0.4 = 0.3 + 0.36 = 0.66
    const result = buildAnalysisFromAggregation(makeAggregated(), NOW);
    expect(result.confidence).toBe(0.66);
  });

  it('confidence maximale avec count >= 20 et stddev = 0', () => {
    const result = buildAnalysisFromAggregation(makeAggregated({ count: 25, stddev: 0 }), NOW);
    // countFactor = 1, cvFactor = 1
    // confidence = 0.6 + 0.4 = 1.0
    expect(result.confidence).toBe(1);
  });

  it('tendance stable quand cv < 0.15', () => {
    // cv = 40/500 = 0.08 < 0.15
    const result = buildAnalysisFromAggregation(makeAggregated({ stddev: 40 }), NOW);
    expect(result.trend).toBe('stable');
  });

  it('tendance up quand cv >= 0.15', () => {
    // cv = 100/500 = 0.2 >= 0.15
    const result = buildAnalysisFromAggregation(makeAggregated({ stddev: 100 }), NOW);
    expect(result.trend).toBe('up');
  });

  it('retourne trendDetail et recommendation en francais', () => {
    const result = buildAnalysisFromAggregation(makeAggregated(), NOW);
    expect(result.trendDetail).toContain('EUR');
    expect(result.recommendation).toContain('EUR/jour');
  });

  it('retourne le nombre de dataPoints', () => {
    const result = buildAnalysisFromAggregation(makeAggregated({ count: 15 }), NOW);
    expect(result.dataPoints).toBe(15);
  });

  it('retourne analyzedAt = now', () => {
    const result = buildAnalysisFromAggregation(makeAggregated(), NOW);
    expect(result.analyzedAt).toBe(NOW);
  });
});
