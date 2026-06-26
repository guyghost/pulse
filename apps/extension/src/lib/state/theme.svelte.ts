import type { ThemePreference } from '$lib/core/types/app-settings';
import { getSettings, setSettings } from '$lib/shell/facades/settings.facade';
import { subscribeMessages } from '$lib/shell/messaging/bridge';

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyClass(theme: 'light' | 'dark') {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function createThemeStore() {
  let preference = $state<ThemePreference>('system');
  let resolved = $state<'light' | 'dark'>('light');

  function resolve(p: ThemePreference): 'light' | 'dark' {
    return p === 'system' ? getSystemTheme() : p;
  }

  function sync() {
    resolved = resolve(preference);
    applyClass(resolved);
  }

  async function init() {
    try {
      const settings = await getSettings();
      preference = settings.theme ?? 'system';
    } catch {
      // Outside extension context — keep system default
      preference = 'system';
    }
    sync();

    // Listen for system changes when preference is 'system'
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', () => {
      if (preference === 'system') {
        sync();
      }
    });

    subscribeMessages((message) => {
      if (message.type === 'SETTINGS_UPDATED' && message.payload.theme !== preference) {
        preference = message.payload.theme;
        sync();
      }
    });

    // Cross-module sync for dev mode (no chrome.storage events)
    window.addEventListener('mp:theme-changed', (e) => {
      const next = (e as CustomEvent).detail as ThemePreference;
      if (next && next !== preference) {
        preference = next;
        sync();
      }
    });
  }

  async function setTheme(next: ThemePreference) {
    preference = next;
    sync();
    try {
      const settings = await getSettings();
      await setSettings({ ...settings, theme: next });
    } catch {
      // Outside extension context
    }
  }

  return {
    get preference() {
      return preference;
    },
    get resolved() {
      return resolved;
    },
    init,
    setTheme,
  };
}
