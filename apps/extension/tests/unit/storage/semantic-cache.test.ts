import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '../../../src/lib/core/types/profile';
import {
  cacheSemanticScores,
  clearExpiredSemanticCache,
  clearSemanticCache,
  getCachedSemanticScores,
  MAX_SEMANTIC_CACHE_ENTRIES,
} from '../../../src/lib/shell/storage/semantic-cache';

const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (keys: string | string[] | null) => {
        if (keys === null) {
          throw new Error('global storage scans are not allowed in semantic cache tests');
        }
        if (typeof keys === 'string') {
          return { [keys]: mockStorage[keys] };
        }
        return Object.fromEntries(keys.map((key) => [key, mockStorage[key]]));
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          delete mockStorage[key];
        }
      }),
    },
  },
});

const baseProfile: UserProfile = {
  firstName: 'Guy',
  stack: ['TypeScript', 'React'],
  tjmMin: 500,
  tjmMax: 700,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  jobTitle: 'Developpeur Fullstack',
  searchKeywords: [],
};

describe('semantic cache', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    vi.mocked(chrome.storage.local.get).mockClear();
    vi.mocked(chrome.storage.local.set).mockClear();
    vi.mocked(chrome.storage.local.remove).mockClear();
  });

  it('returns cached scores for the same profile fingerprint', async () => {
    const results = new Map([['mission-1', { score: 82, reason: 'Bon match' }]]);

    await cacheSemanticScores(results, baseProfile);

    await expect(getCachedSemanticScores(['mission-1'], baseProfile)).resolves.toEqual(results);
  });

  it('misses cache entries when the profile changes', async () => {
    const results = new Map([['mission-1', { score: 82, reason: 'Bon match' }]]);

    await cacheSemanticScores(results, baseProfile);

    await expect(
      getCachedSemanticScores(['mission-1'], {
        ...baseProfile,
        stack: ['Go', 'Rust'],
        jobTitle: 'Developpeur backend',
      })
    ).resolves.toEqual(new Map());
  });

  it('indexes semantic cache keys without scanning all extension storage', async () => {
    const results = new Map([['mission-1', { score: 82, reason: 'Bon match' }]]);

    await cacheSemanticScores(results, baseProfile);
    await clearSemanticCache();

    expect(chrome.storage.local.get).not.toHaveBeenCalledWith(null);
    expect(Object.keys(mockStorage).filter((key) => key.startsWith('semantic-'))).toEqual([
      'semantic-cache-index',
    ]);
    expect(mockStorage['semantic-cache-index']).toEqual([]);
  });

  it('removes expired indexed entries without global storage scans', async () => {
    const expiredKey = 'semantic-expired-mission';
    const freshKey = 'semantic-fresh-mission';
    mockStorage['semantic-cache-index'] = [expiredKey, freshKey];
    mockStorage[expiredKey] = {
      score: 40,
      reason: 'Ancien',
      cachedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
    };
    mockStorage[freshKey] = {
      score: 90,
      reason: 'Valide',
      cachedAt: Date.now(),
    };

    await clearExpiredSemanticCache();

    expect(chrome.storage.local.get).not.toHaveBeenCalledWith(null);
    expect(mockStorage[expiredKey]).toBeUndefined();
    expect(mockStorage[freshKey]).toBeDefined();
    expect(mockStorage['semantic-cache-index']).toEqual([freshKey]);
  });

  it('documents and enforces the expected semantic cache volume cap', async () => {
    const oversizedResults = new Map(
      Array.from({ length: MAX_SEMANTIC_CACHE_ENTRIES + 1 }, (_, index) => [
        `mission-${index}`,
        { score: 80, reason: 'Match' },
      ])
    );

    await cacheSemanticScores(oversizedResults, baseProfile);

    expect((mockStorage['semantic-cache-index'] as string[]).length).toBe(
      MAX_SEMANTIC_CACHE_ENTRIES
    );
    expect(chrome.storage.local.remove).toHaveBeenCalled();
  });
});
