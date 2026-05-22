import { MISSIONPULSE_DB_NAME } from './db';

function deleteMissionPulseDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.deleteDatabase(MISSIONPULSE_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('MissionPulse IndexedDB deletion is blocked.'));
  });
}

export async function resetLocalData(): Promise<void> {
  await Promise.all([chrome.storage.local.clear(), deleteMissionPulseDatabase()]);
}
