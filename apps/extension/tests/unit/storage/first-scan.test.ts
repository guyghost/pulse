import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = {
  get: vi.fn(async (_key: string) => ({})),
  set: vi.fn(async (_items: Record<string, unknown>) => undefined),
  remove: vi.fn(async (_key: string) => undefined),
};

vi.stubGlobal('chrome', { storage: { local: storage } });

import {
  clearFeedTourSeen,
  clearOnboardingCompleted,
  getFirstScanDone,
  setFeedTourSeen,
  setFirstScanDone,
  setKbdCheatsheetTipSeen,
  setOnboardingCompleted,
  setProfileBannerDismissed,
} from '../../../src/lib/shell/storage/first-scan';

describe('first-scan storage write truth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['first scan', setFirstScanDone],
    ['profile banner', setProfileBannerDismissed],
    ['onboarding', setOnboardingCompleted],
    ['feed tour', setFeedTourSeen],
    ['keyboard tip', setKbdCheatsheetTipSeen],
  ] as const)(
    'propagates a rejected %s set instead of inventing success',
    async (_label, write) => {
      storage.set.mockRejectedValueOnce(new Error('storage set rejected'));

      await expect(write()).rejects.toThrow('storage set rejected');
    }
  );

  it.each([
    ['onboarding', clearOnboardingCompleted],
    ['feed tour', clearFeedTourSeen],
  ] as const)(
    'propagates a rejected %s remove instead of inventing success',
    async (_label, clear) => {
      storage.remove.mockRejectedValueOnce(new Error('storage remove rejected'));

      await expect(clear()).rejects.toThrow('storage remove rejected');
    }
  );

  it('keeps read fallback false when storage itself cannot be read', async () => {
    storage.get.mockRejectedValueOnce(new Error('storage read rejected'));

    await expect(getFirstScanDone()).resolves.toBe(false);
  });
});
