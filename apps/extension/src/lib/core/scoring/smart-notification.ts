import type { Mission } from '../types/mission';

/**
 * Configuration for smart notification filtering.
 * Allows users to define precise criteria beyond a global score threshold.
 */
export interface SmartNotificationCriteria {
  /** Minimum score threshold (0-100). Default: 70 */
  scoreThreshold: number;
  /** Required stacks — mission must include at least one. Empty = no filter */
  requiredStacks: string[];
  /** Minimum TJM — mission must have tjm >= this value. 0 = no filter */
  minTJM: number;
  /** Maximum results per notification batch */
  maxResults: number;
}

export const DEFAULT_SMART_CRITERIA: SmartNotificationCriteria = {
  scoreThreshold: 70,
  requiredStacks: [],
  minTJM: 0,
  maxResults: 5,
};

/**
 * Returns the best available score for a mission.
 */
const bestScore = (mission: Mission): number | null => mission.semanticScore ?? mission.score;

/**
 * Filters missions using smart notification criteria.
 * Combines score threshold with stack and TJM requirements.
 *
 * Pure function — no I/O, no async, no side effects.
 *
 * @param missions - All missions from the scan
 * @param seenIds - IDs of already-seen missions
 * @param criteria - Smart notification criteria
 * @returns Sorted missions (highest score first) matching all criteria
 */
export const filterSmartNotifications = (
  missions: Mission[],
  seenIds: string[],
  criteria: SmartNotificationCriteria
): Mission[] => {
  const seenSet = new Set(seenIds);
  const requiredStacksLower = criteria.requiredStacks.filter(Boolean).map((s) => s.toLowerCase());

  return missions
    .filter((mission) => {
      if (seenSet.has(mission.id)) {
        return false;
      }

      const score = bestScore(mission);
      if (score === null || score < criteria.scoreThreshold) {
        return false;
      }

      // Stack filter: mission must contain at least one required stack
      if (requiredStacksLower.length > 0) {
        const missionStacksLower = mission.stack.filter(Boolean).map((s) => s.toLowerCase());
        const hasMatch = requiredStacksLower.some((req) => missionStacksLower.includes(req));
        if (!hasMatch) {
          return false;
        }
      }

      // TJM filter
      if (criteria.minTJM > 0) {
        if (mission.tjm === null || mission.tjm < criteria.minTJM) {
          return false;
        }
      }

      return true;
    })
    .sort((a, b) => (bestScore(b) ?? 0) - (bestScore(a) ?? 0))
    .slice(0, criteria.maxResults);
};
