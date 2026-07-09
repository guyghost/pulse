import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '../../../src/lib/core/types/profile';
import { clearProfile, getProfile, saveProfile } from '../../../src/lib/shell/storage/db';

const profile: UserProfile = {
  firstName: '',
  keywords: ['Svelte Save', 'mission svelte'],
  tjmMin: 600,
  tjmMax: 800,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  jobTitle: 'Architecte Svelte',
};

describe('profile IndexedDB store', () => {
  beforeEach(async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
          remove: vi.fn(async () => undefined),
        },
      },
    });
    await clearProfile();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads a profile immediately after save resolves', async () => {
    await saveProfile(profile);

    await expect(getProfile()).resolves.toEqual(profile);
  });
});
