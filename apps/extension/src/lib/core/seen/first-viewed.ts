/**
 * Journal de première consultation (voir src/models/time-to-review.model.md).
 * Pur : aucune I/O, aucune horloge — les horodatages arrivent en ISO du shell.
 */

export interface FirstViewedEntry {
  /** ISO 8601 de la première consultation (vue dans le feed). */
  firstViewedAt: string;
  /**
   * Snapshot ISO de Mission.scrapedAt pris au moment du journaling, pour que
   * le journal reste autoportant si la mission est purgée de l'IndexedDB.
   */
  capturedAt: string | null;
}

export type ReviewJournal = Record<string, FirstViewedEntry>;

export interface FirstViewedEntryInput {
  missionId: string;
  viewedAt: string;
  capturedAt: string | null;
}

/**
 * Maximum number of journaled first views to retain.
 * Aligned with MAX_SEEN_IDS (shell/storage/seen-missions.ts).
 */
export const MAX_REVIEW_JOURNAL = 2000;

/** Coerces a runtime date value (Date ou string ISO post-bridge) en ISO, sinon null. */
export function coerceIso(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

/**
 * First-write-wins : la première consultation d'une mission n'est jamais écrasée.
 * Déterministe (ordre d'insertion), plafonné à MAX_REVIEW_JOURNAL.
 */
export function mergeFirstViewed(
  current: ReviewJournal,
  entries: FirstViewedEntryInput[]
): ReviewJournal {
  let changed = false;
  const merged: ReviewJournal = { ...current };
  for (const entry of entries) {
    if (entry.missionId in merged) {
      continue;
    }
    merged[entry.missionId] = { firstViewedAt: entry.viewedAt, capturedAt: entry.capturedAt };
    changed = true;
  }
  if (!changed) {
    return current;
  }
  return capReviewJournal(merged);
}

/** Plafonne le journal en évinçant les consultations les plus anciennes. */
export function capReviewJournal(
  journal: ReviewJournal,
  limit: number = MAX_REVIEW_JOURNAL
): ReviewJournal {
  const ids = Object.keys(journal);
  if (ids.length <= limit) {
    return journal;
  }

  const sortedIds = ids.sort((a, b) => {
    const aTime = journal[a].firstViewedAt;
    const bTime = journal[b].firstViewedAt;
    if (aTime < bTime) {
      return -1;
    }
    if (aTime > bTime) {
      return 1;
    }
    return 0;
  });
  const keptIds = sortedIds.slice(ids.length - limit);
  const capped: ReviewJournal = {};
  for (const id of keptIds) {
    capped[id] = journal[id];
  }
  return capped;
}
