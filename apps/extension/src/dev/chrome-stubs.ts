import { mockProfile, mockMissions, generateMockTJMHistory } from './mocks';
import { analyzeTJMHistory } from '$lib/core/tjm-history';
import type { TJMHistory, TJMRegion } from '$lib/core/types/tjm';
import type { Mission, MissionSource } from '$lib/core/types/mission';
import type { UserProfile } from '$lib/core/types/profile';
import {
  DEFAULT_CONNECTED_ALERT_PREFERENCES,
  normalizeConnectedAlertPreferences,
  type ConnectedAlertPreferences,
} from '$lib/core/types/alert-preferences';
import { createInitialHealthSnapshot, type ConnectorHealthSnapshot } from '$lib/core/types/health';
import { scoreMission } from '$lib/core/scoring/relevance';
import { buildScoreBreakdown } from '$lib/core/scoring/final-score';

const DEV_MISSIONS_STORAGE_KEY = '__missionpulse_dev_missions';
const DEV_FAVORITES_STORAGE_KEY = '__missionpulse_dev_favorites';
const DEV_SAVED_VIEWS_STORAGE_KEY = '__missionpulse_dev_saved_views';
const DEV_ALERT_PREFERENCES_STORAGE_KEY = '__missionpulse_dev_alert_preferences';
const DEV_PROFILE_STORAGE_KEY = '__missionpulse_dev_profile';

type RuntimeMessage = { type: string; payload?: unknown };
type RuntimeMessageListener = (
  message: RuntimeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => boolean | void;
type SerializedMission = Omit<Mission, 'scrapedAt'> & { scrapedAt: string };

function readDevStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeDevStorage(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Dev-only persistence should never break the app shell.
  }
}

function serializeMissionForBridge(mission: Mission): SerializedMission {
  return {
    ...mission,
    scrapedAt:
      mission.scrapedAt instanceof Date
        ? mission.scrapedAt.toISOString()
        : String(mission.scrapedAt),
  };
}

function connectorDisplayName(connectorId: MissionSource): string {
  const names: Record<MissionSource, string> = {
    'free-work': 'Free-Work',
    lehibou: 'LeHibou',
    hiway: 'Hiway',
    collective: 'Collective',
    'cherry-pick': 'Cherry Pick',
  };
  return names[connectorId];
}

function groupMissionsBySource(
  missions: SerializedMission[]
): Map<MissionSource, SerializedMission[]> {
  const grouped = new Map<MissionSource, SerializedMission[]>();

  for (const mission of missions) {
    grouped.set(mission.source, [...(grouped.get(mission.source) ?? []), mission]);
  }

  return grouped;
}

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
  favoriteMissions: readDevStorage<Record<string, number>>(DEV_FAVORITES_STORAGE_KEY, {}),
  hiddenMissions: {},
  seenMissions: [],
  feedSavedViews: readDevStorage(DEV_SAVED_VIEWS_STORAGE_KEY, []),
  connectedAlertPreferences: readDevStorage<ConnectedAlertPreferences>(
    DEV_ALERT_PREFERENCES_STORAGE_KEY,
    DEFAULT_CONNECTED_ALERT_PREFERENCES
  ),
  newMissionCount: 0,
  feedSortBy: 'score',
  profile: readDevStorage<UserProfile>(DEV_PROFILE_STORAGE_KEY, mockProfile),
  premium_enabled: true,
  first_scan_done: true,
  profile_banner_dismissed: false,
  onboarding_completed: true,
  feed_tour_seen: false,
  tjm_history: generateMockTJMHistory(),
};

function getDevConnectorHealthSnapshots(): ConnectorHealthSnapshot[] {
  const now = Date.now();
  return ['free-work', 'lehibou', 'hiway', 'collective', 'cherry-pick'].map((connectorId) => ({
    ...createInitialHealthSnapshot(connectorId, now - 10 * 60_000),
    totalSuccesses: connectorId === 'free-work' ? 3 : 1,
    lastSuccessAt: now - (connectorId === 'free-work' ? 2 : 18) * 60_000,
    recentLatenciesMs: connectorId === 'free-work' ? [420, 510, 460] : [780],
  }));
}

function createChromeStubs() {
  const runtimeMessageListeners = new Set<RuntimeMessageListener>();

  function emitRuntimeMessage(message: RuntimeMessage): void {
    const sender = { id: 'dev-mode' } as chrome.runtime.MessageSender;

    for (const listener of runtimeMessageListeners) {
      try {
        listener(message, sender, () => {});
      } catch (error) {
        console.warn('[Chrome Stub] runtime listener failed:', error);
      }
    }
  }

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
            return { type: 'PROFILE_RESULT', payload: storage.profile ?? null };
          case 'SAVE_PROFILE':
            console.log('[Chrome Stub] Profile saved:', message.payload);
            storage.profile = message.payload;
            writeDevStorage(DEV_PROFILE_STORAGE_KEY, message.payload);

            // Mirror the production service worker (background/index.ts SAVE_PROFILE):
            // rescore stored missions against the new profile and broadcast the
            // updated scores so the feed reflects the change in dev mode.
            try {
              const profile = message.payload as UserProfile;
              const missions = readDevStorage<Mission[]>(DEV_MISSIONS_STORAGE_KEY, mockMissions);
              const now = new Date();
              const rescored: Mission[] = missions.map((mission): Mission => {
                const result = scoreMission(mission, profile, now);
                return {
                  ...mission,
                  scoreBreakdown: buildScoreBreakdown(result.total, result.breakdown),
                  score: result.total,
                  semanticScore: null,
                  semanticReason: null,
                };
              });
              writeDevStorage(DEV_MISSIONS_STORAGE_KEY, rescored);
              emitRuntimeMessage({
                type: 'MISSIONS_UPDATED',
                payload: rescored.map(serializeMissionForBridge),
              });
            } catch (err) {
              if (import.meta.env.DEV) {
                console.warn('[Chrome Stub] Profile rescore failed:', err);
              }
            }

            emitRuntimeMessage({ type: 'PROFILE_UPDATED', payload: message.payload });
            return { type: 'PROFILE_RESULT', payload: message.payload };
          case 'GET_PREMIUM_STATUS':
            return {
              type: 'PREMIUM_STATUS_RESULT',
              payload: storage.premium_enabled === true,
            };
          case 'SET_PREMIUM':
            storage.premium_enabled = message.payload === true;
            return { type: 'PREMIUM_SET', payload: { saved: true } };
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
              payload: readDevStorage<Mission[]>(DEV_MISSIONS_STORAGE_KEY, mockMissions).map(
                (m) => ({
                  ...m,
                  scrapedAt: new Date(),
                })
              ),
            };
          case 'GET_FEED_FAVORITES':
            return { type: 'FEED_FAVORITES_RESULT', payload: storage.favoriteMissions };
          case 'SAVE_FEED_FAVORITES':
            storage.favoriteMissions = message.payload;
            writeDevStorage(DEV_FAVORITES_STORAGE_KEY, message.payload);
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
          case 'GET_FEED_SAVED_VIEWS':
            return { type: 'FEED_SAVED_VIEWS_RESULT', payload: storage.feedSavedViews };
          case 'SAVE_FEED_SAVED_VIEWS':
            storage.feedSavedViews = message.payload;
            writeDevStorage(DEV_SAVED_VIEWS_STORAGE_KEY, message.payload);
            return { type: 'FEED_SAVED_VIEWS_SAVED', payload: { saved: true } };
          case 'GET_CONNECTED_ALERT_PREFERENCES':
            return {
              type: 'CONNECTED_ALERT_PREFERENCES_RESULT',
              payload: normalizeConnectedAlertPreferences(
                storage.connectedAlertPreferences as ConnectedAlertPreferences
              ),
            };
          case 'SAVE_CONNECTED_ALERT_PREFERENCES':
            storage.connectedAlertPreferences = normalizeConnectedAlertPreferences(
              message.payload as ConnectedAlertPreferences
            );
            writeDevStorage(DEV_ALERT_PREFERENCES_STORAGE_KEY, storage.connectedAlertPreferences);
            return {
              type: 'CONNECTED_ALERT_PREFERENCES_SAVED',
              payload: { saved: true, preferences: storage.connectedAlertPreferences },
            };
          case 'GET_CONNECTOR_HEALTH':
            return {
              type: 'CONNECTOR_HEALTH_RESULT',
              payload: getDevConnectorHealthSnapshots(),
            };
          case 'RECHECK_CONNECTOR_HEALTH':
            return {
              type: 'CONNECTOR_HEALTH_RESULT',
              payload: getDevConnectorHealthSnapshots(),
            };
          case 'GET_TJM_ANALYSIS': {
            const history = storage.tjm_history as TJMHistory | undefined;
            const payload = message.payload as
              | { profileStacks?: string[]; region?: TJMRegion }
              | undefined;
            const normalizedStacks =
              payload?.profileStacks && payload.profileStacks.length > 0
                ? new Set(payload.profileStacks.map((stack) => stack.toLowerCase().trim()))
                : null;
            const records = history?.records ?? [];
            const filteredRecords = records.filter((record) => {
              if (normalizedStacks && !normalizedStacks.has(record.stack.toLowerCase().trim())) {
                return false;
              }
              if (payload?.region && record.region !== payload.region) {
                return false;
              }
              return true;
            });

            return {
              type: 'TJM_ANALYSIS_RESULT',
              payload: {
                analysis: analyzeTJMHistory({ records: filteredRecords }),
              },
            };
          }
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
            return new Promise((resolve) => {
              const runtimeMissions = readDevStorage<Mission[]>(
                DEV_MISSIONS_STORAGE_KEY,
                mockMissions
              ).map((m) => ({ ...m, scrapedAt: new Date() }));
              const bridgeMissions = runtimeMissions.map(serializeMissionForBridge);
              const groupedBySource = [...groupMissionsBySource(bridgeMissions).entries()];

              groupedBySource.forEach(([connectorId, connectorMissions], index) => {
                setTimeout(
                  () => {
                    emitRuntimeMessage({
                      type: 'SCAN_PARTIAL_RESULT',
                      payload: {
                        connectorId,
                        connectorName: connectorDisplayName(connectorId),
                        missions: connectorMissions,
                      },
                    });
                  },
                  250 + index * 250
                );
              });

              setTimeout(
                () => {
                  resolve({
                    type: 'SCAN_COMPLETE',
                    payload: bridgeMissions,
                  });
                  window.dispatchEvent(
                    new CustomEvent('dev:missions', {
                      detail: runtimeMissions,
                    })
                  );
                },
                Math.max(800, 500 + groupedBySource.length * 250)
              );
            });
          case 'GET_TRACKINGS':
            return {
              type: 'TRACKINGS_RESULT',
              payload: [
                {
                  missionId: 'mock-0',
                  currentStatus: 'selected',
                  history: [
                    { from: null, to: 'detected', timestamp: Date.now() - 86_400_000, note: null },
                    {
                      from: 'detected',
                      to: 'selected',
                      timestamp: Date.now() - 43_200_000,
                      note: null,
                    },
                  ],
                  generatedAssetIds: [],
                  userRating: null,
                  notes: '',
                  nextActionAt: new Date(Date.now() - 3_600_000).toISOString(),
                },
                {
                  missionId: 'mock-1',
                  currentStatus: 'application_prepared',
                  history: [
                    { from: null, to: 'detected', timestamp: Date.now() - 172_800_000, note: null },
                    {
                      from: 'detected',
                      to: 'selected',
                      timestamp: Date.now() - 120_000_000,
                      note: null,
                    },
                    {
                      from: 'selected',
                      to: 'application_prepared',
                      timestamp: Date.now() - 86_400_000,
                      note: null,
                    },
                  ],
                  generatedAssetIds: ['asset-dev-1'],
                  userRating: 4,
                  notes: 'Relancer demain matin',
                  nextActionAt: new Date(Date.now() + 86_400_000).toISOString(),
                },
                {
                  missionId: 'mock-2',
                  currentStatus: 'applied',
                  history: [
                    { from: null, to: 'detected', timestamp: Date.now() - 259_200_000, note: null },
                    {
                      from: 'detected',
                      to: 'selected',
                      timestamp: Date.now() - 220_000_000,
                      note: null,
                    },
                    {
                      from: 'selected',
                      to: 'application_prepared',
                      timestamp: Date.now() - 180_000_000,
                      note: null,
                    },
                    {
                      from: 'application_prepared',
                      to: 'applied',
                      timestamp: Date.now() - 86_400_000,
                      note: null,
                    },
                  ],
                  generatedAssetIds: [],
                  userRating: null,
                  notes: '',
                  nextActionAt: null,
                },
              ],
            };
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
            console.log('[Chrome Stub] Profile updated notification', message.payload);
            emitRuntimeMessage(message);
            return null;
          case 'RESET_LOCAL_DATA':
            for (const key of Object.keys(storage)) {
              delete storage[key];
            }
            return { type: 'LOCAL_DATA_RESET', payload: { reset: true } };
          default:
            console.log('[Chrome Stub] Unhandled message type:', message.type);
            return null;
        }
      },
      onMessage: {
        addListener: (listener: RuntimeMessageListener) => {
          runtimeMessageListeners.add(listener);
        },
        removeListener: (listener: RuntimeMessageListener) => {
          runtimeMessageListeners.delete(listener);
        },
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
