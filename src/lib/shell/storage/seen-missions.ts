const STORAGE_KEY = 'seenMissionIds';

export async function getSeenIds(): Promise<string[]> {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  return result[STORAGE_KEY] ?? [];
}

export async function saveSeenIds(ids: string[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: ids });
}
