import type { Mission } from '../types/mission';

export type MissionSortBy = 'date' | 'score' | 'tjm';

/**
 * Get the best available numeric score for sorting.
 * Uses scoreBreakdown.total if available, falls back to legacy score.
 */
const getMissionScore = (m: Mission): number =>
  m.scoreBreakdown?.total ?? m.semanticScore ?? m.score ?? 0;

/**
 * Numeric sort key for one mission under the chosen criterion (descending).
 * Centralized so it is computed exactly once per mission during sorting.
 */
const sortKey = (m: Mission, sortBy: MissionSortBy): number => {
  switch (sortBy) {
    case 'score':
      return getMissionScore(m);
    case 'tjm':
      return m.tjm ?? 0;
    case 'date':
    default:
      return m.scrapedAt instanceof Date ? m.scrapedAt.getTime() : 0;
  }
};

/**
 * Sort missions based on the specified criterion (descending).
 * Pure function — no I/O, no side effects; returns a new array (does not
 * mutate the input).
 *
 * Uses a Schwartzian transform (decorate-sort-undecorate): each mission's sort
 * key is precomputed once (O(n)), the decorated pairs are sorted by number,
 * then the missions are unwrapped. This avoids recomputing the key inside the
 * comparator — previously every one of the ~n·log(n) comparisons re-evaluated
 * a property chain (`scoreBreakdown?.total ?? semanticScore ?? score ?? 0`),
 * a `?? 0` coalesce, or an `instanceof Date` + `getTime()` pair. This is the
 * feed's reactive sort path (see `sortCurrentMissions` in feed-page state),
 * so it runs on every missions/filter/sort change.
 *
 * Output ordering is identical to the previous comparator-based implementation:
 * descending by key, and stable for equal keys (the host sort is stable).
 *
 * @param missions - Array of missions to sort
 * @param sortBy - Sort criterion: 'date' (newest first), 'score' (highest first), 'tjm' (highest first)
 * @returns New sorted array (does not mutate input)
 */
export const sortMissions = (missions: Mission[], sortBy: MissionSortBy): Mission[] => {
  const decorated = missions.map((m) => ({ mission: m, key: sortKey(m, sortBy) }));
  decorated.sort((a, b) => b.key - a.key);
  return decorated.map((d) => d.mission);
};
