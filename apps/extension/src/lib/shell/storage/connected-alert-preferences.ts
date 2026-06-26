import { z } from 'zod';
import {
  normalizeConnectedAlertPreferences,
  type ConnectedAlertPreferences,
} from '../../core/types/alert-preferences';

const CONNECTED_ALERT_PREFERENCES_KEY = 'missionpulse.connectedAlertPreferences';

const ConnectedAlertPreferencesSchema = z.object({
  enabled: z.boolean(),
  scoreThreshold: z.number().int().min(0).max(100),
  minDailyRate: z.number().int().min(0).max(5000),
  requiredStacks: z.array(z.string()),
  maxResults: z.number().int().min(1).max(20),
  mutedUntil: z.string().max(40).nullable().optional().default(null),
  revision: z.number().int().min(1),
  updatedAt: z.string(),
});

export async function getConnectedAlertPreferences(): Promise<ConnectedAlertPreferences | null> {
  try {
    const stored = await chrome.storage.local.get(CONNECTED_ALERT_PREFERENCES_KEY);
    const parsed = ConnectedAlertPreferencesSchema.safeParse(
      stored[CONNECTED_ALERT_PREFERENCES_KEY]
    );

    return parsed.success ? normalizeConnectedAlertPreferences(parsed.data) : null;
  } catch {
    return null;
  }
}

export async function saveConnectedAlertPreferences(
  preferences: ConnectedAlertPreferences
): Promise<void> {
  await chrome.storage.local.set({
    [CONNECTED_ALERT_PREFERENCES_KEY]: normalizeConnectedAlertPreferences(preferences),
  });
}

export async function clearConnectedAlertPreferences(): Promise<void> {
  await chrome.storage.local.remove(CONNECTED_ALERT_PREFERENCES_KEY);
}
