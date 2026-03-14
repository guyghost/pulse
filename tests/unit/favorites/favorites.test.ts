import { describe, it, expect } from 'vitest';
import {
  toggleFavorite,
  toggleHidden,
  filterHidden,
  filterFavoritesOnly,
  MAX_ENTRIES,
} from '../../../src/lib/core/favorites/favorites';
import type { Mission } from '../../../src/lib/core/types/mission';

function makeMission(id: string): Mission {
  return {
    id, title: `Mission ${id}`, client: null, description: '',
    stack: [], tjm: null, location: null, remote: null,
    duration: null, url: `https://example.com/${id}`,
    source: 'free-work', scrapedAt: new Date(), score: null,
    semanticScore: null, semanticReason: null,
  };
}

const NOW = 1773230400000; // 2026-03-11T12:00:00Z

describe('toggleFavorite', () => {
  it('adds id with timestamp when not present', () => {
    const result = toggleFavorite({}, 'a', NOW);
    expect(result).toEqual({ a: NOW });
  });

  it('removes id when already present', () => {
    const result = toggleFavorite({ a: 123 }, 'a', NOW);
    expect(result).toEqual({});
  });

  it('caps at MAX_ENTRIES, dropping oldest', () => {
    const entries: Record<string, number> = {};
    for (let i = 0; i < MAX_ENTRIES; i++) {
      entries[`id-${i}`] = i;
    }
    const result = toggleFavorite(entries, 'new-id', NOW);
    expect(Object.keys(result).length).toBe(MAX_ENTRIES);
    expect(result['new-id']).toBeDefined();
    expect(result['id-0']).toBeUndefined();
  });
});

describe('toggleHidden', () => {
  it('adds id with timestamp when not present', () => {
    const result = toggleHidden({}, 'b', NOW);
    expect(result).toEqual({ b: NOW });
  });

  it('removes id when already present', () => {
    const result = toggleHidden({ b: 123 }, 'b', NOW);
    expect(result).toEqual({});
  });
});

describe('filterHidden', () => {
  it('removes missions that are in hidden map', () => {
    const missions = [makeMission('a'), makeMission('b'), makeMission('c')];
    const hidden = { b: 123 };
    const result = filterHidden(missions, hidden);
    expect(result.map(m => m.id)).toEqual(['a', 'c']);
  });

  it('returns all missions when hidden is empty', () => {
    const missions = [makeMission('a')];
    expect(filterHidden(missions, {})).toEqual(missions);
  });
});

describe('filterFavoritesOnly', () => {
  it('keeps only missions in favorites map', () => {
    const missions = [makeMission('a'), makeMission('b'), makeMission('c')];
    const favorites = { a: 123, c: 456 };
    const result = filterFavoritesOnly(missions, favorites);
    expect(result.map(m => m.id)).toEqual(['a', 'c']);
  });

  it('returns empty when no favorites match', () => {
    const missions = [makeMission('a')];
    expect(filterFavoritesOnly(missions, {})).toEqual([]);
  });
});
