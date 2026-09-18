import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MissionClassification } from '../../../src/lib/core/types/mission-classification';
import {
  buildCacheInput,
  cacheClassifications,
  clearClassificationCache,
  clearExpiredClassificationCache,
  getCachedClassifications,
  MAX_CLASSIFICATION_CACHE_ENTRIES,
} from '../../../src/lib/shell/storage/classification-cache';

const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (keys: string | string[] | null) => {
        if (keys === null) {
          throw new Error('global storage scans are not allowed in classification cache tests');
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

const classification = (category = 'frontend'): MissionClassification => ({
  category,
  remoteCompatible: true,
  confidence: 0.92,
  classifiedAt: Date.now(),
});

const input = (id: string, fingerprint = 'fp-1') => ({ id, fingerprint });
const write = (id: string, fingerprint = 'fp-1', category = 'frontend') => ({
  ...input(id, fingerprint),
  classification: classification(category),
});

describe('classification cache', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    vi.mocked(chrome.storage.local.get).mockClear();
    vi.mocked(chrome.storage.local.set).mockClear();
    vi.mocked(chrome.storage.local.remove).mockClear();
  });

  it('returns cached classifications while the content fingerprint matches', async () => {
    await cacheClassifications([write('mission-1', 'fp-1', 'backend')]);

    await expect(getCachedClassifications([input('mission-1', 'fp-1')])).resolves.toEqual(
      new Map([['mission-1', classification('backend')]])
    );
  });

  it('misses entries whose fingerprint no longer matches the mission content', async () => {
    await cacheClassifications([write('mission-1', 'fp-1')]);

    await expect(getCachedClassifications([input('mission-1', 'fp-2')])).resolves.toEqual(
      new Map()
    );
  });

  it('misses entries beyond the TTL', async () => {
    await cacheClassifications([write('mission-1')]);

    // Age the entry beyond the 7-day TTL.
    const key = 'classification-mission-1';
    const entry = mockStorage[key] as { cachedAt: number; classification: MissionClassification };
    entry.cachedAt = Date.now() - 8 * 24 * 60 * 60 * 1000;

    await expect(getCachedClassifications([input('mission-1')])).resolves.toEqual(new Map());
  });

  it('evicts oldest entries beyond the volume cap', async () => {
    const oversized = Array.from({ length: MAX_CLASSIFICATION_CACHE_ENTRIES + 1 }, (_, index) =>
      write(`mission-${index}`, `fp-${index}`)
    );

    await cacheClassifications(oversized);

    const index = mockStorage['classification-cache-index'] as string[];
    expect(index.length).toBe(MAX_CLASSIFICATION_CACHE_ENTRIES);
    expect(chrome.storage.local.remove).toHaveBeenCalled();
    // Oldest (lowest index) evicted first: mission-0 is gone, mission-1 kept.
    expect(mockStorage['classification-mission-0']).toBeUndefined();
    expect(mockStorage['classification-mission-1']).toBeDefined();
  });

  it('round-trips a batch of missions with a single batched storage read', async () => {
    const ids = ['mission-a', 'mission-b-2', 'mission-c-extra'];
    await cacheClassifications(ids.map((id) => write(id, `fp-${id}`, 'data')));

    const cached = await getCachedClassifications(ids.map((id) => input(id, `fp-${id}`)));

    expect(cached.size).toBe(ids.length);
    expect(cached.get('mission-b-2')?.category).toBe('data');

    const getCalls = vi
      .mocked(chrome.storage.local.get)
      .mock.calls.filter((call): call is [string[]] => Array.isArray(call[0]));
    expect(getCalls).toHaveLength(1);
    expect(getCalls[0][0]).toHaveLength(ids.length);
  });

  it('does not duplicate index entries when re-caching existing keys', async () => {
    await cacheClassifications([write('mission-1'), write('mission-2')]);
    await cacheClassifications([write('mission-3', 'fp-3'), write('mission-1', 'fp-1b')]);

    const index = mockStorage['classification-cache-index'] as string[];
    expect(new Set(index).size).toBe(index.length);

    const missionIds = index.map((key) => key.slice('classification-'.length));
    expect(missionIds).toEqual(['mission-2', 'mission-3', 'mission-1']);
  });

  it('clears all entries through the index without global storage scans', async () => {
    await cacheClassifications([write('mission-1'), write('mission-2')]);

    await clearClassificationCache();

    expect(chrome.storage.local.get).not.toHaveBeenCalledWith(null);
    expect(mockStorage['classification-mission-1']).toBeUndefined();
    expect(mockStorage['classification-mission-2']).toBeUndefined();
    expect(mockStorage['classification-cache-index']).toEqual([]);
  });

  it('removes expired entries and drops them from the index', async () => {
    const expiredKey = 'classification-expired-mission';
    const freshKey = 'classification-fresh-mission';
    mockStorage['classification-cache-index'] = [expiredKey, freshKey];
    mockStorage[expiredKey] = {
      classification: classification('devops'),
      fingerprint: 'fp-e',
      cachedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
    };
    mockStorage[freshKey] = {
      classification: classification('design'),
      fingerprint: 'fp-f',
      cachedAt: Date.now(),
    };

    await clearExpiredClassificationCache();

    expect(chrome.storage.local.get).not.toHaveBeenCalledWith(null);
    expect(mockStorage[expiredKey]).toBeUndefined();
    expect(mockStorage[freshKey]).toBeDefined();
    expect(mockStorage['classification-cache-index']).toEqual([freshKey]);
  });

  it('derives cache input fingerprints from mission content', () => {
    const mission = {
      id: 'mission-1',
      title: 'Dev React',
      description: 'Front-end mission',
      stack: ['React'],
    };
    const built = buildCacheInput(mission);

    expect(built.id).toBe('mission-1');
    expect(typeof built.fingerprint).toBe('string');
    expect(built.fingerprint.length).toBeGreaterThan(0);
  });
});
