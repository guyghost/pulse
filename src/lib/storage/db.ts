import type { Mission } from '../core/types/mission';
import type { TJMDataPoint } from '../core/types/tjm';
import type { UserProfile } from '../core/types/profile';

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
      if (!db.objectStoreNames.contains('tjmHistory')) {
        const store = db.createObjectStore('tjmHistory', { autoIncrement: true });
        store.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('profile')) {
        db.createObjectStore('profile', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('tjmCache')) {
        db.createObjectStore('tjmCache', { keyPath: 'key' });
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

export function getMissions(): Promise<Mission[]> {
  return withStore<Mission[]>('missions', 'readonly', (store) => store.getAll());
}

export function clearMissions(): Promise<void> {
  return withStore<void>('missions', 'readwrite', (store) => store.clear());
}

// TJM History
export async function saveTJMDataPoint(point: TJMDataPoint): Promise<void> {
  await withStore<IDBValidKey>('tjmHistory', 'readwrite', (store) =>
    store.add(point),
  );
}

export function getTJMDataPoints(): Promise<TJMDataPoint[]> {
  return withStore<TJMDataPoint[]>('tjmHistory', 'readonly', (store) =>
    store.getAll(),
  );
}

// Profile
export async function saveProfile(profile: UserProfile): Promise<void> {
  await withStore<IDBValidKey>('profile', 'readwrite', (store) =>
    store.put({ ...profile, id: 'current' }),
  );
}

export async function getProfile(): Promise<UserProfile | null> {
  const result = await withStore<
    (UserProfile & { id: string }) | undefined
  >('profile', 'readonly', (store) => store.get('current'));
  if (!result) return null;
  const { id: _, ...profile } = result;
  return profile as UserProfile;
}
