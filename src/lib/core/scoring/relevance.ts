import type { Mission } from '../types/mission';
import type { UserProfile, ScoringWeights } from '../types/profile';
import { DEFAULT_SCORING_WEIGHTS } from '../types/profile';
import { matchLocation } from './location-matching';

/**
 * Score a mission's relevance to a user profile.
 *
 * The score is computed by evaluating four criteria:
 * - Stack matching: How well the mission's tech stack matches the profile
 * - Location: Whether the mission location matches the profile's location
 * - TJM: Whether the mission's daily rate falls within the profile's range
 * - Remote: Whether the remote policy matches the profile's preference
 *
 * @param mission - The mission to score
 * @param profile - The user profile to match against
 * @returns A score from 0-100 representing relevance
 */
export const scoreMission = (mission: Mission, profile: UserProfile): number => {
  const weights = profile.scoringWeights ?? DEFAULT_SCORING_WEIGHTS;
  const normalizedWeights = normalizeWeights(weights);

  const stackScore = scoreStack(mission.stack, profile.stack, normalizedWeights.stack);
  const locationScore = scoreLocation(
    mission.location,
    profile.location,
    normalizedWeights.location,
  );
  const tjmScore = scoreTJM(mission.tjm, profile.tjmMin, profile.tjmMax, normalizedWeights.tjm);
  const remoteScore = scoreRemote(mission.remote, profile.remote, normalizedWeights.remote);

  return Math.round(stackScore + locationScore + tjmScore + remoteScore);
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
 * Score stack matching based on how many mission technologies match the profile.
 * Returns a proportional score based on match ratio multiplied by the weight.
 * If the profile has no stack defined, returns full weight (doesn't penalize the user).
 */
const scoreStack = (
  missionStack: string[],
  profileStack: string[],
  weight: number,
): number => {
  // If profile has no stack, don't penalize - return full weight
  if (profileStack.length === 0) return weight;
  if (missionStack.length === 0) return 0;
  const normalizedProfile = profileStack.filter(Boolean).map((s) => s.toLowerCase());
  const matches = missionStack.filter((s) =>
    s && normalizedProfile.includes(s.toLowerCase()),
  );
  return (matches.length / missionStack.length) * weight;
};

/**
 * Score location matching using fuzzy matching.
 * - Exact match: full weight
 * - Synonym match (regional equivalents): 80% of weight
 * - Nearby match (same metropolitan area): 70% of weight
 * - Partial match (token-based): 60% of weight
 * - Unknown location: partial score (half of weight)
 * - No match: 0
 */
const scoreLocation = (
  missionLocation: string | null,
  profileLocation: string,
  weight: number,
): number => {
  if (!profileLocation) return weight;
  if (!missionLocation) return weight * 0.5;

  const match = matchLocation(missionLocation, profileLocation);

  switch (match) {
    case 'exact':
      return weight;
    case 'synonym':
      return weight * 0.8;
    case 'nearby':
      return weight * 0.7;
    case 'partial':
      return weight * 0.6;
    case 'none':
      return 0;
  }
};

/**
 * Score TJM (daily rate) matching.
 * - Within range: full weight
 * - Unknown TJM: partial score (roughly half)
 * - Outside range: scaled by distance from range
 */
const scoreTJM = (
  missionTjm: number | null,
  min: number,
  max: number,
  weight: number,
): number => {
  if (missionTjm === null) return weight * 0.48; // ~12/25 = 0.48
  if (missionTjm >= min && missionTjm <= max) return weight;
  const distance = missionTjm < min ? min - missionTjm : missionTjm - max;
  const rangeSize = max - min || 1;
  const ratio = Math.max(0, 1 - distance / rangeSize);
  return Math.round(ratio * weight);
};

/**
 * Score remote policy matching.
 * - Profile accepts any: full weight
 * - Unknown remote policy: partial score (~half)
 * - Exact match: full weight
 * - No match: 0
 */
const scoreRemote = (
  missionRemote: string | null,
  profileRemote: string,
  weight: number,
): number => {
  if (profileRemote === 'any') return weight;
  if (missionRemote === null) return weight * 0.467; // ~7/15 = 0.467
  return missionRemote === profileRemote ? weight : 0;
};
