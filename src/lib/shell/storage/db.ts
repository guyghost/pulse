import type { Mission, MissionSource } from '../../core/types/mission';
import type { PersistedConnectorStatus } from '../../core/types/connector-status';
import type { UserProfile } from '../../core/types/profile';
import { UserProfileSchema } from '../../core/types/schemas';
import { parseMission, parseUserProfile } from '../../core/types/type-guards';
import { clearSemanticCache } from './semantic-cache';

// ============================================================================
// Types for Pagination and Querying
// ============================================================================

export type MissionSortBy = 'date' | 'score' | 'tjm';

export interface PaginatedMissions {
  missions: Mission[];
  total: number;
  hasMore: boolean;
}

export interface PaginatedQueryOptions {
  page: number;
  pageSize: number;
  sortBy?: MissionSortBy;
  filterSource?: MissionSource;
}

const DB_NAME = 'missionpulse';
const DB_VERSION = 2;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;

      if (oldVersion < 1) {
        const store = db.createObjectStore('missions', { keyPath: 'id' });
        store.createIndex('source', 'source', { unique: false });
        store.createIndex('scrapedAt', 'scrapedAt', { unique: false });
        db.createObjectStore('profile', { keyPath: 'id' });
      }
      if (oldVersion < 2) {
        db.createObjectStore('connector_status', { keyPath: 'connectorId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Generic helper for store operations
function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  return openDB().then((db) => {
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const request = fn(store);
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
  });
}

// Missions
/**
 * Save missions to IndexedDB with deduplication.
 * Uses put() which is idempotent (insert or update).
 * Missions with the same ID are deduplicated before writing.
 */
export async function saveMissions(missions: Mission[]): Promise<void> {
  if (missions.length === 0) return;

  const db = await openDB();
  const tx = db.transaction('missions', 'readwrite');
  const store = tx.objectStore('missions');

  // Deduplicate by ID before writing
  const missionMap = new Map<string, Mission>();
  for (const mission of missions) {
    missionMap.set(mission.id, mission);
  }

  const uniqueMissions = Array.from(missionMap.values());

  for (const mission of uniqueMissions) {
    store.put(mission);
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      if (import.meta.env.DEV && uniqueMissions.length > 0) {
        const dedupedCount = missions.length - uniqueMissions.length;
        if (dedupedCount > 0) {
          console.log(
            `[DB] Saved ${uniqueMissions.length} missions (${dedupedCount} duplicates deduped)`
          );
        }
      }
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMissions(): Promise<Mission[]> {
  // Use paginated query with large page size for backwards compatibility
  const result = await getMissionsPaginated({
    page: 0,
    pageSize: 10000,
    sortBy: 'date',
  });
  return result.missions;
}

// ============================================================================
// Optimized Query Functions
// ============================================================================

/**
 * Get the total count of missions without loading all data into memory.
 * Uses store.count() which is much faster than getAll().length for large datasets.
 */
export async function getMissionCount(): Promise<number> {
  return withStore<number>('missions', 'readonly', (store) => store.count());
}

/**
 * Get missions for a specific source using the source index.
 * Efficient filtered query that doesn't load all missions.
 */
export async function getMissionsBySource(source: MissionSource): Promise<Mission[]> {
  const db = await openDB();
  const tx = db.transaction('missions', 'readonly');
  const store = tx.objectStore('missions');
  const index = store.index('source');

  return new Promise((resolve, reject) => {
    const request = index.getAll(source);
    request.onsuccess = () => {
      const rawMissions = request.result as unknown[];
      const validMissions: Mission[] = [];

      for (const raw of rawMissions) {
        const mission = parseMission(raw);
        if (mission) {
          validMissions.push(mission);
        }
      }

      resolve(validMissions);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get recent missions within a time window using the scrapedAt index.
 * Uses IDBKeyRange for efficient filtered query.
 * @param maxAgeDays Maximum age in days
 */
export async function getRecentMissions(maxAgeDays: number): Promise<Mission[]> {
  const db = await openDB();
  const tx = db.transaction('missions', 'readonly');
  const store = tx.objectStore('missions');
  const index = store.index('scrapedAt');

  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const range = IDBKeyRange.lowerBound(cutoff);

  return new Promise((resolve, reject) => {
    const request = index.getAll(range);
    request.onsuccess = () => {
      const rawMissions = request.result as unknown[];
      const validMissions: Mission[] = [];

      for (const raw of rawMissions) {
        const mission = parseMission(raw);
        if (mission) {
          validMissions.push(mission);
        }
      }

      resolve(validMissions);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get missions with cursor-based pagination and optional filtering/sorting.
 * Efficient for large datasets as it doesn't load all missions into memory.
 *
 * @param options Pagination options:
 *   - page: 0-indexed page number
 *   - pageSize: Number of items per page
 *   - sortBy: 'date' (default), 'score', or 'tjm'
 *   - filterSource: Optional source filter
 *
 * @returns PaginatedMissions with missions, total count, and hasMore flag
 */
export async function getMissionsPaginated(
  options: PaginatedQueryOptions
): Promise<PaginatedMissions> {
  const { page, pageSize, sortBy = 'date', filterSource } = options;

  const db = await openDB();
  const tx = db.transaction('missions', 'readonly');
  const store = tx.objectStore('missions');

  // Get total count first
  const totalRequest = store.count();
  const totalCount = await new Promise<number>((resolve, reject) => {
    totalRequest.onsuccess = () => resolve(totalRequest.result);
    totalRequest.onerror = () => reject(totalRequest.error);
  });

  // Fetch all missions (we need to sort in memory for score/tjm)
  // For date sorting with source filter, we can use index
  let rawMissions: unknown[];

  if (filterSource) {
    const index = store.index('source');
    rawMissions = await new Promise<unknown[]>((resolve, reject) => {
      const request = index.getAll(filterSource);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } else {
    rawMissions = await new Promise<unknown[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Parse and validate missions
  const validMissions: Mission[] = [];
  for (const raw of rawMissions) {
    const mission = parseMission(raw);
    if (mission) {
      validMissions.push(mission);
    }
  }

  // Sort missions
  const sortedMissions = sortMissions(validMissions, sortBy);

  // Paginate
  const startIndex = page * pageSize;
  const paginatedMissions = sortedMissions.slice(startIndex, startIndex + pageSize);
  const hasMore = startIndex + pageSize < sortedMissions.length;

  return {
    missions: paginatedMissions,
    total: filterSource ? sortedMissions.length : totalCount,
    hasMore,
  };
}

/**
 * Sort missions based on the specified criteria.
 * Pure function (core logic).
 */
const sortMissions = (missions: Mission[], sortBy: MissionSortBy): Mission[] => {
  const sorted = [...missions];

  switch (sortBy) {
    case 'score':
      return sorted.sort((a, b) => {
        const scoreA = a.semanticScore ?? a.score ?? 0;
        const scoreB = b.semanticScore ?? b.score ?? 0;
        return scoreB - scoreA; // Descending (highest first)
      });

    case 'tjm':
      return sorted.sort((a, b) => {
        const tjmA = a.tjm ?? 0;
        const tjmB = b.tjm ?? 0;
        return tjmB - tjmA; // Descending (highest first)
      });

    case 'date':
    default:
      return sorted.sort((a, b) => {
        const dateA = a.scrapedAt instanceof Date ? a.scrapedAt.getTime() : 0;
        const dateB = b.scrapedAt instanceof Date ? b.scrapedAt.getTime() : 0;
        return dateB - dateA; // Descending (newest first)
      });
  }
};

/**
 * Batch upsert missions with deduplication.
 * Uses put() which is idempotent (insert or update).
 * Only writes missions that are new or have changed.
 */
export async function upsertMissions(newMissions: Mission[]): Promise<number> {
  if (newMissions.length === 0) return 0;

  const db = await openDB();
  const tx = db.transaction('missions', 'readwrite');
  const store = tx.objectStore('missions');

  // Deduplicate by ID
  const missionMap = new Map<string, Mission>();
  for (const mission of newMissions) {
    missionMap.set(mission.id, mission);
  }

  const uniqueMissions = Array.from(missionMap.values());
  let writtenCount = 0;

  return new Promise((resolve, reject) => {
    for (const mission of uniqueMissions) {
      store.put(mission);
      writtenCount++;
    }

    tx.oncomplete = () => {
      if (import.meta.env.DEV && writtenCount > 0) {
        console.log(
          `[DB] Upserted ${writtenCount} missions (${newMissions.length - uniqueMissions.length} duplicates deduped)`
        );
      }
      resolve(writtenCount);
    };

    tx.onerror = () => reject(tx.error);
  });
}

export function clearMissions(): Promise<void> {
  return withStore<void>('missions', 'readwrite', (store) => store.clear());
}

// Profile
export async function saveProfile(profile: UserProfile): Promise<void> {
  const result = UserProfileSchema.safeParse(profile);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message).join(', ');
    throw new Error(`[DB] Profil invalide : ${messages}`);
  }

  await withStore<IDBValidKey>('profile', 'readwrite', (store) =>
    store.put({ ...profile, id: 'current' })
  );

  // Invalider le cache sémantique : les scores doivent être recalculés avec le nouveau profil
  try {
    await clearSemanticCache();
  } catch {
    // Le cache est non-critique, on ne bloque pas la sauvegarde du profil
    console.warn('[DB] Impossible de vider le cache sémantique après sauvegarde du profil');
  }
}

export async function getProfile(): Promise<UserProfile | null> {
  const result = await withStore<unknown>('profile', 'readonly', (store) => store.get('current'));

  if (!result) return null;

  // Vérifier que c'est un objet avec un id
  if (typeof result !== 'object' || result === null) {
    console.error('[DB] Profil corrompu: données non-objet', result);
    return null;
  }

  // Extraire l'id et le reste des propriétés
  const { id: _, ...profileData } = result as Record<string, unknown>;

  // Valider avec Zod
  const profile = parseUserProfile(profileData);

  if (!profile) {
    console.error('[DB] Profil invalide détecté dans IndexedDB:', profileData);
    return null;
  }

  return profile;
}

// Connector Statuses
export async function saveConnectorStatuses(statuses: PersistedConnectorStatus[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('connector_status', 'readwrite');
  const store = tx.objectStore('connector_status');
  for (const status of statuses) {
    store.put(status);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getConnectorStatuses(): Promise<PersistedConnectorStatus[]> {
  return withStore<PersistedConnectorStatus[]>('connector_status', 'readonly', (store) =>
    store.getAll()
  );
}

export async function clearConnectorStatuses(): Promise<void> {
  return withStore<void>('connector_status', 'readwrite', (store) => store.clear());
}

/**
 * Purge missions older than the specified number of days (based on scrapedAt)
 * @param maxAgeDays Maximum age in days (default: 90)
 * @returns Number of missions purged
 */
export async function purgeOldMissions(maxAgeDays = 90): Promise<number> {
  const db = await openDB();
  const tx = db.transaction('missions', 'readwrite');
  const store = tx.objectStore('missions');
  const index = store.index('scrapedAt');

  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const range = IDBKeyRange.upperBound(cutoff);

  return new Promise((resolve, reject) => {
    const request = index.openCursor(range);
    let purged = 0;

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        purged++;
        cursor.continue();
      } else {
        // All done
        resolve(purged);
      }
    };

    request.onerror = () => {
      reject(request.error);
    };

    tx.oncomplete = () => {
      if (purged > 0 && import.meta.env.DEV) {
        console.log(`[DB] Purged ${purged} missions older than ${maxAgeDays} days`);
      }
    };

    tx.onerror = () => {
      reject(tx.error);
    };
  });
}
