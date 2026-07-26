import type { ThemePreference } from '$lib/core/types/app-settings';
import { getSettings, setSettingsConfirmed } from '$lib/shell/facades/settings.facade';
import { subscribeSettingsReleaseSnapshots } from '$lib/shell/facades/settings-release.facade';

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

    subscribeSettingsReleaseSnapshots((snapshot) => {
      if (snapshot.settings.theme !== preference) {
        preference = snapshot.settings.theme;
        sync();
      }
    });
  }

  async function setTheme(next: ThemePreference) {
    try {
      const settings = await getSettings();
      const confirmed = await setSettingsConfirmed({ ...settings, theme: next });
      preference = confirmed.theme;
      sync();
    } catch {
      // Keep the last confirmed projection when the mutation is not committed.
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
