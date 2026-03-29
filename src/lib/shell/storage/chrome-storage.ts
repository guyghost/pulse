import { z } from 'zod';

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

export type AppSettings = z.infer<typeof SettingsSchema>;

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

export const getApiKey = async (): Promise<string | null> => {
  const result = await chrome.storage.local.get('apiKey');
  return (result.apiKey as string) ?? null;
};

export const setApiKey = async (key: string): Promise<void> => {
  await chrome.storage.local.set({ apiKey: key });
};

export const removeApiKey = async (): Promise<void> => {
  await chrome.storage.local.remove('apiKey');
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
