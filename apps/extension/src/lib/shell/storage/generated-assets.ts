/**
 * Generated assets persistence — IndexedDB storage for LLM-generated content.
 *
 * Shell module: I/O operations, async.
 */

import type { GeneratedAsset } from '../../core/types/generation';
import type { GenerationType } from '../../core/types/generation';

const DB_NAME = 'missionpulse';
const ASSETS_STORE = 'generated_assets';

/**
 * Open (or create) the assets object store.
 */
function openDBWithAssets(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);

    request.onsuccess = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(ASSETS_STORE)) {
        db.close();
        const upgradeRequest = indexedDB.open(DB_NAME, db.version + 1);
        upgradeRequest.onupgradeneeded = () => {
          const store = upgradeRequest.result.createObjectStore(ASSETS_STORE, {
            keyPath: 'id',
          });
          store.createIndex('missionId', 'missionId', { unique: false });
          store.createIndex('type', 'type', { unique: false });
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
 * Save a generated asset.
 */
export async function saveGeneratedAsset(asset: GeneratedAsset): Promise<void> {
  const db = await openDBWithAssets();
  const tx = db.transaction(ASSETS_STORE, 'readwrite');
  const store = tx.objectStore(ASSETS_STORE);
  store.put(asset);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get all generated assets for a mission.
 */
export async function getAssetsForMission(missionId: string): Promise<GeneratedAsset[]> {
  const db = await openDBWithAssets();
  const tx = db.transaction(ASSETS_STORE, 'readonly');
  const store = tx.objectStore(ASSETS_STORE);
  const index = store.index('missionId');
  const request = index.getAll(missionId);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all generated assets of a specific type.
 */
export async function getAssetsByType(type: GenerationType): Promise<GeneratedAsset[]> {
  const db = await openDBWithAssets();
  const tx = db.transaction(ASSETS_STORE, 'readonly');
  const store = tx.objectStore(ASSETS_STORE);
  const index = store.index('type');
  const request = index.getAll(type);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all generated assets.
 */
export async function getAllAssets(): Promise<GeneratedAsset[]> {
  const db = await openDBWithAssets();
  const tx = db.transaction(ASSETS_STORE, 'readonly');
  const store = tx.objectStore(ASSETS_STORE);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a generated asset.
 */
export async function deleteGeneratedAsset(assetId: string): Promise<void> {
  const db = await openDBWithAssets();
  const tx = db.transaction(ASSETS_STORE, 'readwrite');
  const store = tx.objectStore(ASSETS_STORE);
  store.delete(assetId);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Clear all generated assets.
 */
export async function clearGeneratedAssets(): Promise<void> {
  const db = await openDBWithAssets();
  const tx = db.transaction(ASSETS_STORE, 'readwrite');
  const store = tx.objectStore(ASSETS_STORE);
  store.clear();

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
