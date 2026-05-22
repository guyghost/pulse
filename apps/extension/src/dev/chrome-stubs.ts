import { mockProfile, mockMissions, generateMockTJMHistory } from './mocks';

const storage: Record<string, unknown> = {
  settings: {
    scanIntervalMinutes: 30,
    enabledConnectors: ['free-work'],
    notifications: true,
    autoScan: true,
    maxSemanticPerScan: 10,
    notificationScoreThreshold: 70,
    respectRateLimits: true,
    customDelayMs: 0,
    theme: 'system',
  },
  favoriteMissions: {},
  hiddenMissions: {},
  seenMissions: [],
  newMissionCount: 0,
  feedSortBy: 'score',
  first_scan_done: true,
  profile_banner_dismissed: false,
  onboarding_completed: true,
  feed_tour_seen: false,
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
          case 'GET_SETTINGS':
            return { type: 'SETTINGS_RESULT', payload: storage.settings };
          case 'SAVE_SETTINGS':
            storage.settings = message.payload;
            return { type: 'SETTINGS_SAVED', payload: { saved: true, settings: message.payload } };
          case 'GET_PROFILE':
            return { type: 'PROFILE_RESULT', payload: mockProfile };
          case 'SAVE_PROFILE':
            console.log('[Chrome Stub] Profile saved:', message.payload);
            return { type: 'PROFILE_RESULT', payload: message.payload };
          case 'VERIFY_PROFILE_PAGE': {
            const p = message.payload as Record<string, unknown> | undefined;
            return {
              type: 'PROFILE_PAGE_VERIFIED',
              payload: {
                read: { status: 'blocked', finalUrl: String(p?.url ?? ''), reason: 'dev-mode' },
                comparisons: [],
                summary: { matches: 0, mismatches: 0, missing: 0 },
              },
            };
          }
          case 'GET_FEED_MISSIONS':
            return {
              type: 'FEED_MISSIONS_RESULT',
              payload: mockMissions.map((m) => ({ ...m, scrapedAt: new Date() })),
            };
          case 'GET_FEED_FAVORITES':
            return { type: 'FEED_FAVORITES_RESULT', payload: storage.favoriteMissions };
          case 'SAVE_FEED_FAVORITES':
            storage.favoriteMissions = message.payload;
            return { type: 'FEED_FAVORITES_SAVED', payload: { saved: true } };
          case 'GET_FEED_HIDDEN':
            return { type: 'FEED_HIDDEN_RESULT', payload: storage.hiddenMissions };
          case 'SAVE_FEED_HIDDEN':
            storage.hiddenMissions = message.payload;
            return { type: 'FEED_HIDDEN_SAVED', payload: { saved: true } };
          case 'GET_FEED_SORT':
            return { type: 'FEED_SORT_RESULT', payload: storage.feedSortBy };
          case 'SAVE_FEED_SORT':
            storage.feedSortBy = message.payload;
            return { type: 'FEED_SORT_SAVED', payload: { saved: true } };
          case 'GET_SEEN_MISSIONS':
            return { type: 'SEEN_MISSIONS_RESULT', payload: storage.seenMissions };
          case 'SAVE_SEEN_MISSIONS':
            storage.seenMissions = message.payload;
            return { type: 'SEEN_MISSIONS_SAVED', payload: { saved: true } };
          case 'RESET_NEW_MISSION_COUNT':
            storage.newMissionCount = 0;
            return { type: 'NEW_MISSION_COUNT_RESET', payload: { reset: true } };
          case 'GET_PERSISTED_CONNECTOR_STATUSES':
            return { type: 'PERSISTED_CONNECTOR_STATUSES_RESULT', payload: [] };
          case 'CLEAR_EXTENSION_BADGE':
            storage.newMissionCount = 0;
            return { type: 'EXTENSION_BADGE_CLEARED', payload: { cleared: true } };
          case 'OPEN_EXTERNAL_URL':
            console.log('[Chrome Stub] Open external URL:', message.payload);
            return { type: 'EXTERNAL_URL_OPENED', payload: { opened: true } };
          case 'GET_FIRST_SCAN_DONE':
            return { type: 'FIRST_SCAN_DONE_RESULT', payload: storage.first_scan_done === true };
          case 'GET_PROFILE_BANNER_DISMISSED':
            return {
              type: 'PROFILE_BANNER_DISMISSED_RESULT',
              payload: storage.profile_banner_dismissed === true,
            };
          case 'SET_PROFILE_BANNER_DISMISSED':
            storage.profile_banner_dismissed = true;
            return { type: 'PROFILE_BANNER_DISMISSED_SET', payload: { saved: true } };
          case 'GET_ONBOARDING_COMPLETED':
            return {
              type: 'ONBOARDING_COMPLETED_RESULT',
              payload: storage.onboarding_completed === true,
            };
          case 'SET_ONBOARDING_COMPLETED':
            storage.onboarding_completed = true;
            return { type: 'ONBOARDING_COMPLETED_SET', payload: { saved: true } };
          case 'CLEAR_ONBOARDING_COMPLETED':
            storage.onboarding_completed = false;
            return { type: 'ONBOARDING_COMPLETED_CLEARED', payload: { cleared: true } };
          case 'GET_FEED_TOUR_SEEN':
            return { type: 'FEED_TOUR_SEEN_RESULT', payload: storage.feed_tour_seen === true };
          case 'SET_FEED_TOUR_SEEN':
            storage.feed_tour_seen = true;
            return { type: 'FEED_TOUR_SEEN_SET', payload: { saved: true } };
          case 'CLEAR_FEED_TOUR_SEEN':
            storage.feed_tour_seen = false;
            return { type: 'FEED_TOUR_SEEN_CLEARED', payload: { cleared: true } };
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
                nextActionAt: null,
              },
            };
          }
          case 'UPDATE_TRACKING_DETAILS': {
            const p = message.payload as Record<string, unknown> | undefined;
            return {
              type: 'TRACKING_UPDATED',
              payload: {
                missionId: p?.missionId,
                currentStatus: 'detected',
                history: [],
                generatedAssetIds: [],
                userRating: null,
                notes: '',
                nextActionAt: p?.nextActionAt ?? null,
              },
            };
          }
          case 'GENERATE_ASSET':
            // In dev mode, no AI backend available (neither Gemini Nano nor premium GLM)
            console.log('[Chrome Stub] GENERATE_ASSET (no AI in dev mode):', message.payload);
            return { type: 'GENERATION_RESULT', payload: { asset: null } };
          case 'GET_GENERATED_ASSETS':
            return { type: 'GENERATED_ASSETS_RESULT', payload: [] };
          case 'SHOW_TOAST':
            console.log('[Chrome Stub] Toast:', message.payload);
            return { type: 'TOAST_SHOWN' };
          case 'PROFILE_UPDATED':
            console.log('[Chrome Stub] Profile updated notification');
            return null;
          case 'RESET_LOCAL_DATA':
            for (const key of Object.keys(storage)) {
              delete storage[key];
            }
            return { type: 'LOCAL_DATA_RESET', payload: { reset: true } };
          case 'AUTH_LOGIN':
            console.log(
              '[Chrome Stub] Auth login stub:',
              (message.payload as Record<string, unknown>)?.email
            );
            return {
              type: 'AUTH_RESULT',
              payload: {
                status: 'unauthenticated',
                user: null,
                error: 'Auth not available in dev mode',
              },
            };
          case 'AUTH_SIGNUP':
            console.log(
              '[Chrome Stub] Auth signup stub:',
              (message.payload as Record<string, unknown>)?.email
            );
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
          case 'SYNC_FAVORITE_MISSION':
            console.log('[Chrome Stub] Favorite sync skipped:', message.payload);
            return {
              type: 'FAVORITE_MISSION_SYNCED',
              payload: {
                missionId: (message.payload as Record<string, unknown>)?.missionId,
                synced: false,
                reason: 'unauthenticated',
              },
            };
          case 'GET_CONNECTED_SYNC_STATUS':
            return {
              type: 'CONNECTED_SYNC_STATUS_RESULT',
              payload: {
                authenticated: false,
                installId: null,
                lastGlobalSync: null,
                entities: [],
              },
            };
          case 'SYNC_CONNECTED_DASHBOARD':
            return {
              type: 'CONNECTED_DASHBOARD_SYNCED',
              payload: {
                synced: false,
                reason: 'dev-mode',
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
