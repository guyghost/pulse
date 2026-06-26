import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '../../../src/lib/core/types/app-settings';
import type { UserProfile } from '../../../src/lib/core/types/profile';

const bridgeMock = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}));

vi.mock('../../../src/lib/shell/messaging/bridge', () => ({
  sendMessage: bridgeMock.sendMessage,
}));

import {
  getProfile,
  getSettings,
  saveProfile,
  setSettings,
} from '../../../src/lib/shell/facades/settings.facade';

const profile: UserProfile = {
  firstName: 'Guy',
  stack: ['Svelte', 'TypeScript'],
  tjmMin: 600,
  tjmMax: 800,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  jobTitle: 'Lead Frontend',
  searchKeywords: ['mission svelte'],
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
    bridgeMock.sendMessage.mockResolvedValue({ type: 'SETTINGS_RESULT', payload: settings });

    await expect(getSettings()).resolves.toEqual(settings);
    expect(bridgeMock.sendMessage).toHaveBeenCalledWith({ type: 'GET_SETTINGS' });
  });

  it('saves settings through the service worker bridge', async () => {
    bridgeMock.sendMessage.mockResolvedValue({
      type: 'SETTINGS_SAVED',
      payload: { saved: true, settings },
    });

    await expect(setSettings(settings)).resolves.toBeUndefined();
    expect(bridgeMock.sendMessage).toHaveBeenCalledWith({
      type: 'SAVE_SETTINGS',
      payload: settings,
    });
  });

  it('surfaces failed bridge settings saves', async () => {
    bridgeMock.sendMessage.mockResolvedValue({
      type: 'SETTINGS_SAVED',
      payload: { saved: false, settings: null },
    });

    await expect(setSettings(settings)).rejects.toThrow('Settings save failed.');
  });
});
