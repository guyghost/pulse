/**
 * Tracking persistence — IndexedDB storage for mission tracking records.
 *
 * Shell module: I/O operations, async.
 */

import type { MissionTracking } from '../../core/types/tracking';
import type { ApplicationStatus } from '../../core/types/tracking';

const DB_NAME = 'missionpulse';
const TRACKING_STORE = 'mission_tracking';

/**
 * Open (or create) the tracking object store.
 * Adds the 'mission_tracking' store if it doesn't exist yet (DB version upgrade).
 */
function openDBWithTracking(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);

    request.onsuccess = () => {
      const db = request.result;

      // Create the tracking store if it doesn't exist
      if (!db.objectStoreNames.contains(TRACKING_STORE)) {
        db.close();
        // Upgrade needed — increment version
        const upgradeRequest = indexedDB.open(DB_NAME, db.version + 1);
        upgradeRequest.onupgradeneeded = () => {
          const store = upgradeRequest.result.createObjectStore(TRACKING_STORE, {
            keyPath: 'missionId',
          });
          store.createIndex('currentStatus', 'currentStatus', { unique: false });
        };
        upgradeRequest.onsuccess = () => resolve(upgradeRequest.result);
        upgradeRequest.onerror = () => reject(upgradeRequest.error);
      } else {
        resolve(db);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Save (upsert) a tracking record.
 */
export async function saveTracking(tracking: MissionTracking): Promise<void> {
  const db = await openDBWithTracking();
  const tx = db.transaction(TRACKING_STORE, 'readwrite');
  const store = tx.objectStore(TRACKING_STORE);
  store.put(tracking);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Save multiple tracking records in a single transaction.
 */
export async function saveTrackings(trackings: MissionTracking[]): Promise<void> {
  if (trackings.length === 0) {
    return;
  }

  const db = await openDBWithTracking();
  const tx = db.transaction(TRACKING_STORE, 'readwrite');
  const store = tx.objectStore(TRACKING_STORE);

  for (const tracking of trackings) {
    store.put(tracking);
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get a tracking record by mission ID.
 * Returns null if no tracking exists for this mission.
 */
export async function getTracking(missionId: string): Promise<MissionTracking | null> {
  const db = await openDBWithTracking();
  const tx = db.transaction(TRACKING_STORE, 'readonly');
  const store = tx.objectStore(TRACKING_STORE);
  const request = store.get(missionId);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result ?? null);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all tracking records.
 */
export async function getAllTrackings(): Promise<MissionTracking[]> {
  const db = await openDBWithTracking();
  const tx = db.transaction(TRACKING_STORE, 'readonly');
  const store = tx.objectStore(TRACKING_STORE);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get tracking records filtered by status.
 */
export async function getTrackingsByStatus(status: ApplicationStatus): Promise<MissionTracking[]> {
  const db = await openDBWithTracking();
  const tx = db.transaction(TRACKING_STORE, 'readonly');
  const store = tx.objectStore(TRACKING_STORE);
  const index = store.index('currentStatus');
  const request = index.getAll(status);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a tracking record.
 */
export async function deleteTracking(missionId: string): Promise<void> {
  const db = await openDBWithTracking();
  const tx = db.transaction(TRACKING_STORE, 'readwrite');
  const store = tx.objectStore(TRACKING_STORE);
  store.delete(missionId);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Clear all tracking records.
 */
export async function clearTrackings(): Promise<void> {
  const db = await openDBWithTracking();
  const tx = db.transaction(TRACKING_STORE, 'readwrite');
  const store = tx.objectStore(TRACKING_STORE);
  store.clear();

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
