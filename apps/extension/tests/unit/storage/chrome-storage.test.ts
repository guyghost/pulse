import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string | string[]) => {
        if (Array.isArray(key)) {
          const result: Record<string, unknown> = {};
          for (const k of key) {
            if (mockStorage[k] !== undefined) {
              result[k] = mockStorage[k];
            }
          }
          return result;
        }
        return { [key]: mockStorage[key] };
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      }),
      remove: vi.fn(async () => {}),
    },
  },
});

import {
  getFeedSavedViews,
  getSettings,
  setFeedSavedViews,
  setSettings,
} from '../../../src/lib/shell/storage/chrome-storage';

describe('getSettings', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }
  });

  it('returns defaults with autoScan true', async () => {
    const settings = await getSettings();
    expect(settings.autoScan).toBe(true);
    expect(settings.scanIntervalMinutes).toBe(30);
  });

  it('returns all default values when storage is empty', async () => {
    const settings = await getSettings();
    expect(settings).toEqual({
      scanIntervalMinutes: 30,
      enabledConnectors: ['cherry-pick', 'collective', 'free-work', 'hiway', 'lehibou', 'malt'],
      notifications: true,
      autoScan: true,
      maxSemanticPerScan: 10,
      notificationScoreThreshold: 70,
      respectRateLimits: true,
      customDelayMs: 0,
      theme: 'system',
    });
  });

  // ---------------------------------------------------------------------------
  // Settings validation fallback tests (reliability hardening)
  // ---------------------------------------------------------------------------

  it('returns complete valid settings when all fields are valid', async () => {
    mockStorage.settings = {
      scanIntervalMinutes: 60,
      enabledConnectors: ['free-work', 'collective'],
      notifications: false,
      autoScan: false,
      maxSemanticPerScan: 20,
      notificationScoreThreshold: 85,
      respectRateLimits: false,
      customDelayMs: 2000,
      theme: 'system',
    };

    const settings = await getSettings();

    expect(settings.scanIntervalMinutes).toBe(60);
    expect(settings.enabledConnectors).toEqual(['collective', 'free-work']);
    expect(settings.notifications).toBe(false);
    expect(settings.autoScan).toBe(false);
    expect(settings.maxSemanticPerScan).toBe(20);
    expect(settings.notificationScoreThreshold).toBe(85);
    expect(settings.respectRateLimits).toBe(false);
    expect(settings.customDelayMs).toBe(2000);
    expect(settings.theme).toBe('system');
  });

  it('falls back to defaults when stored settings are partial (missing fields)', async () => {
    // Partial settings missing required fields - should fall back to defaults
    mockStorage.settings = {
      scanIntervalMinutes: 60,
      notifications: false,
      theme: 'dark',
    };

    const settings = await getSettings();

    // Falls back to ALL defaults because validation fails
    expect(settings.scanIntervalMinutes).toBe(30); // default, not 60
    expect(settings.notifications).toBe(true); // default, not false
    expect(settings.autoScan).toBe(true);
    expect(settings.theme).toBe('system');
  });

  it('strips unknown fields and keeps valid settings', async () => {
    // Zod by default uses passthrough mode - strips unknown fields rather than rejecting
    mockStorage.settings = {
      unknownField: 'should be ignored',
      scanIntervalMinutes: 15,
      enabledConnectors: ['free-work'],
      notifications: true,
      autoScan: true,
      maxSemanticPerScan: 10,
      notificationScoreThreshold: 70,
      respectRateLimits: true,
      customDelayMs: 0,
      theme: 'system',
    };

    const settings = await getSettings();

    // Unknown field is stripped, valid settings are kept
    expect(settings.scanIntervalMinutes).toBe(15);
    expect((settings as unknown as Record<string, unknown>).unknownField).toBeUndefined();
  });

  it('falls back to defaults when stored settings have invalid types', async () => {
    mockStorage.settings = {
      scanIntervalMinutes: 'not-a-number',
      enabledConnectors: ['free-work'],
      notifications: true,
      autoScan: true,
      maxSemanticPerScan: 10,
      notificationScoreThreshold: 70,
      respectRateLimits: true,
      customDelayMs: 0,
      theme: 'system',
    };

    const settings = await getSettings();

    // Falls back to defaults because validation fails
    expect(settings.scanIntervalMinutes).toBe(30);
  });

  it('falls back to defaults when scanIntervalMinutes is out of range', async () => {
    mockStorage.settings = {
      scanIntervalMinutes: 0, // Below min of 1
      enabledConnectors: ['free-work'],
      notifications: true,
      autoScan: true,
      maxSemanticPerScan: 10,
      notificationScoreThreshold: 70,
      respectRateLimits: true,
      customDelayMs: 0,
      theme: 'system',
    };

    const settings = await getSettings();

    expect(settings.scanIntervalMinutes).toBe(30); // default
  });

  it('falls back to defaults when notificationScoreThreshold is above max', async () => {
    mockStorage.settings = {
      scanIntervalMinutes: 30,
      enabledConnectors: ['free-work'],
      notifications: true,
      autoScan: true,
      maxSemanticPerScan: 10,
      notificationScoreThreshold: 150, // Above max of 100
      respectRateLimits: true,
      customDelayMs: 0,
      theme: 'system',
    };

    const settings = await getSettings();

    expect(settings.notificationScoreThreshold).toBe(70); // default
  });

  it('falls back to defaults when enabledConnectors is not an array', async () => {
    mockStorage.settings = {
      scanIntervalMinutes: 30,
      enabledConnectors: 'not-an-array',
      notifications: true,
      autoScan: true,
      maxSemanticPerScan: 10,
      notificationScoreThreshold: 70,
      respectRateLimits: true,
      customDelayMs: 0,
      theme: 'system',
    };

    const settings = await getSettings();

    expect(settings.enabledConnectors).toEqual([
      'cherry-pick',
      'collective',
      'free-work',
      'hiway',
      'lehibou',
      'malt',
    ]); // default
  });
});

describe('setSettings', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }
  });

  it('persists theme=dark and reads it back', async () => {
    const current = await getSettings();
    await setSettings({ ...current, theme: 'dark' });

    const settings = await getSettings();
    expect(settings.theme).toBe('dark');
  });

  it('persists theme=light and reads it back', async () => {
    const current = await getSettings();
    await setSettings({ ...current, theme: 'light' });

    const settings = await getSettings();
    expect(settings.theme).toBe('light');
  });

  it('rejects an invalid theme value', async () => {
    const current = await getSettings();
    await expect(setSettings({ ...current, theme: 'neon' as unknown as 'light' })).rejects.toThrow(
      'Invalid settings'
    );
  });

  it('accepts restored settings when theme is explicitly provided', async () => {
    // Simulate old code that dropped theme, then restore it explicitly before saving
    const { theme: _, ...settingsWithoutTheme } = await getSettings();
    // The persisted payload must include theme; restoration code fills it with the default value.
    await setSettings({ ...settingsWithoutTheme, theme: 'system' });
  });
});

describe('feed saved views storage', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }
  });

  it('returns an empty list when no saved views exist', async () => {
    await expect(getFeedSavedViews()).resolves.toEqual([]);
  });

  it('persists valid saved views and reads them back', async () => {
    const views = [
      {
        id: 'view-1',
        name: 'Prioritaires',
        filters: {
          searchQuery: '',
          selectedStacks: ['Svelte'],
          selectedSource: null,
          selectedRemote: 'full' as const,
          selectedSeniority: 'senior' as const,
          selectedScoreBucket: 'strong' as const,
          decisionPreset: null,
          showNewOnly: false,
          showFavoritesOnly: false,
          showHidden: false,
          sortBy: 'score' as const,
        },
        createdAt: 1779436800000,
        updatedAt: 1779436800000,
      },
    ];

    await setFeedSavedViews(views);

    await expect(getFeedSavedViews()).resolves.toEqual(views);
  });

  it('falls back to an empty list when stored saved views are invalid', async () => {
    mockStorage.feedSavedViews = [{ id: 'bad-view', name: '', filters: {} }];

    await expect(getFeedSavedViews()).resolves.toEqual([]);
  });

  it('rejects more than 12 saved views', async () => {
    const views = Array.from({ length: 13 }, (_, index) => ({
      id: `view-${index}`,
      name: `Vue ${index}`,
      filters: {
        searchQuery: '',
        selectedStacks: [],
        selectedSource: null,
        selectedRemote: null,
        selectedSeniority: null,
        selectedScoreBucket: null,
        decisionPreset: null,
        showNewOnly: false,
        showFavoritesOnly: false,
        showHidden: false,
        sortBy: 'score' as const,
      },
      createdAt: 1779436800000,
      updatedAt: 1779436800000,
    }));

    await expect(setFeedSavedViews(views)).rejects.toThrow('Invalid feed saved views');
  });
});
