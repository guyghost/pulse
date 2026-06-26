export interface ConnectedAlertPreferences {
  enabled: boolean;
  scoreThreshold: number;
  minDailyRate: number;
  requiredStacks: string[];
  maxResults: number;
  mutedUntil: string | null;
  revision: number;
  updatedAt: string;
}

type ConnectedAlertPreferencesInput = Omit<ConnectedAlertPreferences, 'mutedUntil'> & {
  mutedUntil?: string | null;
};

export const DEFAULT_CONNECTED_ALERT_PREFERENCES: ConnectedAlertPreferences = {
  enabled: true,
  scoreThreshold: 70,
  minDailyRate: 0,
  requiredStacks: [],
  maxResults: 5,
  mutedUntil: null,
  revision: 1,
  updatedAt: '',
};

export function normalizeConnectedAlertPreferences(
  preferences: ConnectedAlertPreferencesInput
): ConnectedAlertPreferences {
  const seen = new Set<string>();
  const requiredStacks = preferences.requiredStacks.flatMap((stack) => {
    const clean = stack.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [clean.slice(0, 40)];
  });

  return {
    enabled: preferences.enabled,
    scoreThreshold: Math.max(0, Math.min(100, Math.round(preferences.scoreThreshold))),
    minDailyRate: Math.max(0, Math.min(5000, Math.round(preferences.minDailyRate))),
    requiredStacks: requiredStacks.slice(0, 12),
    maxResults: Math.max(1, Math.min(20, Math.round(preferences.maxResults))),
    mutedUntil:
      typeof preferences.mutedUntil === 'string' && preferences.mutedUntil.trim().length > 0
        ? preferences.mutedUntil.trim().slice(0, 40)
        : null,
    revision: Math.max(1, Math.round(preferences.revision)),
    updatedAt: preferences.updatedAt,
  };
}
