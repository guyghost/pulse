import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '../../../src/lib/core/types/app-settings';
import type { UserProfile } from '../../../src/lib/core/types/profile';

const bridgeMock = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}));

vi.mock('../../../src/lib/shell/messaging/bridge', () => ({
  sendMessage: bridgeMock.sendMessage,
  subscribeMessages: () => () => {},
}));

import {
  getProfile,
  getSettings,
  saveProfile,
  setSettings,
} from '../../../src/lib/shell/facades/settings.facade';
import { resetSettingsReleaseFacadeForTests } from '../../../src/lib/shell/facades/settings-release.facade';

const profile: UserProfile = {
  firstName: 'Guy',
  keywords: ['Svelte', 'TypeScript', 'mission svelte'],
  tjmMin: 600,
  tjmMax: 800,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  jobTitle: 'Lead Frontend',
};

const settings: AppSettings = {
  scanIntervalMinutes: 30,
  enabledConnectors: ['free-work', 'lehibou'],
  notifications: true,
  autoScan: true,
  maxSemanticPerScan: 10,
  notificationScoreThreshold: 70,
  respectRateLimits: true,
  customDelayMs: 0,
  theme: 'system',
};

describe('settings facade profile bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSettingsReleaseFacadeForTests();
  });

  it('loads the profile through the service worker bridge', async () => {
    bridgeMock.sendMessage.mockResolvedValue({ type: 'PROFILE_RESULT', payload: profile });

    await expect(getProfile()).resolves.toEqual(profile);
    expect(bridgeMock.sendMessage).toHaveBeenCalledWith({ type: 'GET_PROFILE' });
  });

  it('saves the profile through the service worker bridge', async () => {
    bridgeMock.sendMessage.mockResolvedValue({ type: 'PROFILE_RESULT', payload: profile });

    await expect(saveProfile(profile)).resolves.toBeUndefined();
    expect(bridgeMock.sendMessage).toHaveBeenCalledWith({
      type: 'SAVE_PROFILE',
      payload: profile,
    });
  });

  it('surfaces failed bridge profile saves', async () => {
    bridgeMock.sendMessage.mockResolvedValue({ type: 'PROFILE_RESULT', payload: null });

    await expect(saveProfile(profile)).rejects.toThrow('Profile save failed.');
  });

  it('loads settings through the service worker bridge', async () => {
    bridgeMock.sendMessage.mockResolvedValue({
      type: 'SETTINGS_RELEASE_RESULT',
      payload: {
        status: 'confirmed',
        snapshot: { settings, onboardingCompleted: true, revision: 0, generation: 0 },
      },
    });

    await expect(getSettings()).resolves.toEqual(settings);
    expect(bridgeMock.sendMessage).toHaveBeenCalledWith({ type: 'GET_SETTINGS_RELEASE' });
  });

  it('saves settings through the service worker bridge', async () => {
    bridgeMock.sendMessage
      .mockResolvedValueOnce({
        type: 'SETTINGS_RELEASE_RESULT',
        payload: {
          status: 'confirmed',
          snapshot: { settings, onboardingCompleted: true, revision: 0, generation: 0 },
        },
      })
      .mockImplementationOnce((message) => ({
        type: 'SETTINGS_RELEASE_MUTATION_RESULT',
        payload: {
          status: 'settled',
          outcome: {
            commandId: 'settings-release:92000000-0000-4000-8000-000000000001:1:command',
            requestId: message.payload.requestId,
            intentDigest: '0'.repeat(64),
            kind: 'save_settings',
            settledRevision: 1,
            settledGeneration: 1,
            snapshot: { settings, onboardingCompleted: true, revision: 1, generation: 1 },
            status: 'committed',
            reason: 'committed',
          },
        },
      }));

    await expect(setSettings(settings)).resolves.toBeUndefined();
    expect(bridgeMock.sendMessage).toHaveBeenLastCalledWith({
      type: 'MUTATE_SETTINGS_RELEASE',
      payload: expect.objectContaining({
        kind: 'save_settings',
        baseRevision: 0,
        settings,
      }),
    });
  });

  it('surfaces failed bridge settings saves', async () => {
    bridgeMock.sendMessage
      .mockResolvedValueOnce({
        type: 'SETTINGS_RELEASE_RESULT',
        payload: {
          status: 'confirmed',
          snapshot: { settings, onboardingCompleted: true, revision: 0, generation: 0 },
        },
      })
      .mockImplementationOnce((message) => ({
        type: 'SETTINGS_RELEASE_MUTATION_RESULT',
        payload: {
          status: 'blocked',
          requestId: message.payload.requestId,
          commandId: null,
          reason: 'actor_blocked',
          snapshot: null,
        },
      }));

    await expect(setSettings(settings)).rejects.toThrow('Settings save was not committed.');
  });
});
