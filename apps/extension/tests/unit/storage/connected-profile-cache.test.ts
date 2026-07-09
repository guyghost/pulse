import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearConnectedCandidateProfileCache,
  getConnectedCandidateProfileCache,
  saveConnectedCandidateProfileCache,
} from '../../../src/lib/shell/storage/connected-profile-cache';
import type { UserProfile } from '../../../src/lib/core/types/profile';

const profile: UserProfile = {
  firstName: 'Guy',
  keywords: ['Svelte', 'TypeScript', 'svelte mission'],
  tjmMin: 650,
  tjmMax: 900,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  jobTitle: 'Architecte frontend',
  scoringWeights: { stack: 40, location: 20, tjm: 25, remote: 15 },
};

describe('connected candidate profile cache', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores and reads the last connected dashboard profile copy', async () => {
    const storage: Record<string, unknown> = {};
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          set: vi.fn(async (value: Record<string, unknown>) => {
            Object.assign(storage, value);
          }),
          get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
          remove: vi.fn(async (key: string) => {
            delete storage[key];
          }),
        },
      },
    });

    await saveConnectedCandidateProfileCache(profile);

    await expect(getConnectedCandidateProfileCache()).resolves.toEqual(profile);
  });

  it('returns null for invalid cached profile data', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: { firstName: '' } })),
          set: vi.fn(),
          remove: vi.fn(),
        },
      },
    });

    await expect(getConnectedCandidateProfileCache()).resolves.toBeNull();
  });

  it('removes the connected profile cache key', async () => {
    const remove = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(),
          set: vi.fn(),
          remove,
        },
      },
    });

    await clearConnectedCandidateProfileCache();

    expect(remove).toHaveBeenCalledWith('missionpulse.connectedSync.candidateProfile.localCopy');
  });
});
