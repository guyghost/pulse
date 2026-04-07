const FAVORITES_KEY = 'favoriteMissions';
const HIDDEN_KEY = 'hiddenMissions';

export async function getFavorites(): Promise<Record<string, number>> {
  const result = await chrome.storage.local.get([FAVORITES_KEY]);
  return result[FAVORITES_KEY] ?? {};
}

export async function saveFavorites(favorites: Record<string, number>): Promise<void> {
  await chrome.storage.local.set({ [FAVORITES_KEY]: favorites });
}

export async function getHidden(): Promise<Record<string, number>> {
  const result = await chrome.storage.local.get([HIDDEN_KEY]);
  return result[HIDDEN_KEY] ?? {};
}

export async function saveHidden(hidden: Record<string, number>): Promise<void> {
  await chrome.storage.local.set({ [HIDDEN_KEY]: hidden });
}
