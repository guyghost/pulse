import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getFavorites,
  saveFavorites,
  getHidden,
  saveHidden,
} from '../../../src/lib/shell/storage/favorites';

const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn((keys: string[]) =>
        Promise.resolve(Object.fromEntries(keys.map((k) => [k, mockStorage[k]])))
      ),
      set: vi.fn((obj: Record<string, unknown>) => {
        Object.assign(mockStorage, obj);
        return Promise.resolve();
      }),
    },
  },
});

describe('favorites storage', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  });

  it('returns empty object when no favorites stored', async () => {
    expect(await getFavorites()).toEqual({});
  });

  it('saves and retrieves favorites', async () => {
    const data = { 'id-1': 123, 'id-2': 456 };
    await saveFavorites(data);
    mockStorage['favoriteMissions'] = data;
    expect(await getFavorites()).toEqual(data);
  });

  it('returns empty object when no hidden stored', async () => {
    expect(await getHidden()).toEqual({});
  });

  it('saves and retrieves hidden', async () => {
    const data = { 'id-3': 789 };
    await saveHidden(data);
    mockStorage['hiddenMissions'] = data;
    expect(await getHidden()).toEqual(data);
  });
});
