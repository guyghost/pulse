import type { Mission } from '../../core/types/mission';
import type { UserProfile } from '../../core/types/profile';
import { parseMission, parseUserProfile } from '../../core/types/type-guards';

const DB_NAME = 'missionpulse';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('missions')) {
        const store = db.createObjectStore('missions', { keyPath: 'id' });
        store.createIndex('source', 'source', { unique: false });
        store.createIndex('scrapedAt', 'scrapedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('profile')) {
        db.createObjectStore('profile', { keyPath: 'id' });
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
  fn: (store: IDBObjectStore) => IDBRequest,
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
  const rawMissions = await withStore<unknown[]>('missions', 'readonly', (store) =>
    store.getAll()
  );

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
    console.warn(`[DB] ${invalidCount.value} missions corrompues ignorées sur ${rawMissions.length} totales`);
  }

  return validMissions;
}

export function clearMissions(): Promise<void> {
  return withStore<void>('missions', 'readwrite', (store) => store.clear());
}

// Profile
export async function saveProfile(profile: UserProfile): Promise<void> {
  await withStore<IDBValidKey>('profile', 'readwrite', (store) =>
    store.put({ ...profile, id: 'current' }),
  );
}

export async function getProfile(): Promise<UserProfile | null> {
  const result = await withStore<
    unknown
  >('profile', 'readonly', (store) => store.get('current'));

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
