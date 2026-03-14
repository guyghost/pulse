import type { Mission } from '../types/mission';

/**
 * Filters missions that should trigger a notification.
 * 
 * A mission is notifiable if:
 * 1. It's not in the list of already seen IDs
 * 2. It has a score >= the threshold
 * 
 * Pure function: no I/O, no async, no side effects.
 * 
 * @param missions - All missions from the scan
 * @param seenIds - IDs of missions the user has already seen
 * @param scoreThreshold - Minimum score to trigger notification (0-100)
 * @returns Missions sorted by score (highest first) that meet notification criteria
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
      
      // Must have a score
      if (mission.score === null) return false;
      
      // Score must meet threshold
      return mission.score >= scoreThreshold;
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
};
