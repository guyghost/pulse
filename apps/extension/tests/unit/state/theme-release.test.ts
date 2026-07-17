import { beforeEach, describe, expect, it, vi } from 'vitest';

const settingsFacade = vi.hoisted(() => ({
  getSettings: vi.fn(),
  setSettingsConfirmed: vi.fn(),
  listener: null as null | ((snapshot: unknown) => void),
}));

vi.mock('../../../src/lib/shell/facades/settings.facade', () => ({
  getSettings: settingsFacade.getSettings,
  setSettingsConfirmed: settingsFacade.setSettingsConfirmed,
}));

vi.mock('../../../src/lib/shell/facades/settings-release.facade', () => ({
  subscribeSettingsReleaseSnapshots: (listener: (snapshot: unknown) => void) => {
    settingsFacade.listener = listener;
    return () => {};
  },
}));

import { createThemeStore } from '../../../src/lib/state/theme.svelte';

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

describe('theme store Settings release projection', () => {
  beforeEach(() => {
    settingsFacade.getSettings.mockReset().mockResolvedValue(SETTINGS);
    settingsFacade.setSettingsConfirmed.mockReset();
    settingsFacade.listener = null;
    document.documentElement.classList.remove('dark');
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
  });

  it('keeps the confirmed theme when a save fails, then applies only the returned snapshot', async () => {
    const store = createThemeStore();
    await store.init();
    settingsFacade.setSettingsConfirmed.mockRejectedValueOnce(new Error('permission missing'));

    await store.setTheme('dark');
    expect(store.preference).toBe('system');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    settingsFacade.setSettingsConfirmed.mockResolvedValueOnce({ ...SETTINGS, theme: 'dark' });
    await store.setTheme('dark');
    expect(store.preference).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('converges from the facade validated snapshot stream', async () => {
    const store = createThemeStore();
    await store.init();
    settingsFacade.listener?.({
      settings: { ...SETTINGS, theme: 'dark' },
      onboardingCompleted: true,
      revision: 2,
      generation: 2,
    });

    expect(store.preference).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
