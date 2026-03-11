import { describe, it, expect } from 'vitest';
import { aggregateFromPoints } from '../../../src/lib/tjm/aggregator';
import type { TJMDataPoint } from '../../../src/lib/core/types/tjm';

function makePoint(overrides: Partial<TJMDataPoint> = {}): TJMDataPoint {
  return {
    tjm: 500,
    title: 'Développeur React',
    location: 'Paris',
    source: 'free-work',
    date: new Date(),
    ...overrides,
  };
}

describe('aggregateFromPoints', () => {
  it('aggregates matching data points', () => {
    const points: TJMDataPoint[] = [
      makePoint({ tjm: 400 }),
      makePoint({ tjm: 500 }),
      makePoint({ tjm: 600 }),
    ];
    const result = aggregateFromPoints(points, 'React', 'Paris');
    expect(result).not.toBeNull();
    expect(result!.min).toBe(400);
    expect(result!.max).toBe(600);
    expect(result!.median).toBe(500);
    expect(result!.count).toBe(3);
  });

  it('returns null when no points match', () => {
    const points: TJMDataPoint[] = [
      makePoint({ title: 'Java Developer' }),
    ];
    const result = aggregateFromPoints(points, 'Angular', 'Paris');
    expect(result).toBeNull();
  });

  it('filters out old data points (> 30 days)', () => {
    const old = new Date();
    old.setDate(old.getDate() - 31);
    const points: TJMDataPoint[] = [
      makePoint({ date: old }),
      makePoint({ tjm: 550 }),
    ];
    const result = aggregateFromPoints(points, 'React', 'Paris');
    expect(result).not.toBeNull();
    expect(result!.count).toBe(1);
    expect(result!.median).toBe(550);
  });

  it('computes correct median for even number of points', () => {
    const points: TJMDataPoint[] = [
      makePoint({ tjm: 400 }),
      makePoint({ tjm: 500 }),
      makePoint({ tjm: 600 }),
      makePoint({ tjm: 700 }),
    ];
    const result = aggregateFromPoints(points, 'React', 'Paris');
    expect(result!.median).toBe(550);
  });

  it('computes stddev', () => {
    const points: TJMDataPoint[] = [
      makePoint({ tjm: 500 }),
      makePoint({ tjm: 500 }),
    ];
    const result = aggregateFromPoints(points, 'React', 'Paris');
    expect(result!.stddev).toBe(0);
  });

  it('filters by location', () => {
    const points: TJMDataPoint[] = [
      makePoint({ location: 'Paris', tjm: 600 }),
      makePoint({ location: 'Lyon', tjm: 400 }),
    ];
    const result = aggregateFromPoints(points, 'React', 'Paris');
    expect(result).not.toBeNull();
    expect(result!.count).toBe(1);
    expect(result!.min).toBe(600);
  });
});
