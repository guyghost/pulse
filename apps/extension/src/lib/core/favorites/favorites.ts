import type { Mission } from '../types/mission';

export const MAX_ENTRIES = 500;

function toggle(map: Record<string, number>, id: string, now: number): Record<string, number> {
  if (id in map) {
    const { [id]: _, ...rest } = map;
    return rest;
  }
  const updated = { ...map, [id]: now };
  const keys = Object.keys(updated);
  if (keys.length > MAX_ENTRIES) {
    const sorted = keys.sort((a, b) => updated[a] - updated[b]);
    const toRemove = sorted.slice(0, keys.length - MAX_ENTRIES);
    for (const key of toRemove) {
      delete updated[key];
    }
  }
  return updated;
}

export function toggleFavorite(
  favorites: Record<string, number>,
  id: string,
  now: number
): Record<string, number> {
  return toggle(favorites, id, now);
}

export function toggleHidden(
  hidden: Record<string, number>,
  id: string,
  now: number
): Record<string, number> {
  return toggle(hidden, id, now);
}

export function filterHidden(missions: Mission[], hidden: Record<string, number>): Mission[] {
  return missions.filter((m) => !(m.id in hidden));
}

export function filterFavoritesOnly(
  missions: Mission[],
  favorites: Record<string, number>
): Mission[] {
  return missions.filter((m) => m.id in favorites);
}
