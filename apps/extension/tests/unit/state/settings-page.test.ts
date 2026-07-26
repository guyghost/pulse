import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridgeMock = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  listeners: [] as Array<(message: unknown) => void>,
}));

const toastMock = vi.hoisted(() => ({
  showToast: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/lib/shell/messaging/bridge', () => ({
  sendMessage: bridgeMock.sendMessage,
  subscribeMessages: (listener: (message: unknown) => void) => {
    bridgeMock.listeners.push(listener);
    return () => {
      bridgeMock.listeners = bridgeMock.listeners.filter((candidate) => candidate !== listener);
    };
  },
}));

vi.mock('../../../src/lib/shell/notifications/toast-service', () => ({
  showToast: toastMock.showToast,
  showToastAction: vi.fn(),
}));

import { SettingsPageController } from '../../../src/lib/state/settings-page.svelte';
import { resetSettingsReleaseFacadeForTests } from '../../../src/lib/shell/facades/settings-release.facade';

const RESET_AVAILABLE = { status: 'available' as const, reason: null };

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

function confirmedSettings(settings = persistedSettings, revision = 0, generation = revision) {
  return {
    type: 'SETTINGS_RELEASE_RESULT',
    payload: {
      status: 'confirmed',
      snapshot: { settings, onboardingCompleted: true, revision, generation },
    },
  };
}

function committedSettings(message: {
  payload: { requestId: string; kind: string; settings?: typeof persistedSettings };
}) {
  const settings = message.payload.settings ?? persistedSettings;
  return {
    type: 'SETTINGS_RELEASE_MUTATION_RESULT',
    payload: {
      status: 'settled',
      outcome: {
        commandId: 'settings-release:92000000-0000-4000-8000-000000000001:1:command',
        requestId: message.payload.requestId,
        intentDigest: '0'.repeat(64),
        kind: message.payload.kind,
        settledRevision: 1,
        settledGeneration: 1,
        snapshot: { settings, onboardingCompleted: true, revision: 1, generation: 1 },
        status: 'committed',
        reason: 'committed',
      },
    },
  };
}

beforeEach(() => {
  resetSettingsReleaseFacadeForTests();
  bridgeMock.listeners = [];
});

const shippedConnectorCatalog = [
  {
    id: 'free-work' as const,
    name: 'Free-Work',
    icon: 'free-work.svg',
    url: 'https://www.free-work.com',
    hostPermissions: ['https://www.free-work.com/*'],
  },
  {
    id: 'malt' as const,
    name: 'Malt',
    icon: 'malt.svg',
    url: 'https://www.malt.fr',
    hostPermissions: ['https://*.malt.fr/*'],
  },
] as const;

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
    const controller = new SettingsPageController({
      onNavigateToOnboarding,
      resetAvailability: RESET_AVAILABLE,
    });
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
    const controller = new SettingsPageController({
      onNavigateToOnboarding,
      resetAvailability: RESET_AVAILABLE,
    });
    controller.showResetConfirm = true;

    await controller.resetAll();

    expect(controller.resetError).toBeNull();
    expect(controller.showResetConfirm).toBe(false);
    expect(onNavigateToOnboarding).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('emits no reset command while the model-owned runtime capability is unavailable', async () => {
    const onNavigateToOnboarding = vi.fn();
    const controller = new SettingsPageController({ onNavigateToOnboarding });
    controller.showResetConfirm = true;

    await controller.resetAll();

    expect(bridgeMock.sendMessage).not.toHaveBeenCalledWith({ type: 'RESET_LOCAL_DATA' });
    expect(controller.resetError).toBe(
      'Réinitialisation indisponible : coordination de sécurité en cours de finalisation.'
    );
    expect(onNavigateToOnboarding).not.toHaveBeenCalled();

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
      if (message.type === 'GET_SETTINGS_RELEASE') {
        return Promise.resolve(confirmedSettings());
      }
      if (message.type === 'MUTATE_SETTINGS_RELEASE') {
        return Promise.resolve({
          type: 'SETTINGS_RELEASE_MUTATION_RESULT',
          payload: {
            status: 'blocked',
            requestId: (message as { payload: { requestId: string } }).payload.requestId,
            commandId: null,
            reason: 'actor_blocked',
            snapshot: null,
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
      if (message.type === 'GET_SETTINGS_RELEASE') {
        return Promise.resolve(confirmedSettings());
      }
      if (message.type === 'MUTATE_SETTINGS_RELEASE') {
        return Promise.resolve({
          type: 'SETTINGS_RELEASE_MUTATION_RESULT',
          payload: {
            status: 'blocked',
            requestId: (message as { payload: { requestId: string } }).payload.requestId,
            commandId: null,
            reason: 'actor_blocked',
            snapshot: null,
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
    bridgeMock.sendMessage.mockImplementation((message: { type: string; payload?: unknown }) => {
      if (message.type === 'GET_SETTINGS_RELEASE') {
        return Promise.resolve(confirmedSettings());
      }
      if (message.type === 'MUTATE_SETTINGS_RELEASE') {
        return Promise.resolve(
          committedSettings(message as Parameters<typeof committedSettings>[0])
        );
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

  it('converges to a newer validated broadcast without a local optimistic write', async () => {
    bridgeMock.sendMessage.mockImplementation((message: { type: string }) => {
      if (message.type === 'GET_SETTINGS_RELEASE') {
        return Promise.resolve(confirmedSettings());
      }
      if (message.type === 'GET_PROFILE') {
        return Promise.resolve({ type: 'PROFILE_RESULT', payload: null });
      }
      return Promise.resolve({ type: 'SETTINGS_RESULT', payload: null });
    });
    const controller = new SettingsPageController({ connectorCatalog: shippedConnectorCatalog });
    await controller.loadSettings();

    for (const listener of [...bridgeMock.listeners]) {
      listener({
        type: 'SETTINGS_RELEASE_UPDATED',
        payload: {
          snapshot: {
            settings: {
              ...persistedSettings,
              enabledConnectors: ['free-work', 'malt'],
              theme: 'dark',
            },
            onboardingCompleted: true,
            revision: 2,
            generation: 2,
          },
          commandId: 'settings-release:92000000-0000-4000-8000-000000000001:2:command',
          broadcastId: 'settings-release:92000000-0000-4000-8000-000000000001:2:command:broadcast',
        },
      });
    }

    expect(controller.theme).toBe('dark');
    expect(controller.enabledConnectorIds).toEqual(['free-work', 'malt']);
    controller.destroy();
  });
});

describe('SettingsPageController — shipped connector catalogue', () => {
  beforeEach(() => {
    bridgeMock.sendMessage.mockReset();
    toastMock.showToast.mockClear();
  });

  it('projects only connectors included in the current build', async () => {
    bridgeMock.sendMessage.mockImplementation((message: { type: string }) => {
      if (message.type === 'GET_SETTINGS_RELEASE') {
        return Promise.resolve(confirmedSettings());
      }
      if (message.type === 'GET_PROFILE') {
        return Promise.resolve({ type: 'PROFILE_RESULT', payload: null });
      }
      return Promise.resolve({ type: 'SETTINGS_RESULT', payload: null });
    });

    const controller = new SettingsPageController({
      connectorCatalog: shippedConnectorCatalog,
    });
    await controller.loadSettings();

    expect(controller.connectorSources.map((source) => source.id)).toEqual(['free-work', 'malt']);
    expect(controller.connectorSources.map((source) => source.name)).not.toContain('LeHibou');
    expect(controller.connectorSources.find((source) => source.id === 'free-work')?.enabled).toBe(
      true
    );
    expect(controller.connectorSources.find((source) => source.id === 'malt')?.enabled).toBe(false);

    controller.destroy();
  });

  it('enables a shipped connector only after the settings write is confirmed', async () => {
    bridgeMock.sendMessage.mockImplementation((message: { type: string; payload?: unknown }) => {
      if (message.type === 'GET_SETTINGS_RELEASE') {
        return Promise.resolve(confirmedSettings());
      }
      if (message.type === 'MUTATE_SETTINGS_RELEASE') {
        return Promise.resolve(
          committedSettings(message as Parameters<typeof committedSettings>[0])
        );
      }
      if (message.type === 'GET_PROFILE') {
        return Promise.resolve({ type: 'PROFILE_RESULT', payload: null });
      }
      return Promise.resolve({ type: 'SETTINGS_RESULT', payload: null });
    });

    const controller = new SettingsPageController({
      connectorCatalog: shippedConnectorCatalog,
    });
    await controller.loadSettings();

    await controller.toggleConnector('malt');

    expect(controller.connectorSources.find((source) => source.id === 'malt')?.enabled).toBe(true);
    const saveCall = bridgeMock.sendMessage.mock.calls.find(
      (call) => call[0]?.type === 'MUTATE_SETTINGS_RELEASE'
    );
    expect(saveCall?.[0]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          settings: expect.objectContaining({ enabledConnectors: ['free-work', 'malt'] }),
        }),
      })
    );

    controller.destroy();
  });

  it('rebases a connector toggle on the newest canonical snapshot before saving', async () => {
    let reads = 0;
    const newestSettings = {
      ...persistedSettings,
      enabledConnectors: ['free-work', 'malt'],
      theme: 'dark' as const,
    };
    bridgeMock.sendMessage.mockImplementation((message: { type: string; payload?: unknown }) => {
      if (message.type === 'GET_SETTINGS_RELEASE') {
        reads += 1;
        return Promise.resolve(
          reads === 1 ? confirmedSettings() : confirmedSettings(newestSettings, 1, 1)
        );
      }
      if (message.type === 'MUTATE_SETTINGS_RELEASE') {
        const committed = committedSettings(message as Parameters<typeof committedSettings>[0]);
        committed.payload.outcome.settledRevision = 2;
        committed.payload.outcome.settledGeneration = 2;
        committed.payload.outcome.snapshot.revision = 2;
        committed.payload.outcome.snapshot.generation = 2;
        return Promise.resolve(committed);
      }
      if (message.type === 'GET_PROFILE') {
        return Promise.resolve({ type: 'PROFILE_RESULT', payload: null });
      }
      return Promise.resolve({ type: 'SETTINGS_RESULT', payload: null });
    });
    const controller = new SettingsPageController({ connectorCatalog: shippedConnectorCatalog });
    await controller.loadSettings();

    await controller.toggleConnector('malt');

    const saveCall = bridgeMock.sendMessage.mock.calls.find(
      (call) => call[0]?.type === 'MUTATE_SETTINGS_RELEASE'
    );
    expect(saveCall?.[0]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          baseRevision: 1,
          settings: expect.objectContaining({
            enabledConnectors: ['free-work'],
            theme: 'dark',
          }),
        }),
      })
    );
    expect(controller.enabledConnectorIds).toEqual(['free-work']);
    controller.destroy();
  });
});
