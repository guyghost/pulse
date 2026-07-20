import type { SettingsReleasePorts, SettingsReleaseScanPort } from './settings-release.coordinator';

export function createChromeSettingsReleasePorts(
  scan: SettingsReleaseScanPort
): SettingsReleasePorts {
  return {
    storage: {
      async get(keys) {
        return chrome.storage.local.get([...keys]);
      },
      async set(value) {
        await chrome.storage.local.set(value);
      },
      async remove(keys) {
        await chrome.storage.local.remove([...keys]);
      },
    },
    alarm: {
      async get() {
        return (await chrome.alarms.get('auto-scan')) ?? null;
      },
      async create(periodInMinutes) {
        await chrome.alarms.create('auto-scan', { periodInMinutes });
      },
      async clear() {
        await chrome.alarms.clear('auto-scan');
      },
    },
    permissions: {
      async contains(origins) {
        return chrome.permissions.contains({ origins: [...origins] });
      },
    },
    broadcast: {
      async publish(message) {
        if (typeof chrome.runtime.getContexts === 'function') {
          const contexts = await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] });
          if (contexts.length === 0) {
            return 'no_receiver';
          }
        }
        await chrome.runtime.sendMessage(message);
        return 'delivered';
      },
    },
    scan,
    uuid: () => crypto.randomUUID(),
  };
}
