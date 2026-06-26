/**
 * TJM History Storage — IndexedDB persistence for TJM records.
 *
 * Shell module: handles I/O (IndexedDB operations).
 * Delegates computation to core/tjm-history pure functions.
 */
import type { Mission } from '../../core/types/mission';
import type { TJMRecord, TJMHistory } from '../../core/types/tjm';
import { addRecords, emptyHistory, extractRecords } from '../../core/tjm-history/index';

const STORAGE_KEY = 'tjm_history';

/**
 * Load the full TJM history from chrome.storage.local.
 * Returns empty history if nothing stored or data is corrupt.
 */
export const loadTJMHistory = async (): Promise<TJMHistory> => {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const raw = result[STORAGE_KEY];

  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as TJMHistory).records)) {
    return emptyHistory();
  }

  // Basic validation: ensure records have required fields
  const history = raw as TJMHistory;
  const validRecords = history.records.filter(
    (r: TJMRecord) =>
      typeof r.stack === 'string' &&
      typeof r.date === 'string' &&
      typeof r.min === 'number' &&
      typeof r.max === 'number' &&
      typeof r.average === 'number' &&
      typeof r.sampleCount === 'number'
  );

  // Migration: old records without seniority or region fields
  const migratedRecords = validRecords.map(
    (r: TJMRecord & { seniority?: unknown; region?: unknown }) => ({
      ...r,
      seniority: r.seniority ?? null,
      region: r.region ?? null,
    })
  );

  return { records: migratedRecords };
};

/**
 * Save the full TJM history to chrome.storage.local.
 */
export const saveTJMHistory = async (history: TJMHistory): Promise<void> => {
  await chrome.storage.local.set({ [STORAGE_KEY]: history });
};

/**
 * Extract TJM records from missions and merge them into the stored history.
 * Uses the provided date for the record date.
 *
 * @param missions - Missions to extract TJM data from
 * @param date - ISO 8601 date string for the records
 * @returns Updated history after merge
 */
export const recordTJMFromMissions = async (
  missions: Mission[],
  date: string
): Promise<TJMHistory> => {
  const history = await loadTJMHistory();
  const newRecords = extractRecords(missions, date);

  if (newRecords.length === 0) {
    return history;
  }

  const updated = addRecords(history, newRecords);
  await saveTJMHistory(updated);

  return updated;
};

/**
 * Clear all TJM history data.
 */
export const clearTJMHistory = async (): Promise<void> => {
  await chrome.storage.local.remove(STORAGE_KEY);
};
