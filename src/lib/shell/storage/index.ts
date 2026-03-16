/**
 * Point d'entrée unique pour le stockage shell.
 * Ré-exporte toutes les fonctions avec cache (db-with-cache) et les autres modules.
 */

// === Cache-enabled DB (usage recommandé) ===
export {
  // Fonctions avec cache
  getMissionsCached,
  getProfileCached,
  saveMissionsWithCacheInvalidation,
  saveProfileWithCacheInvalidation,
  clearMissionsWithCacheInvalidation,
  // Cache utilities
  getCached,
  setCached,
  invalidateCache,
  getCacheStats,
  resetCacheStats,
  clearCache,
  // Fonctions brutes (si besoin d'accès direct)
  saveMissions,
  clearMissions,
  saveProfile,
} from './db-with-cache';

// === Favorites & Hidden (chrome.storage.local) ===
export {
  getFavorites,
  saveFavorites,
  getHidden,
  saveHidden,
} from './favorites';

// === Seen Missions (chrome.storage.local) ===
export {
  getSeenIds,
  saveSeenIds,
} from './seen-missions';

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

// === Types du cache mémoire ===
export type {
  CacheEntry,
  CacheStats,
} from './db-cache';
