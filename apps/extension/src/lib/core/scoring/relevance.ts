import type { Mission } from '../types/mission';
import type { RemoteType } from '../types/mission';
import type { UserProfile, ScoringWeights, SeniorityLevel } from '../types/profile';
import { DEFAULT_SCORING_WEIGHTS } from '../types/profile';
import type { DeterministicBreakdown } from '../types/score';
import { matchLocation } from './location-matching';
import { scoreSeniorityBonus, scoreStartDateBonus } from './bonus-scoring';

/**
 * Deterministic scoring result — breakdown + total.
 */
export interface DeterministicScoreResult {
  breakdown: DeterministicBreakdown;
  total: number; // 0-100, clamped
}

/**
 * Profile data precomputed once per profile (not per mission).
 *
 * Built by {@link prepareProfileScoring}. Deterministic and pure: same profile
 * in, same structure out. Lets scan loops score N missions against one profile
 * without rebuilding the keyword Set / normalized weights N times.
 *
 * Invariant: scores produced via this structure are bit-identical to
 * {@link scoreMission} for the same (mission, profile, now) inputs.
 */
export interface PreparedScoringProfile {
  /** Normalized scoring weights (sum to 100). */
  readonly weights: ScoringWeights;
  /** Lowercased truthy profile keywords for O(1) membership checks. */
  readonly keywordSet: ReadonlySet<string>;
  /**
   * True when the RAW profile keywords array is non-empty. This preserves the
   * "no keywords configured → full stack score" branch exactly: a list like
   * [''] is non-empty (stack score 0) even though its keywordSet is empty,
   * so the flag must not be derived from keywordSet.size.
   */
  readonly hasKeywords: boolean;
  /** Raw profile fields consumed by the non-stack criteria, unchanged. */
  readonly location: string;
  readonly tjmMin: number;
  readonly tjmMax: number;
  readonly remote: RemoteType | 'any';
  readonly seniority: SeniorityLevel;
}

/**
 * Precompute the per-profile scoring inputs (keyword Set, normalized weights).
 *
 * Pure and deterministic — call once per profile per scan, then use
 * {@link scoreMissionWithPrepared} per mission. Produces identical scores to
 * calling {@link scoreMission} directly.
 */
export const prepareProfileScoring = (profile: UserProfile): PreparedScoringProfile => {
  const weights = normalizeWeights(profile.scoringWeights ?? DEFAULT_SCORING_WEIGHTS);

  const keywordSet = new Set<string>();
  for (const entry of profile.keywords) {
    if (entry) {
      keywordSet.add(entry.toLowerCase());
    }
  }

  return {
    weights,
    keywordSet,
    hasKeywords: profile.keywords.length > 0,
    location: profile.location,
    tjmMin: profile.tjmMin,
    tjmMax: profile.tjmMax,
    remote: profile.remote,
    seniority: profile.seniority,
  };
};

/**
 * Score a mission's relevance to a user profile.
 *
 * The score is computed by evaluating four criteria as match percentages (0-100):
 * - Stack matching: How well the mission's tech stack matches the profile
 * - Location: Whether the mission location matches the profile's location
 * - TJM: Whether the mission's daily rate falls within the profile's range
 * - Remote: Whether the work mode matches the profile's preference
 *
 * These raw percentages are stored in breakdown.criteria (gradable via scoreToGrade).
 * The total is the weighted sum of criteria + bonus points (clamped to 100).
 *
 * @param mission - The mission to score
 * @param profile - The user profile to match against
 * @param now - Current date for start date bonus (optional, defaults to no bonus)
 * @returns Structured result with per-criterion breakdown and total score (0-100)
 */
export const scoreMission = (
  mission: Mission,
  profile: UserProfile,
  now?: Date
): DeterministicScoreResult =>
  scoreMissionWithPrepared(mission, prepareProfileScoring(profile), now);

/**
 * Score a mission against a precomputed profile (see {@link prepareProfileScoring}).
 *
 * Behavior-identical to {@link scoreMission}: same mission, profile and date
 * inputs produce bit-identical results. Intended for hot loops that score N
 * missions against one profile per scan.
 */
export const scoreMissionWithPrepared = (
  mission: Mission,
  prepared: PreparedScoringProfile,
  now?: Date
): DeterministicScoreResult => {
  const normalizedWeights = prepared.weights;

  // Raw match percentages (0-100) — directly gradable.
  // NOTE: mission.stack is the platform-parsed tech stack; profile.keywords is
  // the unified keyword list (post-unification). The dimension name "stack" in
  // ScoringWeights/breakdown is unchanged — it names the scoring axis, not the
  // profile field. See models/keywords-unification.model.md.
  const stackMatch = rawStackScore(mission.stack, prepared);
  const locationMatch = rawLocationScore(mission.location, prepared.location);
  const tjmMatch = rawTjmScore(mission.tjm, prepared.tjmMin, prepared.tjmMax);
  const remoteMatch = rawRemoteScore(mission.remote, prepared.remote);

  // Weighted contribution to total
  const weightedStack = stackMatch * (normalizedWeights.stack / 100);
  const weightedLocation = locationMatch * (normalizedWeights.location / 100);
  const weightedTjm = tjmMatch * (normalizedWeights.tjm / 100);
  const weightedRemote = remoteMatch * (normalizedWeights.remote / 100);

  const baseScore = weightedStack + weightedLocation + weightedTjm + weightedRemote;

  // Bonus points (clamped to 100)
  const seniorityBonus = scoreSeniorityBonus(mission.seniority, prepared.seniority);
  const startDateBonus = now ? scoreStartDateBonus(mission.startDate, now) : 0;

  const total = Math.min(100, Math.round(baseScore + seniorityBonus + startDateBonus));

  return {
    breakdown: {
      stack: Math.round(stackMatch),
      location: Math.round(locationMatch),
      tjm: Math.round(tjmMatch),
      remote: Math.round(remoteMatch),
      seniorityBonus,
      startDateBonus,
    },
    total,
  };
};

/**
 * Normalize weights to ensure they sum to 100.
 * This allows users to provide any proportional weights without breaking the scoring.
 */
const normalizeWeights = (weights: ScoringWeights): ScoringWeights => {
  const total = weights.stack + weights.location + weights.tjm + weights.remote;

  if (total === 0) {
    return DEFAULT_SCORING_WEIGHTS;
  }

  if (total === 100) {
    return weights;
  }

  const factor = 100 / total;
  return {
    stack: weights.stack * factor,
    location: weights.location * factor,
    tjm: weights.tjm * factor,
    remote: weights.remote * factor,
  };
};

/**
 * Raw stack match percentage (0-100).
 * Returns % of mission stack that matches the profile keywords.
 *
 * Scoring-neutral merge invariant: the denominator is `missionStack.length`,
 * NOT `profileKeywords.length`. Adding domain keywords (e.g. "SaaS", "fintech")
 * that never appear in a mission's parsed stack does not change any mission's
 * score — they are simply never matched. This is what makes it safe to merge
 * the former `stack` and `searchKeywords` into a single `keywords` list.
 *
 * The profile keyword Set is precomputed once per profile by
 * `prepareProfileScoring` (formerly rebuilt per mission here). Output is
 * identical: each truthy mission-stack entry that matches a (lowercased)
 * profile keyword counts once toward the numerator, and the denominator stays
 * the full missionStack.length.
 */
const rawStackScore = (missionStack: string[], prepared: PreparedScoringProfile): number => {
  if (!prepared.hasKeywords) {
    return 100;
  }
  if (missionStack.length === 0) {
    return 0;
  }
  let matchCount = 0;
  for (const entry of missionStack) {
    if (entry && prepared.keywordSet.has(entry.toLowerCase())) {
      matchCount++;
    }
  }
  return (matchCount / missionStack.length) * 100;
};

/**
 * Raw location match percentage (0-100).
 */
const rawLocationScore = (missionLocation: string | null, profileLocation: string): number => {
  if (!profileLocation) {
    return 100;
  }
  if (!missionLocation) {
    return 50;
  }
  const match = matchLocation(missionLocation, profileLocation);
  switch (match) {
    case 'exact':
      return 100;
    case 'synonym':
      return 80;
    case 'nearby':
      return 70;
    case 'partial':
      return 60;
    case 'none':
      return 0;
  }
};

/**
 * Raw TJM match percentage (0-100).
 * - Within range: 100
 * - Unknown TJM: ~50
 * - Outside range: scaled by distance
 */
const rawTjmScore = (missionTjm: number | null, min: number, max: number): number => {
  if (missionTjm === null) {
    return 48;
  }
  if (min <= 0 && max <= 0) {
    return 100;
  }
  if (min > 0 && max <= 0) {
    if (missionTjm >= min) {
      return 100;
    }
    return Math.round(Math.max(0, missionTjm / min) * 100);
  }
  if (min <= 0 && max > 0) {
    if (missionTjm <= max) {
      return 100;
    }
    return Math.round(Math.max(0, 1 - (missionTjm - max) / max) * 100);
  }
  if (missionTjm >= min && missionTjm <= max) {
    return 100;
  }
  const distance = missionTjm < min ? min - missionTjm : missionTjm - max;
  const rangeSize = max - min || 1;
  return Math.round(Math.max(0, 1 - distance / rangeSize) * 100);
};

/**
 * Raw work mode match percentage (0-100).
 * - Profile accepts any: 100
 * - Unknown work mode: ~50
 * - Exact match: 100
 * - No match: 0
 */
const rawRemoteScore = (missionRemote: string | null, profileRemote: string): number => {
  if (profileRemote === 'any') {
    return 100;
  }
  if (missionRemote === null) {
    return 47;
  }
  return missionRemote === profileRemote ? 100 : 0;
};
