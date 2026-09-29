import { MAX_SEEN_IDS } from '../../core/seen/mark-seen';

const STORAGE_KEY = 'seenMissionIds';

export async function getSeenIds(): Promise<string[]> {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  return (result[STORAGE_KEY] as string[] | undefined) ?? [];
}

export async function saveSeenIds(ids: string[]): Promise<void> {
  // Limit storage to the shared core bound, keeping most recent (last added)
  const toStore = ids.length > MAX_SEEN_IDS ? ids.slice(-MAX_SEEN_IDS) : ids;

  await chrome.storage.local.set({ [STORAGE_KEY]: toStore });
}
