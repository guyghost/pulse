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
  keywords: ['TypeScript', 'React'],
  tjmMin: 500,
  tjmMax: 700,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  jobTitle: 'Developpeur Fullstack',
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
        keywords: ['Go', 'Rust'],
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

  it('round-trips a batch of missions with a single batched storage read', async () => {
    // Ids deliberately use different dash shapes so that a naive
    // `lastIndexOf('-')` split would leak part of the id into the fingerprint
    // and hide regressions.
    const ids = ['mission-a', 'mission-b-2', 'mission-c-extra'];
    const results = new Map(ids.map((id) => [id, { score: 80, reason: 'match' }]));

    await cacheSemanticScores(results, baseProfile);

    const cached = await getCachedSemanticScores(ids, baseProfile);

    // Every entry round-trips intact.
    expect(cached).toEqual(results);

    // The read path must batch all keys into one storage.local.get call —
    // no per-mission reads — and every requested key shares the same profile
    // fingerprint (differs only by mission id), proving the keys for a batch
    // are derived from a single fingerprint computation.
    const getCalls = vi
      .mocked(chrome.storage.local.get)
      .mock.calls.filter((call): call is [string[]] => Array.isArray(call[0]));
    expect(getCalls).toHaveLength(1);
    const requestedKeys = getCalls[0][0];
    expect(requestedKeys).toHaveLength(ids.length);
    // Keys are `${CACHE_KEY_PREFIX}${fingerprint}-${missionId}`. Strip the
    // known prefix and the known `-${missionId}` suffix (using the mission id
    // we requested, in order) to isolate the exact fingerprint substring.
    const PREFIX = 'semantic-';
    const fingerprints = new Set(
      requestedKeys.map((key, index) => {
        const suffixLength = ids[index].length + 1; // +1 for the '-' separator
        return key.slice(PREFIX.length, key.length - suffixLength);
      })
    );
    expect(fingerprints.size).toBe(1);
  });

  it('does not duplicate index entries when re-caching existing keys', async () => {
    const first = new Map([
      ['mission-1', { score: 80, reason: 'A' }],
      ['mission-2', { score: 82, reason: 'B' }],
    ]);
    await cacheSemanticScores(first, baseProfile);

    // Re-cache mission-1 alongside a new key.
    const second = new Map([
      ['mission-3', { score: 84, reason: 'C' }],
      ['mission-1', { score: 81, reason: 'A-updated' }],
    ]);
    await cacheSemanticScores(second, baseProfile);

    const index = mockStorage['semantic-cache-index'] as string[];
    // No duplicates in the index.
    expect(new Set(index).size).toBe(index.length);
    // Existing key moved to the tail; new key appended after survivors. Keys are
    // stored as `semantic-<profile-fingerprint>-<missionId>`; the fingerprint
    // never contains `mission`, so slice from the first `mission-` occurrence.
    const missionIds = index.map((key) => key.slice(key.indexOf('mission-')));
    expect(missionIds).toEqual(['mission-2', 'mission-3', 'mission-1']);
  });
});
