import { mockProfile, mockMissions, generateMockTJMHistory } from './mocks';

const storage: Record<string, unknown> = {
  settings: {
    scanIntervalMinutes: 30,
    enabledConnectors: ['free-work'],
    notifications: true,
    autoScan: true,
  },
  tjm_history: generateMockTJMHistory(),
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
          case 'GET_TRACKINGS':
            return { type: 'TRACKINGS_RESULT', payload: [] };
          case 'UPDATE_TRACKING': {
            const p = message.payload as Record<string, unknown> | undefined;
            return {
              type: 'TRACKING_UPDATED',
              payload: {
                missionId: p?.missionId,
                currentStatus: p?.status,
                history: [],
                generatedAssetIds: [],
                userRating: null,
                notes: '',
              },
            };
          }
          case 'GENERATE_ASSET':
            // In dev mode, no AI backend available (neither Gemini Nano nor premium GLM)
            console.log('[Chrome Stub] GENERATE_ASSET (no AI in dev mode):', message.payload);
            return { type: 'GENERATION_RESULT', payload: null };
          case 'GET_GENERATED_ASSETS':
            return { type: 'GENERATED_ASSETS_RESULT', payload: [] };
          case 'SHOW_TOAST':
            console.log('[Chrome Stub] Toast:', message.payload);
            return { type: 'TOAST_SHOWN' };
          case 'PROFILE_UPDATED':
            console.log('[Chrome Stub] Profile updated notification');
            return null;
          case 'AUTH_LOGIN':
            console.log('[Chrome Stub] Auth login stub:', (message.payload as Record<string, unknown>)?.email);
            return {
              type: 'AUTH_RESULT',
              payload: {
                status: 'unauthenticated',
                user: null,
                error: 'Auth not available in dev mode',
              },
            };
          case 'AUTH_SIGNUP':
            console.log('[Chrome Stub] Auth signup stub:', (message.payload as Record<string, unknown>)?.email);
            return {
              type: 'AUTH_RESULT',
              payload: {
                status: 'unauthenticated',
                user: null,
                error: 'Auth not available in dev mode',
              },
            };
          case 'AUTH_LOGOUT':
            console.log('[Chrome Stub] Auth logout stub');
            return {
              type: 'AUTH_RESULT',
              payload: { status: 'unauthenticated', user: null },
            };
          case 'AUTH_STATUS':
            return {
              type: 'AUTH_RESULT',
              payload: { status: 'unauthenticated', user: null },
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
        },
        remove: async (keys: string | string[]) => {
          const keyArr = typeof keys === 'string' ? [keys] : keys;
          for (const k of keyArr) {
            delete storage[k];
          }
        },
        clear: async () => {
          for (const k of Object.keys(storage)) {
            delete storage[k];
          }
        },
      },
      session: {
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
        },
        remove: async (keys: string | string[]) => {
          const keyArr = typeof keys === 'string' ? [keys] : keys;
          for (const k of keyArr) {
            delete storage[k];
          }
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
