import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ShellWindow = Window & {
  __missionPulseAppMounted?: boolean;
  __missionPulsePerfForceOnboardingShell?: boolean;
};

const SETTINGS = {
  scanIntervalMinutes: 30,
  enabledConnectors: ['free-work'],
  notifications: true,
  autoScan: true,
  maxSemanticPerScan: 10,
  notificationScoreThreshold: 70,
  respectRateLimits: true,
  customDelayMs: 0,
  theme: 'system',
};

function installBridge(onboardingCompleted: boolean | null, snapshotOverride?: unknown) {
  const sendMessage = vi.fn(async (message: { type: string }) => {
    if (message.type === 'GET_PROFILE') {
      return { type: 'PROFILE_RESULT', payload: null };
    }
    if (message.type === 'GET_FIRST_SCAN_DONE') {
      return { type: 'FIRST_SCAN_DONE_RESULT', payload: false };
    }
    if (message.type === 'GET_SETTINGS_RELEASE') {
      return onboardingCompleted === null
        ? {
            type: 'SETTINGS_RELEASE_RESULT',
            payload: { status: 'unavailable', reason: 'actor_blocked', snapshot: null },
          }
        : {
            type: 'SETTINGS_RELEASE_RESULT',
            payload: {
              status: 'confirmed',
              snapshot:
                snapshotOverride ??
                ({
                  settings: SETTINGS,
                  onboardingCompleted,
                  revision: 0,
                  generation: 0,
                } as const),
            },
          };
    }
    throw new Error(`Unexpected message: ${message.type}`);
  });
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  return sendMessage;
}

async function bootShell(): Promise<void> {
  await import('../../../src/sidepanel/shell-boot');
  await Promise.resolve();
  await Promise.resolve();
}

describe('side panel shell boot', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<main id="app"><p data-original>Chargement</p></main>';
    delete (window as ShellWindow).__missionPulseAppMounted;
    delete (window as ShellWindow).__missionPulsePerfForceOnboardingShell;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the confirmed Settings release snapshot for the onboarding shell decision', async () => {
    const sendMessage = installBridge(false);
    await bootShell();

    expect(sendMessage.mock.calls.map(([message]) => message.type)).toEqual([
      'GET_PROFILE',
      'GET_FIRST_SCAN_DONE',
      'GET_SETTINGS_RELEASE',
    ]);
    expect(document.querySelector('[data-initial-shell]')).not.toBeNull();
  });

  it('keeps the existing shell when the Settings release snapshot is unavailable', async () => {
    installBridge(null);
    await bootShell();

    expect(document.querySelector('[data-original]')).not.toBeNull();
    expect(document.querySelector('[data-initial-shell]')).toBeNull();
  });

  it('keeps the existing shell when any nested Settings snapshot field is malformed', async () => {
    installBridge(false, {
      settings: { ...SETTINGS, enabledConnectors: ['lehibou', 'free-work'] },
      onboardingCompleted: false,
      revision: 0,
      generation: 0,
    });
    await bootShell();

    expect(document.querySelector('[data-original]')).not.toBeNull();
    expect(document.querySelector('[data-initial-shell]')).toBeNull();
  });

  it('never overwrites the DOM after the Svelte mount boundary', async () => {
    installBridge(false);
    (window as ShellWindow).__missionPulseAppMounted = true;
    await bootShell();

    expect(document.querySelector('[data-original]')).not.toBeNull();
    expect(document.querySelector('[data-initial-shell]')).toBeNull();
  });
});
