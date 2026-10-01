import { describe, expect, it } from 'vitest';
import { projectTJMFloorAgainstMarket } from '$lib/core/tjm-history/market-position';
import type { TJMRange } from '$lib/core/types/tjm';

const market: TJMRange = { min: 600, max: 700, median: 650 };

describe('projectTJMFloorAgainstMarket', () => {
  it('compares an open-ended profile floor to its market median and projects the chart markers', () => {
    const projection = projectTJMFloorAgainstMarket(
      { tjmMin: 500, tjmMax: null, seniority: 'confirmed' },
      market
    );

    expect(projection?.delta).toBe(-150);
    expect(projection?.positioning).toMatchObject({ marketMedian: 650 });
    expect(projection?.positioning.marketLeft).toBeCloseTo(50);
    expect(projection?.positioning.marketWidth).toBeCloseTo(35.714);
    expect(projection?.positioning.medianLeft).toBeCloseTo(67.857);
    expect(projection?.positioning.floorLeft).toBeCloseTo(14.286);
  });

  it.each([
    ['missing floor', { tjmMin: 0, tjmMax: null, seniority: 'confirmed' as const }, market],
    ['missing seniority', { tjmMin: 500, tjmMax: null, seniority: null }, market],
    [
      'inverted profile range',
      { tjmMin: 700, tjmMax: 600, seniority: 'confirmed' as const },
      market,
    ],
    ['missing market data', { tjmMin: 500, tjmMax: null, seniority: 'confirmed' as const }, null],
  ])('returns no projection for %s', (_label, profile, range) => {
    expect(projectTJMFloorAgainstMarket(profile, range)).toBeNull();
  });
});
