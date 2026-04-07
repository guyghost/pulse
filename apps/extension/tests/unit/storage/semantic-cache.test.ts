import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '../../../src/lib/core/types/profile';
import {
  cacheSemanticScores,
  getCachedSemanticScores,
} from '../../../src/lib/shell/storage/semantic-cache';

const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (keys: string[]) =>
        Object.fromEntries(keys.map((key) => [key, mockStorage[key]]))),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      }),
      remove: vi.fn(async () => {}),
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
  });

  it('returns cached scores for the same profile fingerprint', async () => {
    const results = new Map([['mission-1', { score: 82, reason: 'Bon match' }]]);

    await cacheSemanticScores(results, baseProfile);

    await expect(
      getCachedSemanticScores(['mission-1'], baseProfile),
    ).resolves.toEqual(results);
  });

  it('misses cache entries when the profile changes', async () => {
    const results = new Map([['mission-1', { score: 82, reason: 'Bon match' }]]);

    await cacheSemanticScores(results, baseProfile);

    await expect(
      getCachedSemanticScores(
        ['mission-1'],
        { ...baseProfile, stack: ['Go', 'Rust'], jobTitle: 'Developpeur backend' },
      ),
    ).resolves.toEqual(new Map());
  });
});
