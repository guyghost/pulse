export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'mp-theme';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyClass(theme: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

function resolve(p: ThemePreference): 'light' | 'dark' {
  return p === 'system' ? getSystemTheme() : p;
}

export function createThemeStore() {
  let preference = $state<ThemePreference>('system');
  let resolved = $state<'light' | 'dark'>('light');
  let initialized = false;

  function sync() {
    resolved = resolve(preference);
    applyClass(resolved);
  }

  function init() {
    if (typeof window === 'undefined') return;
    if (initialized) return;
    initialized = true;

    const stored = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    preference = stored && ['light', 'dark', 'system'].includes(stored) ? stored : 'system';
    sync();

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', () => {
      if (preference === 'system') {
        sync();
      }
    });
  }

  function setTheme(next: ThemePreference) {
    preference = next;
    sync();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, next);
    }
  }

  function cycle() {
    const order: ThemePreference[] = ['light', 'dark', 'system'];
    const idx = order.indexOf(preference);
    setTheme(order[(idx + 1) % order.length]);
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
    cycle,
  };
}

export const theme = createThemeStore();
