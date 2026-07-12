import type { SemanticResult } from '../../core/scoring/semantic-scoring';
import type { UserProfile } from '../../core/types/profile';

/**
 * Cache entry structure for semantic scores.
 */
interface SemanticCacheEntry {
  score: number;
  reason: string;
  cachedAt: number;
}

/**
 * Cache TTL: 7 days in milliseconds.
 * Semantic scores are less volatile than TJM data.
 */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_KEY_PREFIX = 'semantic-';
const CACHE_INDEX_KEY = 'semantic-cache-index';
const CACHE_REMOVE_BATCH_SIZE = 100;

/**
 * Expected upper bound for semantic cache entries.
 *
 * Chrome storage.local is limited to 10 MB by default. At this cap, even
 * 2 KB entries stay under roughly 20% of that quota, leaving room for
 * settings, seen IDs, alerts and other local extension state.
 */
export const MAX_SEMANTIC_CACHE_ENTRIES = 1000;

type StorageAreaWithGetKeys = chrome.storage.StorageArea & {
  getKeys?: () => Promise<string[]>;
};

/**
 * Normalize free text to a stable cache key fragment.
 */
const normalizeKeyPart = (value: string | number): string =>
  String(value).trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Build a stable fingerprint for the profile fields used by the semantic prompt.
 */
const buildProfileFingerprint = (profile: UserProfile): string =>
  [
    normalizeKeyPart(profile.jobTitle),
    profile.keywords
      .filter(Boolean)
      .map((item) => normalizeKeyPart(item))
      .sort()
      .join(','),
    normalizeKeyPart(profile.tjmMin),
    normalizeKeyPart(profile.tjmMax),
    normalizeKeyPart(profile.location),
    normalizeKeyPart(profile.remote),
    normalizeKeyPart(profile.seniority),
  ].join('|');

/**
 * Build the storage key for a mission's semantic score.
 */
const buildCacheKey = (missionId: string, profile: UserProfile): string =>
  `${CACHE_KEY_PREFIX}${buildProfileFingerprint(profile)}-${missionId}`;

const isSemanticCacheKey = (key: string): boolean =>
  key.startsWith(CACHE_KEY_PREFIX) && key !== CACHE_INDEX_KEY;

const readCacheIndex = async (): Promise<string[]> => {
  const stored = await chrome.storage.local.get(CACHE_INDEX_KEY);
  const rawIndex = stored[CACHE_INDEX_KEY];

  if (!Array.isArray(rawIndex)) {
    return [];
  }

  return rawIndex.filter(
    (key): key is string => typeof key === 'string' && isSemanticCacheKey(key)
  );
};

const writeCacheIndex = async (keys: string[]): Promise<void> => {
  await chrome.storage.local.set({ [CACHE_INDEX_KEY]: keys });
};

const listSemanticCacheKeys = async (): Promise<string[]> => {
  const storage = chrome.storage.local as StorageAreaWithGetKeys;
  if (typeof storage.getKeys === 'function') {
    const keys = await storage.getKeys();
    return keys.filter(isSemanticCacheKey);
  }

  return readCacheIndex();
};

const removeKeysInBatches = async (keys: string[]): Promise<void> => {
  for (let offset = 0; offset < keys.length; offset += CACHE_REMOVE_BATCH_SIZE) {
    await chrome.storage.local.remove(keys.slice(offset, offset + CACHE_REMOVE_BATCH_SIZE));
  }
};

const removeKeysFromIndex = async (keysToRemove: string[]): Promise<void> => {
  if (keysToRemove.length === 0) {
    return;
  }

  const removeSet = new Set(keysToRemove);
  const indexedKeys = await readCacheIndex();
  await writeCacheIndex(indexedKeys.filter((key) => !removeSet.has(key)));
};

/**
 * Check if a cache entry is still valid based on TTL.
 */
export const isSemanticCacheValid = (cachedAt: number): boolean =>
  Date.now() - cachedAt < CACHE_TTL_MS;

/**
 * Retrieve cached semantic scores for a list of mission IDs.
 * Only returns entries that are still within the TTL.
 *
 * @param missionIds List of mission IDs to look up.
 * @returns Map of mission ID to SemanticResult for valid cache entries.
 */
export const getCachedSemanticScores = async (
  missionIds: string[],
  profile: UserProfile
): Promise<Map<string, SemanticResult>> => {
  const results = new Map<string, SemanticResult>();

  if (missionIds.length === 0) {
    return results;
  }

  const keys = missionIds.map((missionId) => buildCacheKey(missionId, profile));
  const stored = await chrome.storage.local.get(keys);

  for (const missionId of missionIds) {
    const key = buildCacheKey(missionId, profile);
    const entry = stored[key] as SemanticCacheEntry | undefined;

    if (!entry) {
      continue;
    }
    if (!isSemanticCacheValid(entry.cachedAt)) {
      continue;
    }

    results.set(missionId, {
      score: entry.score,
      reason: entry.reason,
    });
  }

  return results;
};

/**
 * Store semantic scores in the cache.
 *
 * @param results Map of mission ID to SemanticResult to cache.
 */
export const cacheSemanticScores = async (
  results: Map<string, SemanticResult>,
  profile: UserProfile
): Promise<void> => {
  if (results.size === 0) {
    return;
  }

  const toStore: Record<string, SemanticCacheEntry> = {};
  const cacheKeys: string[] = [];
  const now = Date.now();

  for (const [missionId, result] of results) {
    const key = buildCacheKey(missionId, profile);
    cacheKeys.push(key);
    toStore[key] = {
      score: result.score,
      reason: result.reason,
      cachedAt: now,
    };
  }

  await chrome.storage.local.set(toStore);

  const indexedKeys = await readCacheIndex();
  // O(1) membership lookup instead of O(n) Array.includes inside the filter —
  // meaningful once the index approaches MAX_SEMANTIC_CACHE_ENTRIES.
  const cachedKeySet = new Set(cacheKeys);
  const nextKeys = [...indexedKeys.filter((key) => !cachedKeySet.has(key)), ...cacheKeys];
  const overflowCount = Math.max(0, nextKeys.length - MAX_SEMANTIC_CACHE_ENTRIES);
  const overflowKeys = nextKeys.slice(0, overflowCount);
  const retainedKeys = nextKeys.slice(overflowCount);

  if (overflowKeys.length > 0) {
    await removeKeysInBatches(overflowKeys);
  }
  await writeCacheIndex(retainedKeys);
};

/**
 * Remove expired entries from the semantic cache.
 * Should be called on extension startup.
 *
 * Scans indexed semantic cache keys and removes expired entries by batch.
 */
/**
 * Clear ALL semantic cache entries.
 * Called when the user profile changes, so scores are recomputed
 * against the new profile on the next scan.
 */
export const clearSemanticCache = async (): Promise<void> => {
  const keysToRemove = await listSemanticCacheKeys();

  if (keysToRemove.length > 0) {
    await removeKeysInBatches(keysToRemove);
  }
  await writeCacheIndex([]);
};

export const clearExpiredSemanticCache = async (): Promise<void> => {
  const keys = await listSemanticCacheKeys();
  const stored = keys.length > 0 ? await chrome.storage.local.get(keys) : {};
  const keysToRemove: string[] = [];

  for (const [key, value] of Object.entries(stored)) {
    const entry = value as SemanticCacheEntry;
    if (!entry || !isSemanticCacheValid(entry.cachedAt)) {
      keysToRemove.push(key);
    }
  }

  if (keysToRemove.length > 0) {
    await removeKeysInBatches(keysToRemove);
    await removeKeysFromIndex(keysToRemove);
  }
};
