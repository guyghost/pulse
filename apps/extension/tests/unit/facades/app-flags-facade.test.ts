import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridgeMock = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}));

vi.mock('../../../src/lib/shell/messaging/bridge', () => ({
  sendMessage: bridgeMock.sendMessage,
}));

import {
  clearOnboardingCompleted,
  getFeedTourSeen,
  getFirstScanDone,
  getOnboardingCompleted,
  getProfileBannerDismissed,
  setFeedTourSeen,
  setOnboardingCompleted,
  setProfileBannerDismissed,
} from '../../../src/lib/shell/facades/app-flags.facade';

describe('app flags facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads side panel app flags through the service worker bridge', async () => {
    bridgeMock.sendMessage
      .mockResolvedValueOnce({ type: 'FIRST_SCAN_DONE_RESULT', payload: true })
      .mockResolvedValueOnce({ type: 'PROFILE_BANNER_DISMISSED_RESULT', payload: false })
      .mockResolvedValueOnce({ type: 'ONBOARDING_COMPLETED_RESULT', payload: true })
      .mockResolvedValueOnce({ type: 'FEED_TOUR_SEEN_RESULT', payload: false });

    await expect(getFirstScanDone()).resolves.toBe(true);
    await expect(getProfileBannerDismissed()).resolves.toBe(false);
    await expect(getOnboardingCompleted()).resolves.toBe(true);
    await expect(getFeedTourSeen()).resolves.toBe(false);

    expect(bridgeMock.sendMessage).toHaveBeenNthCalledWith(1, { type: 'GET_FIRST_SCAN_DONE' });
    expect(bridgeMock.sendMessage).toHaveBeenNthCalledWith(2, {
      type: 'GET_PROFILE_BANNER_DISMISSED',
    });
    expect(bridgeMock.sendMessage).toHaveBeenNthCalledWith(3, {
      type: 'GET_ONBOARDING_COMPLETED',
    });
    expect(bridgeMock.sendMessage).toHaveBeenNthCalledWith(4, { type: 'GET_FEED_TOUR_SEEN' });
  });

  it('writes side panel app flags through the service worker bridge', async () => {
    bridgeMock.sendMessage
      .mockResolvedValueOnce({ type: 'PROFILE_BANNER_DISMISSED_SET', payload: { saved: true } })
      .mockResolvedValueOnce({ type: 'ONBOARDING_COMPLETED_SET', payload: { saved: true } })
      .mockResolvedValueOnce({ type: 'ONBOARDING_COMPLETED_CLEARED', payload: { cleared: true } })
      .mockResolvedValueOnce({ type: 'FEED_TOUR_SEEN_SET', payload: { saved: true } });

    await expect(setProfileBannerDismissed()).resolves.toBeUndefined();
    await expect(setOnboardingCompleted()).resolves.toBeUndefined();
    await expect(clearOnboardingCompleted()).resolves.toBeUndefined();
    await expect(setFeedTourSeen()).resolves.toBeUndefined();

    expect(bridgeMock.sendMessage).toHaveBeenNthCalledWith(1, {
      type: 'SET_PROFILE_BANNER_DISMISSED',
    });
    expect(bridgeMock.sendMessage).toHaveBeenNthCalledWith(2, {
      type: 'SET_ONBOARDING_COMPLETED',
    });
    expect(bridgeMock.sendMessage).toHaveBeenNthCalledWith(3, {
      type: 'CLEAR_ONBOARDING_COMPLETED',
    });
    expect(bridgeMock.sendMessage).toHaveBeenNthCalledWith(4, { type: 'SET_FEED_TOUR_SEEN' });
  });
});
