import { mockProfile, mockMissions, generateMockTJMHistory } from './mocks';

const STORAGE_KEY = 'missionpulse.dev.chromeStorage.local';
const SESSION_STORAGE_KEY = 'missionpulse.dev.chromeStorage.session';

const storageDefaults: Record<string, unknown> = {
  settings: {
    scanIntervalMinutes: 30,
    enabledConnectors: ['free-work'],
    notifications: true,
    autoScan: true,
  },
  tjm_history: generateMockTJMHistory(),
};

function readPersistentStore(key: string): Record<string, unknown> {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function writePersistentStore(key: string, value: Record<string, unknown>): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore persistence failures in dev stubs
  }
}

const storage: Record<string, unknown> = {
  ...storageDefaults,
  ...readPersistentStore(STORAGE_KEY),
};

const sessionStorageState: Record<string, unknown> = {
  ...readPersistentStore(SESSION_STORAGE_KEY),
};

function createChromeStubs() {
  return {
    runtime: {
      id: 'dev-mode',
      getManifest: () => ({ version: '0.1.0-dev' }),
      getURL: (path: string) => path,
      sendMessage: async (message: { type: string; payload?: unknown }) => {
        console.log('[Chrome Stub] sendMessage:', message.type);

        switch (message.type) {
          case 'GET_PROFILE':
            return { type: 'PROFILE_RESULT', payload: mockProfile };
          case 'SAVE_PROFILE':
            console.log('[Chrome Stub] Profile saved:', message.payload);
            return { type: 'PROFILE_RESULT', payload: message.payload };
          case 'SCAN_START':
            setTimeout(() => {
              window.dispatchEvent(
                new CustomEvent('dev:missions', {
                  detail: mockMissions.map((m) => ({ ...m, scrapedAt: new Date() })),
                })
              );
            }, 800);
            return {
              type: 'SCAN_STATUS',
              payload: {
                state: 'scanning',
                currentConnector: 'free-work',
                progress: 0,
                missionsFound: 0,
              },
            };
          default:
            console.log('[Chrome Stub] Unhandled message type:', message.type);
            return null;
        }
      },
      onMessage: {
        addListener: () => {},
        removeListener: () => {},
      },
    },
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const keyArr = typeof keys === 'string' ? [keys] : keys;
          const result: Record<string, unknown> = {};
          for (const k of keyArr) {
            if (k in storage) {
              result[k] = storage[k];
            }
          }
          return result;
        },
        set: async (items: Record<string, unknown>) => {
          Object.assign(storage, items);
          writePersistentStore(STORAGE_KEY, storage);
        },
        remove: async (keys: string | string[]) => {
          const keyArr = typeof keys === 'string' ? [keys] : keys;
          for (const k of keyArr) {
            delete storage[k];
          }
          writePersistentStore(STORAGE_KEY, storage);
        },
        clear: async () => {
          for (const k of Object.keys(storage)) {
            delete storage[k];
          }
          Object.assign(storage, storageDefaults);
          writePersistentStore(STORAGE_KEY, storage);
        },
      },
      session: {
        get: async (keys: string | string[]) => {
          const keyArr = typeof keys === 'string' ? [keys] : keys;
          const result: Record<string, unknown> = {};
          for (const k of keyArr) {
            if (k in sessionStorageState) {
              result[k] = sessionStorageState[k];
            }
          }
          return result;
        },
        set: async (items: Record<string, unknown>) => {
          Object.assign(sessionStorageState, items);
          writePersistentStore(SESSION_STORAGE_KEY, sessionStorageState);
        },
        remove: async (keys: string | string[]) => {
          const keyArr = typeof keys === 'string' ? [keys] : keys;
          for (const k of keyArr) {
            delete sessionStorageState[k];
          }
          writePersistentStore(SESSION_STORAGE_KEY, sessionStorageState);
        },
      },
      onChanged: {
        addListener: () => {},
        removeListener: () => {},
      },
    },
    cookies: {
      getAll: async () => [{ name: 'session', value: 'mock-session' }],
    },
    sidePanel: {
      setPanelBehavior: () => {},
    },
    alarms: {
      create: async () => {},
      clearAll: async () => {},
      onAlarm: {
        addListener: () => {},
      },
    },
    action: {
      setBadgeText: async () => {},
      setBadgeBackgroundColor: async () => {},
      setBadgeTextColor: async () => {},
      onUserSettingsChanged: {
        addListener: () => {},
      },
    },
    notifications: {
      create: async () => {},
      clear: async () => {},
      onClicked: {
        addListener: () => {},
      },
    },
    tabs: {
      query: async () => [{ id: 1 }],
    },
  };
}

export function installChromeStubs(): void {
  if (!globalThis.chrome?.runtime?.id) {
    (globalThis as Record<string, unknown>).chrome = createChromeStubs();
    console.log('[Dev] Chrome API stubs installed');
  }
}
