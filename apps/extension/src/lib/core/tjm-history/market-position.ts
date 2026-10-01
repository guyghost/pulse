import type { SeniorityLevel } from '../types/profile';
import type { TJMRange } from '../types/tjm';

export interface TJMFloorMarketProfile {
  tjmMin: number;
  tjmMax: number | null;
  seniority: SeniorityLevel | null;
}

export interface TJMFloorMarketProjection {
  delta: number;
  positioning: {
    marketLeft: number;
    marketWidth: number;
    medianLeft: number;
    floorLeft: number;
    marketMedian: number;
  };
}

/** Project a valid profile floor against the matching market segment. */
export function projectTJMFloorAgainstMarket(
  profile: TJMFloorMarketProfile,
  market: TJMRange | null
): TJMFloorMarketProjection | null {
  const { tjmMin, tjmMax, seniority } = profile;
  const hasInvertedRange = tjmMax !== null && tjmMax > 0 && tjmMin > tjmMax;

  if (
    !market ||
    !seniority ||
    !Number.isFinite(tjmMin) ||
    tjmMin <= 0 ||
    hasInvertedRange ||
    !Number.isFinite(market.min) ||
    !Number.isFinite(market.max) ||
    !Number.isFinite(market.median) ||
    market.min > market.median ||
    market.median > market.max
  ) {
    return null;
  }

  const lowerBound = Math.min(market.min, tjmMin);
  const upperBound = Math.max(market.max, tjmMin);
  const padding = Math.max(40, Math.round((upperBound - lowerBound) * 0.08));
  const scaleMin = lowerBound - padding;
  const scaleMax = upperBound + padding;
  const span = scaleMax - scaleMin || 1;
  const toPercent = (value: number) =>
    Math.max(0, Math.min(100, ((value - scaleMin) / span) * 100));

  return {
    delta: tjmMin - market.median,
    positioning: {
      marketLeft: toPercent(market.min),
      marketWidth: Math.max(3, toPercent(market.max) - toPercent(market.min)),
      medianLeft: toPercent(market.median),
      floorLeft: toPercent(tjmMin),
      marketMedian: market.median,
    },
  };
}
