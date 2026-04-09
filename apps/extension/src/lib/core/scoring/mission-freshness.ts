/**
 * Mission freshness filter — Pure functions.
 *
 * Filters out missions that are too old (likely filled or cancelled).
 * Uses the `publishedAt` date from the source platform.
 *
 * This is a SOFT filter: missions without a `publishedAt` date are kept,
 * because we can't determine their age.
 */

import type { Mission } from '../types/mission';

/** Default maximum age in days before a mission is considered stale */
export const DEFAULT_MAX_AGE_DAYS = 30;

/**
 * Check if a single mission is still fresh enough to display.
 * PURE FUNCTION — no I/O, no side effects.
 *
 * @param mission - The mission to check
 * @param now - Current date (injected)
 * @param maxAgeDays - Maximum age in days (default: 30)
 * @returns true if the mission is fresh or has no publishedAt date
 */
export function isMissionFresh(
  mission: Mission,
  now: Date,
  maxAgeDays: number = DEFAULT_MAX_AGE_DAYS
): boolean {
  if (!mission.publishedAt) {
    return true; // No date → can't determine age → keep
  }

  const publishedDate = new Date(mission.publishedAt);
  if (isNaN(publishedDate.getTime())) {
    return true; // Invalid date → keep
  }

  const ageMs = now.getTime() - publishedDate.getTime();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  return ageMs <= maxAgeMs;
}

/**
 * Filter an array of missions to only keep fresh ones.
 * PURE FUNCTION — no I/O, no side effects.
 *
 * @param missions - Array of missions to filter
 * @param now - Current date (injected)
 * @param maxAgeDays - Maximum age in days (default: 30)
 * @returns Filtered array with only fresh missions
 */
export function filterStaleMissions(
  missions: Mission[],
  now: Date,
  maxAgeDays: number = DEFAULT_MAX_AGE_DAYS
): Mission[] {
  return missions.filter((m) => isMissionFresh(m, now, maxAgeDays));
}
