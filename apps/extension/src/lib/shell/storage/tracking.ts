/**
 * Tracking persistence — IndexedDB storage for mission tracking records.
 *
 * Shell module: I/O operations, async.
 *
 * NOTE: The `mission_tracking` object store is created by the central
 * migration orchestrator (db.ts v4). This module never opens its own
 * versioned connection — it reuses the single shared `openDB()` opener
 * to avoid the dual-opener version conflict (see db-migration.model.md).
 */

import type { MissionTracking } from '../../core/types/tracking';
import type { ApplicationStatus } from '../../core/types/tracking';
import { normalizeStoredMissionTracking } from '../../core/tracking/migration';
import { openDB } from './db';

const TRACKING_STORE = 'mission_tracking';

/**
 * Save (upsert) a tracking record.
 */
export async function saveTracking(tracking: MissionTracking): Promise<void> {
  const db = await openDB();
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

  const db = await openDB();
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
  const db = await openDB();
  const tx = db.transaction(TRACKING_STORE, 'readonly');
  const store = tx.objectStore(TRACKING_STORE);
  const request = store.get(missionId);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(normalizeStoredMissionTracking(request.result));
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all tracking records.
 */
export async function getAllTrackings(): Promise<MissionTracking[]> {
  const db = await openDB();
  const tx = db.transaction(TRACKING_STORE, 'readonly');
  const store = tx.objectStore(TRACKING_STORE);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(
        Array.isArray(request.result)
          ? request.result.flatMap((item) => {
              const tracking = normalizeStoredMissionTracking(item);
              return tracking ? [tracking] : [];
            })
          : []
      );
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get tracking records filtered by status.
 */
export async function getTrackingsByStatus(status: ApplicationStatus): Promise<MissionTracking[]> {
  const trackings = await getAllTrackings();
  return trackings.filter((tracking) => tracking.currentStatus === status);
}

/**
 * Delete a tracking record.
 */
export async function deleteTracking(missionId: string): Promise<void> {
  const db = await openDB();
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
  const db = await openDB();
  const tx = db.transaction(TRACKING_STORE, 'readwrite');
  const store = tx.objectStore(TRACKING_STORE);
  store.clear();

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
