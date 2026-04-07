import type { Mission } from '../types/mission';

export type MissionSortBy = 'date' | 'score' | 'tjm';

/**
 * Sort missions based on the specified criteria.
 * Pure function — no I/O, no side effects.
 *
 * @param missions - Array of missions to sort
 * @param sortBy - Sort criterion: 'date' (newest first), 'score' (highest first), 'tjm' (highest first)
 * @returns New sorted array (does not mutate input)
 */
export const sortMissions = (missions: Mission[], sortBy: MissionSortBy): Mission[] => {
  const sorted = [...missions];

  switch (sortBy) {
    case 'score':
      return sorted.sort((a, b) => {
        const scoreA = a.semanticScore ?? a.score ?? 0;
        const scoreB = b.semanticScore ?? b.score ?? 0;
        return scoreB - scoreA;
      });

    case 'tjm':
      return sorted.sort((a, b) => {
        const tjmA = a.tjm ?? 0;
        const tjmB = b.tjm ?? 0;
        return tjmB - tjmA;
      });

    case 'date':
    default:
      return sorted.sort((a, b) => {
        const dateA = a.scrapedAt instanceof Date ? a.scrapedAt.getTime() : 0;
        const dateB = b.scrapedAt instanceof Date ? b.scrapedAt.getTime() : 0;
        return dateB - dateA;
      });
  }
};
