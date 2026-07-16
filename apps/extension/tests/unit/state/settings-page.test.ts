import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridgeMock = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({
  showToast: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/lib/shell/messaging/bridge', () => ({
  sendMessage: bridgeMock.sendMessage,
  subscribeMessages: () => () => {},
}));

vi.mock('../../../src/lib/shell/notifications/toast-service', () => ({
  showToast: toastMock.showToast,
  showToastAction: vi.fn(),
}));

import { SettingsPageController } from '../../../src/lib/state/settings-page.svelte';

const persistedSettings = {
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

function routeBridge(): void {
  bridgeMock.sendMessage.mockImplementation((message: { type: string }) => {
    if (message.type === 'RESET_LOCAL_DATA') {
      return Promise.reject(new Error('IndexedDB bloqué'));
    }
    if (message.type === 'GET_PROFILE') {
      return Promise.resolve({ type: 'PROFILE_RESULT', payload: null });
    }
    return Promise.resolve({ type: 'SETTINGS_RESULT', payload: null });
  });
}

describe('SettingsPageController.resetAll — SET-02 failure surfacing', () => {
  beforeEach(() => {
    bridgeMock.sendMessage.mockReset();
    toastMock.showToast.mockClear();
    routeBridge();
  });

  it('surfaces a reset failure instead of swallowing it (empty catch)', async () => {
    const onNavigateToOnboarding = vi.fn();
    const controller = new SettingsPageController({ onNavigateToOnboarding });
    controller.showResetConfirm = true;

    await controller.resetAll();

    // Failure must be surfaced to the user (error toast + exposed reset error).
    expect(toastMock.showToast).toHaveBeenCalledWith(expect.any(String), 'error');
    expect(controller.resetError).toBeTruthy();

    // The destructive confirmation gate must stay intact (no silent close).
    expect(controller.showResetConfirm).toBe(true);

    // A failed reset must NOT navigate away to onboarding.
    expect(onNavigateToOnboarding).not.toHaveBeenCalled();

    controller.destroy();
  });

  it('keeps the confirmation gate intact on success', async () => {
    bridgeMock.sendMessage.mockImplementation((message: { type: string }) => {
      if (message.type === 'GET_PROFILE') {
        return Promise.resolve({ type: 'PROFILE_RESULT', payload: null });
      }
      return Promise.resolve({
        type: 'LOCAL_DATA_RESET',
        payload: { reset: true },
      });
    });

    const onNavigateToOnboarding = vi.fn();
    const controller = new SettingsPageController({ onNavigateToOnboarding });
    controller.showResetConfirm = true;

    await controller.resetAll();

    expect(controller.resetError).toBeNull();
    expect(controller.showResetConfirm).toBe(false);
    expect(onNavigateToOnboarding).toHaveBeenCalledTimes(1);

    controller.destroy();
  });
});

describe('SettingsPageController.saveProfile — availability preservation', () => {
  beforeEach(() => {
    bridgeMock.sendMessage.mockReset();
    toastMock.showToast.mockClear();
  });

  it('carries through the current availability when saving profile edits', async () => {
    // Regression: saveProfile previously rebuilt the draft without `availability`,
    // silently dropping the field on every settings save.
    const existingAvailability = {
      status: 'from-date' as const,
      date: '2026-09-01',
      note: 'Open to remote',
      updatedAt: 100,
    };
    const storedProfile = {
      firstName: 'Ada',
      jobTitle: 'Dev',
      location: 'Lyon',
      tjmMin: 500,
      tjmMax: 700,
      keywords: ['react'],
      remote: 'any' as const,
      seniority: 'senior' as const,
      scoringWeights: null,
      experiences: [],
      availability: existingAvailability,
    };

    bridgeMock.sendMessage.mockImplementation((message: { type: string }) => {
      if (message.type === 'GET_PROFILE') {
        return Promise.resolve({ type: 'PROFILE_RESULT', payload: storedProfile });
      }
      if (message.type === 'SAVE_PROFILE') {
        // Facade expects a non-null PROFILE_RESULT payload.
        return Promise.resolve({ type: 'PROFILE_RESULT', payload: message.payload });
      }
      return Promise.resolve({ type: 'SETTINGS_RESULT', payload: null });
    });

    const controller = new SettingsPageController({ onNavigateToOnboarding: vi.fn() });
    await controller.saveProfile();

    const saveCall = bridgeMock.sendMessage.mock.calls.find((c) => c[0]?.type === 'SAVE_PROFILE');
    expect(saveCall, 'SAVE_PROFILE must be sent').toBeTruthy();
    expect((saveCall[0] as { payload: { availability: unknown } }).payload.availability).toEqual(
      existingAvailability
    );

    controller.destroy();
  });
});

describe('SettingsPageController — confirmed settings projection', () => {
  beforeEach(() => {
    bridgeMock.sendMessage.mockReset();
    toastMock.showToast.mockClear();
  });

  it('keeps the confirmed auto-scan value when persistence fails', async () => {
    bridgeMock.sendMessage.mockImplementation((message: { type: string }) => {
      if (message.type === 'GET_SETTINGS') {
        return Promise.resolve({ type: 'SETTINGS_RESULT', payload: persistedSettings });
      }
      if (message.type === 'SAVE_SETTINGS') {
        return Promise.resolve({
          type: 'SETTINGS_SAVED',
          payload: { saved: false, settings: null },
        });
      }
      if (message.type === 'GET_PROFILE') {
        return Promise.resolve({ type: 'PROFILE_RESULT', payload: null });
      }
      return Promise.resolve({ type: 'SETTINGS_RESULT', payload: null });
    });

    const controller = new SettingsPageController();
    await controller.loadSettings();

    await controller.toggleAutoScan();

    expect(controller.autoScan).toBe(true);
    expect(controller.settingsError).toBe('Impossible d’enregistrer les réglages');
    expect(toastMock.showToast).toHaveBeenCalledWith(
      'Impossible d’enregistrer les réglages',
      'error'
    );

    controller.destroy();
  });

  it('keeps every confirmed settings field unchanged after a failed write', async () => {
    bridgeMock.sendMessage.mockImplementation((message: { type: string }) => {
      if (message.type === 'GET_SETTINGS') {
        return Promise.resolve({ type: 'SETTINGS_RESULT', payload: persistedSettings });
      }
      if (message.type === 'SAVE_SETTINGS') {
        return Promise.resolve({
          type: 'SETTINGS_SAVED',
          payload: { saved: false, settings: null },
        });
      }
      if (message.type === 'GET_PROFILE') {
        return Promise.resolve({ type: 'PROFILE_RESULT', payload: null });
      }
      return Promise.resolve({ type: 'SETTINGS_RESULT', payload: null });
    });

    const controller = new SettingsPageController();
    await controller.loadSettings();
    const themeChanged = vi.fn();
    window.addEventListener('mp:theme-changed', themeChanged);

    await controller.updateScanInterval(60);
    await controller.toggleNotifications();
    await controller.updateTheme('dark');

    expect(controller.scanInterval).toBe(30);
    expect(controller.notifications).toBe(true);
    expect(controller.theme).toBe('system');
    expect(themeChanged).not.toHaveBeenCalled();

    window.removeEventListener('mp:theme-changed', themeChanged);
    controller.destroy();
  });

  it('projects the new auto-scan value only after persistence succeeds', async () => {
    bridgeMock.sendMessage.mockImplementation((message: { type: string }) => {
      if (message.type === 'GET_SETTINGS') {
        return Promise.resolve({ type: 'SETTINGS_RESULT', payload: persistedSettings });
      }
      if (message.type === 'SAVE_SETTINGS') {
        return Promise.resolve({
          type: 'SETTINGS_SAVED',
          payload: {
            saved: true,
            settings: { ...persistedSettings, autoScan: false },
          },
        });
      }
      if (message.type === 'GET_PROFILE') {
        return Promise.resolve({ type: 'PROFILE_RESULT', payload: null });
      }
      return Promise.resolve({ type: 'SETTINGS_RESULT', payload: null });
    });

    const controller = new SettingsPageController();
    await controller.loadSettings();

    await controller.toggleAutoScan();

    expect(controller.autoScan).toBe(false);
    expect(controller.settingsError).toBeNull();
    expect(toastMock.showToast).not.toHaveBeenCalledWith(expect.any(String), 'error');

    controller.destroy();
  });
});
