import type { Mission } from '../types/mission';
import { parseIsoDateTimeToEpochMs } from '../utils/iso-time';

/**
 * Configuration for the composite ranking weights.
 *
 * `relevance` + `freshness` should sum to 1.0 so the composite stays in 0-100,
 * but `missionRankScore` normalizes if they don't.
 */
export interface RankingWeights {
  /** Weight for the relevance score (existing mission score, 0-100). */
  relevance: number;
  /** Weight for the freshness score (time-decay from publishedAt, 0-100). */
  freshness: number;
}

/**
 * Default ranking weights — relevance dominates, freshness breaks ties
 * and surfaces recent missions.
 */
export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  relevance: 0.75,
  freshness: 0.25,
};

/** Days over which the freshness score decays from 100 to 0. */
export const DEFAULT_FRESHNESS_DECAY_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Best available numeric score for a mission (0-100).
 * Prefers the structured breakdown, falls back to legacy fields.
 */
const getMissionScore = (m: Mission): number =>
  m.scoreBreakdown?.total ?? m.semanticScore ?? m.score ?? 0;

/**
 * Compute a freshness score (0-100) based on the publication date.
 *
 * - Published today or in the future: 100
 * - Linear decay to 0 over `decayDays`
 * - No date or unparseable: 50 (neutral — no penalty or boost)
 *
 * Pure function — `now` is injected for testability.
 *
 * @param publishedAt - ISO 8601 date string, or null
 * @param now - Current date (injected)
 * @param decayDays - Days for full decay (default: 14)
 * @returns Freshness score 0-100
 */
export function freshnessScore(
  publishedAt: string | null,
  now: Date,
  decayDays: number = DEFAULT_FRESHNESS_DECAY_DAYS
): number {
  if (!publishedAt) {
    return 50;
  }
  const epochMs = parseIsoDateTimeToEpochMs(publishedAt);
  if (epochMs === null) {
    return 50;
  }
  const ageMs = now.getTime() - epochMs;
  if (ageMs <= 0) {
    return 100;
  }
  const ageDays = ageMs / MS_PER_DAY;
  if (ageDays >= decayDays) {
    return 0;
  }
  return Math.round(100 * (1 - ageDays / decayDays));
}

/**
 * Compute the composite rank score for a single mission.
 *
 * Combines the relevance score (stack/location/TJM/remote match) with a
 * freshness score (publication recency). Both are 0-100, weighted and summed.
 *
 * Pure function — `now` is injected.
 *
 * @param mission - The mission to score
 * @param now - Current date (injected)
 * @param weights - Relevance/freshness weights (default: 0.75/0.25)
 * @returns Composite rank score (0-100)
 */
export function missionRankScore(
  mission: Mission,
  now: Date,
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS
): number {
  const relevance = getMissionScore(mission);
  const fresh = freshnessScore(mission.publishedAt, now);
  const total = weights.relevance + weights.freshness;
  // Normalize so the result stays in 0-100 even if weights don't sum to 1
  const wRel = total > 0 ? weights.relevance / total : 0.75;
  const wFresh = total > 0 ? weights.freshness / total : 0.25;
  return Math.round(relevance * wRel + fresh * wFresh);
}

export interface RankingOptions {
  /** Relevance/freshness weights (default: DEFAULT_RANKING_WEIGHTS). */
  weights?: RankingWeights;
  /** Freshness decay period in days (default: 14). */
  freshnessDecayDays?: number;
  /**
   * Whether to interleave missions by source for diversity.
   * When true (default), missions from different sources are spread across
   * the feed instead of clumping by connector. Set false for pure score order.
   */
  diversify?: boolean;
}

/**
 * Rank missions by a composite of relevance + freshness, with optional
 * source diversity interleaving.
 *
 * Unlike `sortMissions` (single-key sort), this produces a curated ranking
 * that surfaces recent, relevant missions while preventing any single
 * connector source from dominating consecutive positions.
 *
 * Algorithm:
 * 1. Compute a composite score per mission (relevance × weight + freshness × weight)
 * 2. Sort by composite score (descending)
 * 3. If `diversify`, round-robin interleave by source so missions from
 *    different connectors are spread across the feed
 *
 * Pure function — no I/O, no side effects, `now` is injected.
 *
 * @param missions - Array of missions to rank
 * @param now - Current date (injected for testability)
 * @param options - Ranking configuration
 * @returns New ranked array (does not mutate input)
 */
export function rankMissions(missions: Mission[], now: Date, options?: RankingOptions): Mission[] {
  if (missions.length <= 1) {
    return [...missions];
  }

  const weights = options?.weights ?? DEFAULT_RANKING_WEIGHTS;
  const diversify = options?.diversify ?? true;

  // 1. Sort by composite score
  const sorted = [...missions].sort(
    (a, b) => missionRankScore(b, now, weights) - missionRankScore(a, now, weights)
  );

  // 2. Source diversity: round-robin interleave (skip if disabled or single source)
  const sources = new Set(sorted.map((m) => m.source));
  if (!diversify || sources.size <= 1) {
    return sorted;
  }

  return interleaveBySource(sorted);
}

/**
 * Interleave missions by source using round-robin.
 *
 * Groups missions by source (preserving score order within each group),
 * then picks one from each source per pass. This spreads sources evenly
 * across the result while keeping each source's missions in score order.
 *
 * Pure function.
 */
function interleaveBySource(scoreSorted: Mission[]): Mission[] {
  const buckets = new Map<string, Mission[]>();
  for (const mission of scoreSorted) {
    const group = buckets.get(mission.source) ?? [];
    group.push(mission);
    buckets.set(mission.source, group);
  }

  const sources = [...buckets.keys()];
  const result: Mission[] = [];
  const indices = new Map<string, number>(sources.map((s) => [s, 0]));

  let remaining = scoreSorted.length;
  while (remaining > 0) {
    let placedAny = false;
    for (const source of sources) {
      const idx = indices.get(source)!;
      const bucket = buckets.get(source)!;
      if (idx < bucket.length) {
        result.push(bucket[idx]);
        indices.set(source, idx + 1);
        remaining--;
        placedAny = true;
      }
    }
    if (!placedAny) {
      break; // safety valve
    }
  }

  return result;
}
