/**
 * Classification cache — chrome.storage.local persistence for Jev
 * classifications.
 *
 * Mirrors the semantic-cache pattern: 7-day TTL, capped entry count, index
 * key fallback for storage areas without `getKeys`. Unlike semantic scores,
 * classifications are profile-INDEPENDENT — invalidation is driven by the
 * mission content fingerprint, not by profile changes.
 */

import type { MissionClassification } from '../../core/types/mission-classification';
import type { Mission } from '../../core/types/mission';
import { buildMissionContentFingerprint } from '../../core/classification/fingerprint';

interface ClassificationCacheEntry {
  classification: MissionClassification;
  /** Fingerprint of the classified content — mismatch means stale entry. */
  fingerprint: string;
  cachedAt: number;
}

/** Same TTL and volume bounds as the semantic cache. */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_KEY_PREFIX = 'classification-';
const CACHE_INDEX_KEY = 'classification-cache-index';
const CACHE_REMOVE_BATCH_SIZE = 100;
export const MAX_CLASSIFICATION_CACHE_ENTRIES = 1000;

type StorageAreaWithGetKeys = chrome.storage.StorageArea & {
  getKeys?: () => Promise<string[]>;
};

export interface ClassificationCacheInput {
  id: string;
  fingerprint: string;
}

export interface ClassificationCacheWrite extends ClassificationCacheInput {
  classification: MissionClassification;
}

const isClassificationCacheKey = (key: string): boolean =>
  key.startsWith(CACHE_KEY_PREFIX) && key !== CACHE_INDEX_KEY;

const keyFor = (missionId: string): string => `${CACHE_KEY_PREFIX}${missionId}`;

const readCacheIndex = async (): Promise<string[]> => {
  const stored = await chrome.storage.local.get(CACHE_INDEX_KEY);
  const rawIndex = stored[CACHE_INDEX_KEY];

  if (!Array.isArray(rawIndex)) {
    return [];
  }

  return rawIndex.filter(
    (key): key is string => typeof key === 'string' && isClassificationCacheKey(key)
  );
};

const writeCacheIndex = async (keys: string[]): Promise<void> => {
  await chrome.storage.local.set({ [CACHE_INDEX_KEY]: keys });
};

const listClassificationCacheKeys = async (): Promise<string[]> => {
  const storage = chrome.storage.local as StorageAreaWithGetKeys;
  if (typeof storage.getKeys === 'function') {
    const keys = await storage.getKeys();
    return keys.filter(isClassificationCacheKey);
  }

  return readCacheIndex();
};

const removeKeysInBatches = async (keys: string[]): Promise<void> => {
  for (let offset = 0; offset < keys.length; offset += CACHE_REMOVE_BATCH_SIZE) {
    await chrome.storage.local.remove(keys.slice(offset, offset + CACHE_REMOVE_BATCH_SIZE));
  }
};

const isEntryValid = (entry: ClassificationCacheEntry): boolean =>
  Date.now() - entry.cachedAt < CACHE_TTL_MS;

/**
 * Retrieve cached classifications for the given missions. An entry is
 * returned only when it is inside the TTL AND its fingerprint matches the
 * mission's current content (otherwise the cached value describes an older
 * version of the mission).
 */
export const getCachedClassifications = async (
  missions: readonly ClassificationCacheInput[]
): Promise<Map<string, MissionClassification>> => {
  const results = new Map<string, MissionClassification>();

  if (missions.length === 0) {
    return results;
  }

  const keys = missions.map((mission) => keyFor(mission.id));
  const stored = await chrome.storage.local.get(keys);

  for (let i = 0; i < missions.length; i++) {
    const entry = stored[keys[i]] as ClassificationCacheEntry | undefined;

    if (!entry || !isEntryValid(entry) || entry.fingerprint !== missions[i].fingerprint) {
      continue;
    }

    results.set(missions[i].id, entry.classification);
  }

  return results;
};

/**
 * Store classifications in the cache, evicting the oldest entries beyond
 * `MAX_CLASSIFICATION_CACHE_ENTRIES` (same policy as the semantic cache).
 */
export const cacheClassifications = async (
  missions: readonly ClassificationCacheWrite[]
): Promise<void> => {
  if (missions.length === 0) {
    return;
  }

  const toStore: Record<string, ClassificationCacheEntry> = {};
  const cacheKeys: string[] = [];
  const now = Date.now();

  for (const mission of missions) {
    const key = keyFor(mission.id);
    cacheKeys.push(key);
    toStore[key] = {
      classification: mission.classification,
      fingerprint: mission.fingerprint,
      cachedAt: now,
    };
  }

  await chrome.storage.local.set(toStore);

  const indexedKeys = await readCacheIndex();
  const cachedKeySet = new Set(cacheKeys);
  const nextKeys = [...indexedKeys.filter((key) => !cachedKeySet.has(key)), ...cacheKeys];
  const overflowCount = Math.max(0, nextKeys.length - MAX_CLASSIFICATION_CACHE_ENTRIES);
  const overflowKeys = nextKeys.slice(0, overflowCount);
  const retainedKeys = nextKeys.slice(overflowCount);

  if (overflowKeys.length > 0) {
    await removeKeysInBatches(overflowKeys);
  }
  await writeCacheIndex(retainedKeys);
};

/** Convenience wrapper: fingerprint computed from the mission content. */
export const buildCacheInput = (
  mission: Pick<Mission, 'id' | 'title' | 'description' | 'stack'>
): ClassificationCacheInput => ({
  id: mission.id,
  fingerprint: buildMissionContentFingerprint(mission),
});

/** Remove ALL classification cache entries. */
export const clearClassificationCache = async (): Promise<void> => {
  const keysToRemove = await listClassificationCacheKeys();

  if (keysToRemove.length > 0) {
    await removeKeysInBatches(keysToRemove);
  }
  await writeCacheIndex([]);
};

/** Remove only expired entries; called on extension startup. */
export const clearExpiredClassificationCache = async (): Promise<void> => {
  const keys = await listClassificationCacheKeys();
  const stored = keys.length > 0 ? await chrome.storage.local.get(keys) : {};
  const keysToRemove: string[] = [];

  for (const [key, value] of Object.entries(stored)) {
    const entry = value as ClassificationCacheEntry;
    if (!entry || !isEntryValid(entry)) {
      keysToRemove.push(key);
    }
  }

  if (keysToRemove.length > 0) {
    await removeKeysInBatches(keysToRemove);
    const removeSet = new Set(keysToRemove);
    await writeCacheIndex((await readCacheIndex()).filter((key) => !removeSet.has(key)));
  }
};
