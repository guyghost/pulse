import type { Mission } from '../../core/types/mission';
import type { PersistedConnectorStatus } from '../../core/types/connector-status';
import type { UserProfile } from '../../core/types/profile';
import { UserProfileSchema } from '../../core/types/schemas';
import { parseMission, parseUserProfile } from '../../core/types/type-guards';
import { clearSemanticCache } from './semantic-cache';

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
export async function saveMissions(missions: Mission[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('missions', 'readwrite');
  const store = tx.objectStore('missions');
  for (const mission of missions) {
    store.put(mission);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMissions(): Promise<Mission[]> {
  const rawMissions = await withStore<unknown[]>('missions', 'readonly', (store) => store.getAll());

  const validMissions: Mission[] = [];
  const invalidCount = { value: 0 };

  for (const raw of rawMissions) {
    const mission = parseMission(raw);
    if (mission) {
      validMissions.push(mission);
    } else {
      invalidCount.value++;
      console.error('[DB] Mission invalide détectée dans IndexedDB:', raw);
    }
  }

  if (invalidCount.value > 0) {
    console.warn(
      `[DB] ${invalidCount.value} missions corrompues ignorées sur ${rawMissions.length} totales`
    );
  }

  return validMissions;
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
