/**
 * Chrome Storage — settings persistence.
 *
 * SECURITY: Data stored in chrome.storage.local is NOT encrypted.
 * - Settings (scan interval, connectors, thresholds, etc.) — low sensitivity
 *
 * Mitigation: Chrome extensions' storage is isolated per-extension
 * and not accessible to web pages. Physical access to the profile
 * directory would expose the data.
 */
import { z } from 'zod';
import type { AppSettings } from '../../core/types/app-settings';

const SettingsSchema = z.object({
  scanIntervalMinutes: z.number().int().min(1).max(1440),
  enabledConnectors: z.array(z.string()),
  notifications: z.boolean(),
  autoScan: z.boolean(),
  maxSemanticPerScan: z.number().int().min(0).max(100),
  notificationScoreThreshold: z.number().int().min(0).max(100),
  respectRateLimits: z.boolean(),
  customDelayMs: z.number().int().min(0).max(60000),
});

export type { AppSettings } from '../../core/types/app-settings';

const DEFAULT_SETTINGS: AppSettings = {
  scanIntervalMinutes: 30,
  enabledConnectors: ['free-work', 'lehibou', 'hiway', 'collective', 'cherry-pick'],
  notifications: true,
  autoScan: true,
  maxSemanticPerScan: 10,
  notificationScoreThreshold: 70,
  respectRateLimits: true,
  customDelayMs: 0,
};

export const getSettings = async (): Promise<AppSettings> => {
  const result = await chrome.storage.local.get('settings');
  const raw = result.settings;

  if (!raw) {
    return DEFAULT_SETTINGS;
  }

  // Validate stored settings with Zod
  const parseResult = SettingsSchema.safeParse(raw);

  if (!parseResult.success) {
    console.warn(
      '[Settings] Invalid stored settings, falling back to defaults:',
      parseResult.error.issues
    );
    return DEFAULT_SETTINGS;
  }

  // Merge with defaults to fill any missing optional fields
  return { ...DEFAULT_SETTINGS, ...parseResult.data };
};

export const setSettings = async (settings: AppSettings): Promise<void> => {
  // Validate before saving
  const parseResult = SettingsSchema.safeParse(settings);
  if (!parseResult.success) {
    const messages = parseResult.error.issues.map((i) => i.message).join(', ');
    throw new Error(`Invalid settings: ${messages}`);
  }
  await chrome.storage.local.set({ settings: parseResult.data });
};
