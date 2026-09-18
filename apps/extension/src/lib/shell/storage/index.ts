/**
 * Single entry point for shell storage.
 * Re-exports all storage functions.
 */

// === Favorites & Hidden (chrome.storage.local) ===
export { getFavorites, saveFavorites, getHidden, saveHidden } from './favorites';

// === Seen Missions (chrome.storage.local) ===
export { getSeenIds, saveSeenIds } from './seen-missions';

// === Review Journal — Time to review (chrome.storage.local) ===
export { getReviewJournal, journalFirstViews } from './review-journal';

// === Chrome Storage (Settings) ===
export { getSettings, setSettings, type AppSettings } from './chrome-storage';

// === Session Storage (temporary state) ===
export {
  getScanState,
  setScanState,
  getNewMissionCount,
  setNewMissionCount,
  resetNewMissionCount,
  type ScanState,
} from './session-storage';

// === Semantic Cache (scoring LLM) ===
export {
  getCachedSemanticScores,
  cacheSemanticScores,
  clearExpiredSemanticCache,
  isSemanticCacheValid,
} from './semantic-cache';
