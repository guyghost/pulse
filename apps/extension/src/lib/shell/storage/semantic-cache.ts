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
    profile.stack
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
  `semantic-${buildProfileFingerprint(profile)}-${missionId}`;

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
  const now = Date.now();

  for (const [missionId, result] of results) {
    const key = buildCacheKey(missionId, profile);
    toStore[key] = {
      score: result.score,
      reason: result.reason,
      cachedAt: now,
    };
  }

  await chrome.storage.local.set(toStore);
};

/**
 * Remove expired entries from the semantic cache.
 * Should be called on extension startup.
 *
 * Scans all keys starting with "semantic-" and removes expired entries.
 */
/**
 * Clear ALL semantic cache entries.
 * Called when the user profile changes, so scores are recomputed
 * against the new profile on the next scan.
 */
export const clearSemanticCache = async (): Promise<void> => {
  const all = await chrome.storage.local.get(null);
  const keysToRemove = Object.keys(all).filter((key) => key.startsWith('semantic-'));

  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
  }
};

export const clearExpiredSemanticCache = async (): Promise<void> => {
  const all = await chrome.storage.local.get(null);
  const keysToRemove: string[] = [];

  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith('semantic-')) {
      continue;
    }

    const entry = value as SemanticCacheEntry;
    if (!isSemanticCacheValid(entry.cachedAt)) {
      keysToRemove.push(key);
    }
  }

  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
  }
};
