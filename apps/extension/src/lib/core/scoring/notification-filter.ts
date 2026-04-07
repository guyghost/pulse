import type { Mission } from '../types/mission';

/**
 * Returns the best available score for a mission.
 * Prefers semantic score (more accurate) over basic score.
 * Pure function.
 */
const bestScore = (mission: Mission): number | null => mission.semanticScore ?? mission.score;

/**
 * Filters missions that should trigger a notification.
 *
 * A mission is notifiable if:
 * 1. It's not in the list of already seen IDs
 * 2. It has a score >= the threshold (semantic score preferred)
 *
 * Pure function: no I/O, no async, no side effects.
 *
 * @param missions - All missions from the scan
 * @param seenIds - IDs of missions the user has already seen
 * @param scoreThreshold - Minimum score to trigger notification (0-100)
 * @returns Missions sorted by best score (highest first) that meet notification criteria
 */
export const filterNotifiableMissions = (
  missions: Mission[],
  seenIds: string[],
  scoreThreshold: number
): Mission[] => {
  const seenSet = new Set(seenIds);

  return missions
    .filter((mission) => {
      // Must not have been seen
      if (seenSet.has(mission.id)) return false;

      // Must have a score (basic or semantic)
      const score = bestScore(mission);
      if (score === null) return false;

      // Score must meet threshold
      return score >= scoreThreshold;
    })
    .sort((a, b) => (bestScore(b) ?? 0) - (bestScore(a) ?? 0));
};
