export interface AppSettings {
  scanIntervalMinutes: number;
  enabledConnectors: string[];
  notifications: boolean;
  autoScan: boolean;
  maxSemanticPerScan: number;
  notificationScoreThreshold: number;
  /** Respecte le rate limiting pour éviter de surcharger les serveurs (défaut: true) */
  respectRateLimits: boolean;
  /** Délai personnalisé entre les requêtes en ms (0 = utiliser les valeurs par défaut) */
  customDelayMs: number;
  /** Respecte robots.txt (défaut: true) - non implémenté pour l'instant */
  respectRobotsTxt: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  scanIntervalMinutes: 30,
  enabledConnectors: ['free-work'],
  notifications: true,
  autoScan: true,
  maxSemanticPerScan: 10,
  notificationScoreThreshold: 70,
  respectRateLimits: true,
  customDelayMs: 0,
  respectRobotsTxt: true,
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
  return { ...DEFAULT_SETTINGS, ...(result.settings as Partial<AppSettings> | undefined) };
};

export const setSettings = async (settings: AppSettings): Promise<void> => {
  await chrome.storage.local.set({ settings });
};
