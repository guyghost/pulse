const STORAGE_KEY = 'seenMissionIds';
const MAX_SEEN_IDS = 2000;

export async function getSeenIds(): Promise<string[]> {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  return result[STORAGE_KEY] ?? [];
}

export async function saveSeenIds(ids: string[]): Promise<void> {
  // Limit storage to MAX_SEEN_IDS, keeping most recent (last added)
  const toStore = ids.length > MAX_SEEN_IDS ? ids.slice(-MAX_SEEN_IDS) : ids;

  await chrome.storage.local.set({ [STORAGE_KEY]: toStore });
}
