import { describe, it, expect } from 'vitest';
import {
  createBackup,
  validateBackup,
  serializeBackup,
  parseBackupJson,
  getBackupStats,
} from '../../../src/lib/core/backup/backup';
import type { UserProfile } from '../../../src/lib/core/types/profile';
import type { AppSettings } from '../../../src/lib/core/types/app-settings';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createTestProfile(overrides?: Partial<UserProfile>): UserProfile {
  return {
    firstName: 'Alice',
    jobTitle: 'Dev Front',
    location: 'Paris',
    remote: 'hybrid',
    seniority: 'senior',
    stack: ['Svelte', 'TypeScript'],
    tjmMin: 400,
    tjmMax: 600,
    searchKeywords: [],
    ...overrides,
  };
}

function createTestSettings(overrides?: Partial<AppSettings>): AppSettings {
  return {
    scanIntervalMinutes: 30,
    enabledConnectors: ['free-work', 'lehibou'],
    notifications: true,
    autoScan: true,
    maxSemanticPerScan: 10,
    notificationScoreThreshold: 70,
    respectRateLimits: true,
    customDelayMs: 0,
    theme: 'system',
    ...overrides,
  };
}

const BASE_FAVORITES: Record<string, number> = { 'mission-1': Date.now() };
const BASE_HIDDEN: Record<string, number> = { 'mission-2': Date.now() };
const NOW = 1_700_000_000_000;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createBackup', () => {
  it('preserves all settings fields including theme', () => {
    const settings = createTestSettings({ theme: 'dark' });
    const profile = createTestProfile();

    const backup = createBackup(profile, settings, BASE_FAVORITES, BASE_HIDDEN, NOW);

    expect(backup.settings.theme).toBe('dark');
  });

  it('preserves theme=light in backup', () => {
    const settings = createTestSettings({ theme: 'light' });
    const backup = createBackup(createTestProfile(), settings, {}, {}, NOW);

    expect(backup.settings.theme).toBe('light');
  });

  it('preserves theme=system in backup', () => {
    const settings = createTestSettings({ theme: 'system' });
    const backup = createBackup(createTestProfile(), settings, {}, {}, NOW);

    expect(backup.settings.theme).toBe('system');
  });
});

describe('validateBackup', () => {
  it('accepts a valid backup with theme=dark', () => {
    const settings = createTestSettings({ theme: 'dark' });
    const profile = createTestProfile();
    const backup = createBackup(profile, settings, BASE_FAVORITES, BASE_HIDDEN, NOW);

    const result = validateBackup(backup);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.settings.theme).toBe('dark');
    }
  });

  it('accepts a valid backup with theme=light', () => {
    const settings = createTestSettings({ theme: 'light' });
    const backup = createBackup(createTestProfile(), settings, {}, {}, NOW);

    const result = validateBackup(backup);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.settings.theme).toBe('light');
    }
  });

  it('accepts a valid backup with theme=system', () => {
    const settings = createTestSettings({ theme: 'system' });
    const backup = createBackup(createTestProfile(), settings, {}, {}, NOW);

    const result = validateBackup(backup);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.settings.theme).toBe('system');
    }
  });

  it('rejects a backup with an invalid theme value', () => {
    const profile = createTestProfile();
    // Build a backup manually with invalid theme
    const backup = {
      version: 1,
      timestamp: NOW,
      profile,
      settings: {
        ...createTestSettings(),
        theme: 'invalid-theme',
      },
      favorites: {},
      hidden: {},
    };

    const result = validateBackup(backup);

    // The backup schema should reject invalid theme values
    expect(result.ok).toBe(false);
  });

  it('accepts a V1 backup without theme field (backward compatibility)', () => {
    // Simulates an old backup created before theme was added
    const backup = {
      version: 1,
      timestamp: NOW,
      profile: createTestProfile(),
      settings: {
        scanIntervalMinutes: 30,
        enabledConnectors: ['free-work'],
        notifications: true,
        autoScan: true,
        maxSemanticPerScan: 10,
        notificationScoreThreshold: 70,
        respectRateLimits: true,
        customDelayMs: 0,
        // NO theme field — old backup
      },
      favorites: {},
      hidden: {},
    };

    const result = validateBackup(backup);

    // Old backups without theme should still be valid (backward compat)
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Theme should default to 'system' for old backups
      expect(result.value.settings.theme).toBe('system');
    }
  });

  it('rejects invalid JSON', () => {
    const result = validateBackup(null);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe('INVALID_JSON');
    }
  });

  it('rejects unsupported version', () => {
    const backup = {
      version: 999,
      timestamp: NOW,
      profile: createTestProfile(),
      settings: createTestSettings(),
      favorites: {},
      hidden: {},
    };

    const result = validateBackup(backup);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe('VERSION_UNSUPPORTED');
    }
  });
});

describe('serializeBackup + parseBackupJson round-trip with theme', () => {
  it('preserves theme through serialization round-trip', () => {
    const settings = createTestSettings({ theme: 'dark' });
    const backup = createBackup(createTestProfile(), settings, BASE_FAVORITES, BASE_HIDDEN, NOW);

    const json = serializeBackup(backup);
    const parsed = parseBackupJson(json);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const validated = validateBackup(parsed.value);
      expect(validated.ok).toBe(true);
      if (validated.ok) {
        expect(validated.value.settings.theme).toBe('dark');
      }
    }
  });
});

describe('getBackupStats', () => {
  it('returns correct stats from a backup with theme', () => {
    const backup = createBackup(
      createTestProfile({ firstName: 'Bob', jobTitle: 'Backend Dev' }),
      createTestSettings({ theme: 'dark' }),
      { m1: 100, m2: 200 },
      { m3: 300 },
      NOW
    );

    const stats = getBackupStats(backup);

    expect(stats.profileName).toBe('Bob');
    expect(stats.jobTitle).toBe('Backend Dev');
    expect(stats.favoritesCount).toBe(2);
    expect(stats.hiddenCount).toBe(1);
    expect(stats.version).toBe(1);
  });
});
