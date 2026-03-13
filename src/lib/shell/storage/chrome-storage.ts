export interface AppSettings {
  scanIntervalMinutes: number;
  enabledConnectors: string[];
  notifications: boolean;
  autoScan: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  scanIntervalMinutes: 30,
  enabledConnectors: ['free-work'],
  notifications: true,
  autoScan: true,
};

export async function getApiKey(): Promise<string | null> {
  const result = await chrome.storage.local.get('apiKey');
  return (result.apiKey as string) ?? null;
}

export async function setApiKey(key: string): Promise<void> {
  await chrome.storage.local.set({ apiKey: key });
}

export async function removeApiKey(): Promise<void> {
  await chrome.storage.local.remove('apiKey');
}

export async function getSettings(): Promise<AppSettings> {
  const result = await chrome.storage.local.get('settings');
  return (result.settings as AppSettings) ?? { ...DEFAULT_SETTINGS };
}

export async function setSettings(settings: AppSettings): Promise<void> {
  await chrome.storage.local.set({ settings });
}
