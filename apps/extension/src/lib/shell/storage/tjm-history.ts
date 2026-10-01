/**
 * TJM History Storage — local persistence for records and identifiable observations.
 *
 * Shell module: handles I/O (chrome.storage.local operations).
 * Delegates computation to core/tjm-history pure functions.
 */
import type { Mission } from '../../core/types/mission';
import type { TJMHistory } from '../../core/types/tjm';
import { addRecords, extractRecords } from '../../core/tjm-history/index';

import { addObservations, extractObservations } from '../../core/tjm-history/observations';
import { parseTJMHistory } from './tjm-schemas';

const STORAGE_KEY = 'tjm_history';

/**
 * Load the full TJM history from chrome.storage.local.
 * Returns empty history if nothing stored or data is corrupt.
 */
export const loadTJMHistory = async (): Promise<TJMHistory> => {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const raw = result[STORAGE_KEY];

  return parseTJMHistory(raw);
};

/**
 * Save the full TJM history to chrome.storage.local.
 */
export const saveTJMHistory = async (history: TJMHistory): Promise<void> => {
  await chrome.storage.local.set({ [STORAGE_KEY]: history });
};

/**
 * Persist legacy aggregates from feed winners and observations from source announcements.
 * Uses the provided date only for legacy records; observations keep their own scrape dates.
 *
 * @param missions - Feed winners used by the legacy aggregate history
 * @param date - ISO 8601 date string for the legacy records
 * @param sourceMissions - Eligible source announcements before heuristic feed deduplication
 * @returns Updated history after merge
 */
// Serialize local read-modify-write operations across overlapping scan effects.
let recordQueue: Promise<unknown> = Promise.resolve();
export const recordTJMFromMissions = (
  missions: Mission[],
  date: string,
  sourceMissions: Mission[] = missions
): Promise<TJMHistory> => {
  const operation = recordQueue.then(async () => {
    const history = await loadTJMHistory();
    const updated = addObservations(
      addRecords(history, extractRecords(missions, date)),
      extractObservations(sourceMissions)
    );
    await saveTJMHistory(updated);
    return updated;
  });
  recordQueue = operation.catch(() => undefined);
  return operation;
};

/**
 * Clear all TJM history data.
 */
export const clearTJMHistory = async (): Promise<void> => {
  await chrome.storage.local.remove(STORAGE_KEY);
};
