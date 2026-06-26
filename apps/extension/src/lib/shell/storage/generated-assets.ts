/**
 * Generated asset persistence — IndexedDB storage for LLM-generated content.
 *
 * Shell module: I/O operations, async.
 * Uses the main missionpulse DB (generated_assets store added in v3).
 */

import type { GeneratedAsset } from '../../core/types/generation';
import { openDB } from './db';

const ASSETS_STORE = 'generated_assets';

/**
 * Save (upsert) a generated asset.
 */
export const saveGeneratedAsset = async (asset: GeneratedAsset): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction(ASSETS_STORE, 'readwrite');
  const store = tx.objectStore(ASSETS_STORE);
  store.put(asset);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

/**
 * Get a single generated asset by ID.
 * Returns null if not found.
 */
export const getGeneratedAsset = async (id: string): Promise<GeneratedAsset | null> => {
  const db = await openDB();
  const tx = db.transaction(ASSETS_STORE, 'readonly');
  const store = tx.objectStore(ASSETS_STORE);
  const request = store.get(id);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve((request.result as GeneratedAsset | undefined) ?? null);
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * Get all generated assets for a mission.
 */
export const getGeneratedAssetsForMission = async (
  missionId: string
): Promise<GeneratedAsset[]> => {
  const db = await openDB();
  const tx = db.transaction(ASSETS_STORE, 'readonly');
  const store = tx.objectStore(ASSETS_STORE);
  const index = store.index('missionId');
  const request = index.getAll(missionId);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as GeneratedAsset[]);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Delete a generated asset by ID.
 */
export const deleteGeneratedAsset = async (id: string): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction(ASSETS_STORE, 'readwrite');
  const store = tx.objectStore(ASSETS_STORE);
  store.delete(id);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

/**
 * Clear all generated assets.
 */
export const clearGeneratedAssets = async (): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction(ASSETS_STORE, 'readwrite');
  const store = tx.objectStore(ASSETS_STORE);
  store.clear();

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};
