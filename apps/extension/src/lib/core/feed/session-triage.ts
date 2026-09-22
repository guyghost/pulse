/**
 * Session triage progress & Inbox Zero calculation — Pure Core functions.
 *
 * Provides a rewarding feedback loop on the freelancer's daily review progress:
 * computes qualified ratio (seen, favorited, hidden) and detects when
 * all incoming missions have been processed (Inbox Zero).
 *
 * Functional Core: Zero I/O, zero async, strictly deterministic.
 */

import type { Mission } from '../types/mission';

export interface SessionTriageProgress {
  /** Total missions evaluated in the current scope */
  totalCount: number;
  /** Number of missions that have been qualified (seen, favorited, or hidden) */
  qualifiedCount: number;
  /** Number of remaining unseen missions */
  unseenCount: number;
  /** Progress percentage rounded to nearest integer (0 - 100) */
  percent: number;
  /** True when at least one mission exists and every mission has been qualified */
  isInboxZero: boolean;
  /** Count of favorited missions among the active missions */
  favoritesCount: number;
  /** Human-readable progress label in French (e.g. "8/12 qualifiées") */
  label: string;
}

function toIdSet(
  collection: readonly string[] | Set<string> | Record<string, unknown> | undefined | null
): Set<string> {
  if (!collection) {
    return new Set();
  }
  if (collection instanceof Set) {
    return collection;
  }
  if (Array.isArray(collection)) {
    return new Set(collection);
  }
  return new Set(Object.keys(collection));
}

/**
 * Computes the triage session progress and completion state without side effects.
 */
export function computeSessionTriageProgress(
  missions: readonly Mission[],
  seenIds: readonly string[] | Set<string> | undefined | null,
  favorites: readonly string[] | Set<string> | Record<string, unknown> | undefined | null,
  hidden: readonly string[] | Set<string> | Record<string, unknown> | undefined | null
): SessionTriageProgress {
  const totalCount = missions.length;
  if (totalCount === 0) {
    return {
      totalCount: 0,
      qualifiedCount: 0,
      unseenCount: 0,
      percent: 100,
      isInboxZero: false,
      favoritesCount: 0,
      label: '0/0 qualifiée',
    };
  }

  const seenSet = toIdSet(seenIds);
  const favSet = toIdSet(favorites);
  const hiddenSet = toIdSet(hidden);

  let qualifiedCount = 0;
  let favoritesCount = 0;

  for (const mission of missions) {
    const isSeen = seenSet.has(mission.id);
    const isFav = favSet.has(mission.id);
    const isHidden = hiddenSet.has(mission.id);

    if (isFav) {
      favoritesCount += 1;
    }

    if (isSeen || isFav || isHidden) {
      qualifiedCount += 1;
    }
  }

  const unseenCount = Math.max(0, totalCount - qualifiedCount);
  const percent = Math.min(100, Math.round((qualifiedCount / totalCount) * 100));
  const isInboxZero = totalCount > 0 && unseenCount === 0;

  const label = `${qualifiedCount}/${totalCount} qualifiée${qualifiedCount > 1 ? 's' : ''}`;

  return {
    totalCount,
    qualifiedCount,
    unseenCount,
    percent,
    isInboxZero,
    favoritesCount,
    label,
  };
}
