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
 * Reverse map of `LEGACY_STAGE_MAP` (packages/domain/src/index.ts).
 *
 * The `currentStatus` index is built on the STORED value, but older records
 * were written before the canonical-status rename and are still keyed under
 * their legacy stage (e.g. `'interested'` instead of canonical `'selected'`).
 * `saveTracking` never normalizes on write, so those legacy keys persist on
 * disk and in the index. Each canonical status maps to every stored
 * `currentStatus` that canonicalizes to it (the canonical key itself plus its
 * legacy aliases). When the domain map changes, update this too.
 */
const STATUS_INDEX_KEYS: Record<ApplicationStatus, readonly string[]> = {
  detected: ['detected', 'new'],
  selected: ['selected', 'interested', 'draft'],
  application_prepared: ['application_prepared', 'applying'],
  applied: ['applied'],
  interview: ['interview'],
  offer: ['offer'],
  accepted: ['accepted'],
  rejected: ['rejected'],
  archived: ['archived', 'withdrawn'],
};

function awaitIndexGetAll(request: IDBRequest<unknown[]>): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
  });
}

function compareMissionId(a: MissionTracking, b: MissionTracking): number {
  return a.missionId < b.missionId ? -1 : a.missionId > b.missionId ? 1 : 0;
}

/**
 * Get tracking records filtered by canonical status.
 *
 * Uses the `currentStatus` index for an O(matching) lookup instead of a full
 * table scan. Because the index is built on the stored value, we query the
 * union of the canonical status and its legacy aliases, then normalize each
 * record and dedupe by `missionId`. Results are sorted by `missionId` to
 * match `getAll()`'s primary-key ordering. Falls back to a full scan + filter
 * if the index is somehow absent.
 */
export async function getTrackingsByStatus(status: ApplicationStatus): Promise<MissionTracking[]> {
  const db = await openDB();
  const tx = db.transaction(TRACKING_STORE, 'readonly');
  const store = tx.objectStore(TRACKING_STORE);

  if (store.indexNames.contains('currentStatus')) {
    const indexKeys = STATUS_INDEX_KEYS[status];
    const index = store.index('currentStatus');
    const batches = await Promise.all(indexKeys.map((key) => awaitIndexGetAll(index.getAll(key))));

    const seen = new Set<string>();
    const out: MissionTracking[] = [];
    for (const raw of batches.flat()) {
      const tracking = normalizeStoredMissionTracking(raw);
      if (tracking && tracking.currentStatus === status && !seen.has(tracking.missionId)) {
        seen.add(tracking.missionId);
        out.push(tracking);
      }
    }
    out.sort(compareMissionId);
    return out;
  }

  // Defensive fallback: index absent (should not happen on a v4 DB).
  const all = await getAllTrackings();
  return all.filter((tracking) => tracking.currentStatus === status);
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
