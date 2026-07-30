import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridgeMock = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  listener: null as null | ((message: unknown) => void),
}));

vi.mock('../../../src/lib/shell/messaging/bridge', () => ({
  sendMessage: bridgeMock.sendMessage,
  subscribeMessages: (listener: (message: unknown) => void) => {
    bridgeMock.listener = listener;
    return () => {};
  },
}));

import {
  clearFeedTourSeen,
  clearOnboardingCompleted,
  getFeedTourSeen,
  getFirstScanDone,
  getOnboardingCompleted,
  getProfileBannerDismissed,
  setFeedTourSeen,
  setOnboardingCompleted,
  setProfileBannerDismissed,
} from '../../../src/lib/shell/facades/app-flags.facade';
import { resetSettingsReleaseFacadeForTests } from '../../../src/lib/shell/facades/settings-release.facade';

const SETTINGS = {
  scanIntervalMinutes: 30,
  enabledConnectors: ['free-work'],
  notifications: true,
  autoScan: true,
  maxSemanticPerScan: 10,
  notificationScoreThreshold: 70,
  respectRateLimits: true,
  customDelayMs: 0,
  theme: 'system' as const,
};

function snapshot(revision = 0, onboardingCompleted = false) {
  return {
    settings: SETTINGS,
    onboardingCompleted,
    revision,
    generation: revision,
  };
}

describe('app flags facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeMock.listener = null;
    resetSettingsReleaseFacadeForTests();
  });

  it('reads side panel app flags through the service worker bridge', async () => {
    bridgeMock.sendMessage
      .mockResolvedValueOnce({ type: 'FIRST_SCAN_DONE_RESULT', payload: true })
      .mockResolvedValueOnce({ type: 'PROFILE_BANNER_DISMISSED_RESULT', payload: false })
      .mockResolvedValueOnce({
        type: 'SETTINGS_RELEASE_RESULT',
        payload: { status: 'confirmed', snapshot: snapshot(0, true) },
      })
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
      type: 'GET_SETTINGS_RELEASE',
    });
    expect(bridgeMock.sendMessage).toHaveBeenNthCalledWith(4, { type: 'GET_FEED_TOUR_SEEN' });
  });

  it('writes side panel app flags through the service worker bridge', async () => {
    bridgeMock.sendMessage.mockImplementation(
      async (message: { type: string; payload?: unknown }) => {
        if (message.type === 'SET_PROFILE_BANNER_DISMISSED') {
          return { type: 'PROFILE_BANNER_DISMISSED_SET', payload: { saved: true } };
        }
        if (message.type === 'GET_SETTINGS_RELEASE') {
          return {
            type: 'SETTINGS_RELEASE_RESULT',
            payload: { status: 'confirmed', snapshot: snapshot() },
          };
        }
        if (message.type === 'MUTATE_SETTINGS_RELEASE') {
          const intent = message.payload as {
            kind: 'set_consent' | 'clear_consent';
            requestId: string;
            baseRevision: number;
            targetConsent: boolean;
          };
          const revision = intent.baseRevision + 1;
          return {
            type: 'SETTINGS_RELEASE_MUTATION_RESULT',
            payload: {
              status: 'settled',
              outcome: {
                commandId: `settings-release:install-test:${revision}:command`,
                requestId: intent.requestId,
                intentDigest: 'a'.repeat(64),
                kind: intent.kind,
                settledRevision: revision,
                settledGeneration: revision,
                snapshot: snapshot(revision, intent.targetConsent),
                status: 'committed',
                reason: 'committed',
              },
            },
          };
        }
        if (message.type === 'SET_FEED_TOUR_SEEN') {
          return { type: 'FEED_TOUR_SEEN_SET', payload: { saved: true } };
        }
        if (message.type === 'CLEAR_FEED_TOUR_SEEN') {
          return { type: 'FEED_TOUR_SEEN_CLEARED', payload: { cleared: true } };
        }
        throw new Error(`Unexpected message: ${message.type}`);
      }
    );

    await expect(setProfileBannerDismissed()).resolves.toBeUndefined();
    await expect(setOnboardingCompleted()).resolves.toBeUndefined();
    await expect(clearOnboardingCompleted()).resolves.toBeUndefined();
    await expect(setFeedTourSeen()).resolves.toBeUndefined();
    await expect(clearFeedTourSeen()).resolves.toBeUndefined();

    expect(bridgeMock.sendMessage).toHaveBeenNthCalledWith(1, {
      type: 'SET_PROFILE_BANNER_DISMISSED',
    });
    expect(bridgeMock.sendMessage).toHaveBeenNthCalledWith(2, { type: 'GET_SETTINGS_RELEASE' });
    expect(bridgeMock.sendMessage).toHaveBeenNthCalledWith(3, {
      type: 'MUTATE_SETTINGS_RELEASE',
      payload: expect.objectContaining({
        kind: 'set_consent',
        baseRevision: 0,
        targetConsent: true,
      }),
    });
    expect(bridgeMock.sendMessage).toHaveBeenNthCalledWith(4, {
      type: 'MUTATE_SETTINGS_RELEASE',
      payload: expect.objectContaining({
        kind: 'clear_consent',
        baseRevision: 1,
        targetConsent: false,
      }),
    });
    expect(bridgeMock.sendMessage).toHaveBeenNthCalledWith(5, { type: 'SET_FEED_TOUR_SEEN' });
    expect(bridgeMock.sendMessage).toHaveBeenNthCalledWith(6, { type: 'CLEAR_FEED_TOUR_SEEN' });
    expect(bridgeMock.sendMessage).not.toHaveBeenCalledWith({ type: 'SET_ONBOARDING_COMPLETED' });
    expect(bridgeMock.sendMessage).not.toHaveBeenCalledWith({ type: 'CLEAR_ONBOARDING_COMPLETED' });
  });
});
