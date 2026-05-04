import type { Mission } from '../types/mission';
import type { UserProfile, ScoringWeights } from '../types/profile';
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
): DeterministicScoreResult => {
  const weights = profile.scoringWeights ?? DEFAULT_SCORING_WEIGHTS;
  const normalizedWeights = normalizeWeights(weights);

  // Raw match percentages (0-100) — directly gradable
  const stackMatch = rawStackScore(mission.stack, profile.stack);
  const locationMatch = rawLocationScore(mission.location, profile.location);
  const tjmMatch = rawTjmScore(mission.tjm, profile.tjmMin, profile.tjmMax);
  const remoteMatch = rawRemoteScore(mission.remote, profile.remote);

  // Weighted contribution to total
  const weightedStack = stackMatch * (normalizedWeights.stack / 100);
  const weightedLocation = locationMatch * (normalizedWeights.location / 100);
  const weightedTjm = tjmMatch * (normalizedWeights.tjm / 100);
  const weightedRemote = remoteMatch * (normalizedWeights.remote / 100);

  const baseScore = weightedStack + weightedLocation + weightedTjm + weightedRemote;

  // Bonus points (clamped to 100)
  const seniorityBonus = scoreSeniorityBonus(mission.seniority, profile.seniority);
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
 * Returns % of mission stack that matches the profile.
 */
const rawStackScore = (missionStack: string[], profileStack: string[]): number => {
  if (profileStack.length === 0) {
    return 100;
  }
  if (missionStack.length === 0) {
    return 0;
  }
  const normalizedProfile = profileStack.filter(Boolean).map((s) => s.toLowerCase());
  const matches = missionStack.filter((s) => s && normalizedProfile.includes(s.toLowerCase()));
  return (matches.length / missionStack.length) * 100;
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
