/**
 * Point d'entrée unique pour le stockage shell.
 * Ré-exporte toutes les fonctions de stockage.
 */

// === Favorites & Hidden (chrome.storage.local) ===
export { getFavorites, saveFavorites, getHidden, saveHidden } from './favorites';

// === Seen Missions (chrome.storage.local) ===
export { getSeenIds, saveSeenIds } from './seen-missions';

// === Chrome Storage (Settings, API Key) ===
export {
  getApiKey,
  setApiKey,
  removeApiKey,
  getSettings,
  setSettings,
  type AppSettings,
} from './chrome-storage';

// === Session Storage (état temporaire) ===
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
