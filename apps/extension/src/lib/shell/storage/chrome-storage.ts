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
import type { SavedFeedView } from '../../core/types/feed-view';
import { INCLUDED_CONNECTOR_IDS } from '../connectors/build-config';

const SettingsSchema = z.object({
  scanIntervalMinutes: z.number().int().min(1).max(1440),
  enabledConnectors: z.array(z.string()),
  notifications: z.boolean(),
  autoScan: z.boolean(),
  maxSemanticPerScan: z.number().int().min(0).max(100),
  notificationScoreThreshold: z.number().int().min(0).max(100),
  respectRateLimits: z.boolean(),
  customDelayMs: z.number().int().min(0).max(60000),
  theme: z.enum(['light', 'dark', 'system']).default('system'),
});

export type { AppSettings } from '../../core/types/app-settings';

export const DEFAULT_SETTINGS: AppSettings = {
  scanIntervalMinutes: 30,
  // Intersect with connectors shipped in this build so excluded connectors
  // never appear as "enabled" defaults (see connector-build-config.model.md).
  // Copy into a new array so the build-time constant can't be mutated by callers
  // changing DEFAULT_SETTINGS.enabledConnectors.
  enabledConnectors: [...INCLUDED_CONNECTOR_IDS],
  notifications: true,
  autoScan: true,
  maxSemanticPerScan: 10,
  notificationScoreThreshold: 70,
  respectRateLimits: true,
  customDelayMs: 0,
  theme: 'system',
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
    if (import.meta.env.DEV) {
      console.warn(
        '[Settings] Invalid stored settings, falling back to defaults:',
        parseResult.error.issues
      );
    }
    return DEFAULT_SETTINGS;
  }

  // Merge with defaults to fill any missing optional fields
  const merged: AppSettings = { ...DEFAULT_SETTINGS, ...parseResult.data };

  // Sanitize enabledConnectors against this build's catalog: drop any id that
  // isn't shipped (e.g. a connector excluded at build time but still present in
  // previously stored user settings). See connector-build-config.model.md.
  const included = new Set<string>(INCLUDED_CONNECTOR_IDS);
  merged.enabledConnectors = merged.enabledConnectors.filter((id) => included.has(id));

  return merged;
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

// ============================================================================
// Feed Sort Preference
// ============================================================================

const FEED_SORT_KEY = 'feedSortBy';
const VALID_SORT_VALUES = ['score', 'date', 'tjm'] as const;
type FeedSortBy = (typeof VALID_SORT_VALUES)[number];

export const getFeedSortBy = async (): Promise<FeedSortBy> => {
  try {
    const result = await chrome.storage.local.get(FEED_SORT_KEY);
    const stored = result[FEED_SORT_KEY] as string;
    if (VALID_SORT_VALUES.includes(stored as FeedSortBy)) {
      return stored as FeedSortBy;
    }
  } catch {
    // Outside extension context
  }
  return 'score';
};

export const setFeedSortBy = async (value: FeedSortBy): Promise<void> => {
  try {
    await chrome.storage.local.set({ [FEED_SORT_KEY]: value });
  } catch {
    // Outside extension context
  }
};

// ============================================================================
// Feed Saved Views
// ============================================================================

const FEED_SAVED_VIEWS_KEY = 'feedSavedViews';

const FeedSavedViewSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().min(1).max(48),
    filters: z
      .object({
        searchQuery: z.string().max(120),
        selectedStacks: z.array(z.string().min(1).max(48)).max(24),
        selectedSource: z
          .enum(['free-work', 'lehibou', 'hiway', 'collective', 'cherry-pick', 'malt'])
          .nullable(),
        selectedRemote: z.enum(['full', 'hybrid', 'onsite']).nullable(),
        selectedSeniority: z.enum(['junior', 'confirmed', 'senior']).nullable(),
        selectedScoreBucket: z.enum(['strong', 'good', 'weak']).nullable(),
        decisionPreset: z
          .enum(['priority', 'remote-compatible', 'tjm-negotiation', 'new'])
          .nullable()
          .default(null),
        showNewOnly: z.boolean(),
        showFavoritesOnly: z.boolean(),
        showHidden: z.boolean(),
        sortBy: z.enum(VALID_SORT_VALUES),
      })
      .strict(),
    createdAt: z.number().int().min(0),
    updatedAt: z.number().int().min(0),
  })
  .strict();

const FeedSavedViewsSchema = z.array(FeedSavedViewSchema).max(12);

export const getFeedSavedViews = async (): Promise<SavedFeedView[]> => {
  try {
    const result = await chrome.storage.local.get(FEED_SAVED_VIEWS_KEY);
    const parseResult = FeedSavedViewsSchema.safeParse(result[FEED_SAVED_VIEWS_KEY]);
    if (parseResult.success) {
      return parseResult.data;
    }
  } catch {
    // Outside extension context
  }
  return [];
};

export const setFeedSavedViews = async (views: SavedFeedView[]): Promise<void> => {
  const parseResult = FeedSavedViewsSchema.safeParse(views);
  if (!parseResult.success) {
    const messages = parseResult.error.issues.map((i) => i.message).join(', ');
    throw new Error(`Invalid feed saved views: ${messages}`);
  }

  try {
    await chrome.storage.local.set({ [FEED_SAVED_VIEWS_KEY]: parseResult.data });
  } catch {
    // Outside extension context
  }
};
