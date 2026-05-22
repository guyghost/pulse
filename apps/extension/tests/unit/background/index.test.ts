import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mission } from '../../../src/lib/core/types/mission';

const getSettings = vi.fn();
const setSettings = vi.fn();
const getFeedSortBy = vi.fn();
const setFeedSortBy = vi.fn();
const runScan = vi.fn();
const getSeenIds = vi.fn();
const saveSeenIds = vi.fn();
const setNewMissionCount = vi.fn();
const resetNewMissionCount = vi.fn();
const notifyHighScoreMissions = vi.fn();
const setupNotificationClickHandler = vi.fn();
const getMissions = vi.fn();
const saveConnectorStatuses = vi.fn();
const getConnectorStatuses = vi.fn();
const getFavorites = vi.fn();
const saveFavorites = vi.fn();
const getHidden = vi.fn();
const saveHidden = vi.fn();
const getTracking = vi.fn();
const saveTracking = vi.fn();
const getAllTrackings = vi.fn();
const getGeneratedAssetsForMission = vi.fn();
const getAllHealthSnapshots = vi.fn();
const resetHealthSnapshot = vi.fn();
const syncConnectedDashboardScan = vi.fn();
const syncConnectedDashboardSnapshot = vi.fn();
const syncConnectedDashboardProfileExtractorHealth = vi.fn();
const syncConnectedDashboardTracking = vi.fn();
const verifyProfilePage = vi.fn();
const resetLocalData = vi.fn();
const getFirstScanDone = vi.fn();
const getProfileBannerDismissed = vi.fn();
const setProfileBannerDismissed = vi.fn();
const getOnboardingCompleted = vi.fn();
const setOnboardingCompleted = vi.fn();
const clearOnboardingCompleted = vi.fn();
const getFeedTourSeen = vi.fn();
const setFeedTourSeen = vi.fn();
const setBadgeText = vi.fn(async () => undefined);
const setBadgeBackgroundColor = vi.fn(async () => undefined);
const setBadgeTextColor = vi.fn(async () => undefined);
const clearChromeStorage = vi.fn(async () => undefined);

let alarmListener: ((alarm: { name: string }) => Promise<void>) | undefined;
let messageListener:
  | ((
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: unknown) => void
    ) => boolean | void)
  | undefined;

const makeMission = (overrides: Partial<Mission> = {}): Mission => ({
  id: 'mission-1',
  title: 'Mission test',
  client: null,
  description: 'Description',
  stack: ['React'],
  tjm: 700,
  location: 'Paris',
  remote: 'hybrid',
  duration: '6 mois',
  url: 'https://example.com',
  source: 'free-work',
  scrapedAt: new Date('2026-01-01'),
  score: 90,
  semanticScore: null,
  semanticReason: null,
  ...overrides,
});

vi.stubGlobal('chrome', {
  sidePanel: {
    setPanelBehavior: vi.fn(),
  },
  runtime: {
    onMessage: {
      addListener: vi.fn(
        (
          listener: (
            message: unknown,
            sender: chrome.runtime.MessageSender,
            sendResponse: (response: unknown) => void
          ) => boolean | void
        ) => {
          messageListener = listener;
        }
      ),
    },
    onInstalled: {
      addListener: vi.fn(),
    },
    sendMessage: vi.fn(async () => undefined),
  },
  alarms: {
    clearAll: vi.fn(async () => true),
    create: vi.fn(),
    onAlarm: {
      addListener: vi.fn((listener: (alarm: { name: string }) => Promise<void>) => {
        alarmListener = listener;
      }),
    },
  },
  storage: {
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
      clear: clearChromeStorage,
    },
    onChanged: {
      addListener: vi.fn(),
    },
  },
  declarativeNetRequest: {
    updateDynamicRules: vi.fn(async () => undefined),
  },
  action: {
    setBadgeText,
    setBadgeBackgroundColor,
    setBadgeTextColor,
    onUserSettingsChanged: {
      addListener: vi.fn(),
    },
  },
  notifications: {
    onClicked: {
      addListener: vi.fn(),
    },
    create: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  },
  tabs: {
    query: vi.fn(),
    create: vi.fn(async () => ({})),
  },
});

vi.mock('../../../src/lib/shell/storage/chrome-storage', () => ({
  DEFAULT_SETTINGS: {
    scanIntervalMinutes: 30,
    enabledConnectors: ['free-work', 'lehibou', 'hiway', 'collective', 'cherry-pick'],
    notifications: true,
    autoScan: true,
    maxSemanticPerScan: 10,
    notificationScoreThreshold: 70,
    respectRateLimits: true,
    customDelayMs: 0,
    theme: 'system',
  },
  getSettings,
  setSettings,
  getFeedSortBy,
  setFeedSortBy,
}));

vi.mock('../../../src/lib/shell/storage/db', () => ({
  getProfile: vi.fn(async () => null),
  saveProfile: vi.fn(async () => undefined),
  saveConnectorStatuses,
  getConnectorStatuses,
  getMissionById: vi.fn(async () => null),
  getMissions,
}));

vi.mock('../../../src/lib/shell/scan/scanner', () => ({
  runScan,
}));

vi.mock('../../../src/lib/shell/storage/seen-missions', () => ({
  getSeenIds,
  saveSeenIds,
}));

vi.mock('../../../src/lib/shell/storage/favorites', () => ({
  getFavorites,
  saveFavorites,
  getHidden,
  saveHidden,
}));

vi.mock('../../../src/lib/shell/storage/session-storage', () => ({
  setNewMissionCount,
  resetNewMissionCount,
}));

vi.mock('../../../src/lib/shell/storage/tracking', () => ({
  getTracking,
  saveTracking,
  getAllTrackings,
  getTrackingsByStatus: vi.fn(async () => []),
}));

vi.mock('../../../src/lib/shell/storage/generated-assets', () => ({
  saveGeneratedAsset: vi.fn(async () => undefined),
  getGeneratedAssetsForMission,
}));

vi.mock('../../../src/lib/shell/storage/connector-health', () => ({
  getAllHealthSnapshots,
  resetHealthSnapshot,
}));

vi.mock('../../../src/lib/shell/notifications/notify-missions', () => ({
  notifyHighScoreMissions,
  setupNotificationClickHandler,
}));

vi.mock('../../../src/lib/shell/sync/connected-dashboard', () => ({
  getConnectedDashboardSyncStatus: vi.fn(async () => ({
    authenticated: true,
    installId: 'install-1',
    lastGlobalSync: 1779340800000,
    entities: [],
  })),
  syncConnectedDashboardScan,
  syncConnectedDashboardSnapshot,
  syncConnectedDashboardProfileExtractorHealth,
  syncConnectedDashboardProfileImport: vi.fn(),
  syncConnectedDashboardTracking,
}));

vi.mock('../../../src/lib/shell/profile/profile-page-verification', () => ({
  verifyProfilePage,
}));

vi.mock('../../../src/lib/shell/storage/local-data-reset', () => ({
  resetLocalData,
}));

vi.mock('../../../src/lib/shell/storage/first-scan', () => ({
  getFirstScanDone,
  setFirstScanDone: vi.fn(async () => undefined),
  getProfileBannerDismissed,
  setProfileBannerDismissed,
  getOnboardingCompleted,
  setOnboardingCompleted,
  clearOnboardingCompleted,
  getFeedTourSeen,
  setFeedTourSeen,
}));

describe('background auto-scan notifications', () => {
  beforeAll(async () => {
    getSettings.mockResolvedValue({
      scanIntervalMinutes: 30,
      enabledConnectors: ['free-work'],
      notifications: true,
      autoScan: true,
      maxSemanticPerScan: 10,
      notificationScoreThreshold: 70,
    });
    setSettings.mockResolvedValue(undefined);
    getFeedSortBy.mockResolvedValue('score');
    setFeedSortBy.mockResolvedValue(undefined);
    getFirstScanDone.mockResolvedValue(true);
    getProfileBannerDismissed.mockResolvedValue(false);
    setProfileBannerDismissed.mockResolvedValue(undefined);
    getOnboardingCompleted.mockResolvedValue(true);
    setOnboardingCompleted.mockResolvedValue(undefined);
    clearOnboardingCompleted.mockResolvedValue(undefined);
    getFeedTourSeen.mockResolvedValue(false);
    setFeedTourSeen.mockResolvedValue(undefined);
    await import('../../../src/background/index.ts');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    clearChromeStorage.mockResolvedValue(undefined);
    getSettings.mockResolvedValue({
      scanIntervalMinutes: 30,
      enabledConnectors: ['free-work'],
      notifications: true,
      autoScan: true,
      maxSemanticPerScan: 10,
      notificationScoreThreshold: 70,
    });
    getSeenIds.mockResolvedValue(['already-seen']);
    saveSeenIds.mockResolvedValue(undefined);
    runScan.mockResolvedValue({
      missions: [
        makeMission({ id: 'mission-1', score: 92 }),
        makeMission({ id: 'mission-2', score: 45 }),
      ],
      errors: [],
    });
    notifyHighScoreMissions.mockResolvedValue({
      shown: true,
      notifiedMissionIds: ['mission-1'],
    });
    getMissions.mockResolvedValue([makeMission()]);
    resetNewMissionCount.mockResolvedValue(undefined);
    getConnectorStatuses.mockResolvedValue([]);
    getFavorites.mockResolvedValue({});
    saveFavorites.mockResolvedValue(undefined);
    getHidden.mockResolvedValue({});
    saveHidden.mockResolvedValue(undefined);
    getFeedSortBy.mockResolvedValue('score');
    setFeedSortBy.mockResolvedValue(undefined);
    getFirstScanDone.mockResolvedValue(true);
    getProfileBannerDismissed.mockResolvedValue(false);
    setProfileBannerDismissed.mockResolvedValue(undefined);
    getOnboardingCompleted.mockResolvedValue(true);
    setOnboardingCompleted.mockResolvedValue(undefined);
    clearOnboardingCompleted.mockResolvedValue(undefined);
    getFeedTourSeen.mockResolvedValue(false);
    setFeedTourSeen.mockResolvedValue(undefined);
    getTracking.mockResolvedValue(null);
    saveTracking.mockResolvedValue(undefined);
    getAllTrackings.mockResolvedValue([]);
    getGeneratedAssetsForMission.mockResolvedValue([]);
    getAllHealthSnapshots.mockResolvedValue(new Map());
    syncConnectedDashboardScan.mockResolvedValue({
      ok: true,
      value: { missions: 1, connectorHealth: 0 },
    });
    syncConnectedDashboardSnapshot.mockResolvedValue({
      ok: true,
      value: { missions: 1, applications: 0, skippedApplications: 0, connectorHealth: 0 },
    });
    syncConnectedDashboardProfileExtractorHealth.mockResolvedValue({
      ok: true,
      value: { pushedCount: 1 },
    });
    syncConnectedDashboardTracking.mockResolvedValue({
      ok: true,
      value: { pushedCount: 1, skippedCount: 0 },
    });
    verifyProfilePage.mockResolvedValue({
      read: { status: 'available', finalUrl: 'https://www.linkedin.com/in/example/' },
      comparisons: [{ fieldId: 'title', label: 'Titre', expected: 'Lead Svelte', status: 'match' }],
      summary: { matches: 1, mismatches: 0, missing: 0 },
    });
    resetLocalData.mockResolvedValue(undefined);
  });

  it('persists notified mission ids so they are not alerted again on the next scan', async () => {
    expect(alarmListener).toBeTypeOf('function');

    await alarmListener?.({ name: 'auto-scan' });

    expect(notifyHighScoreMissions).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'mission-1' }),
      expect.objectContaining({ id: 'mission-2' }),
    ]);
    expect(saveSeenIds).toHaveBeenCalledWith(['already-seen', 'mission-1']);
    expect(setNewMissionCount).toHaveBeenCalledWith(2);
    expect(setBadgeText).toHaveBeenCalledWith({ text: '2' });
  });

  it('clears badge and new mission count when all fetched missions are already seen', async () => {
    runScan.mockResolvedValueOnce({
      missions: [makeMission({ id: 'already-seen', score: 92 })],
      errors: [],
    });
    notifyHighScoreMissions.mockResolvedValueOnce({ shown: false, notifiedMissionIds: [] });

    await alarmListener?.({ name: 'auto-scan' });

    expect(setNewMissionCount).toHaveBeenCalledWith(0);
    expect(setBadgeText).toHaveBeenCalledWith({ text: '' });
    expect(notifyHighScoreMissions).not.toHaveBeenCalled();
    expect(saveSeenIds).not.toHaveBeenCalled();
  });

  it('clears badge and new mission count when scan returns no missions', async () => {
    runScan.mockResolvedValueOnce({
      missions: [],
      errors: [],
    });

    await alarmListener?.({ name: 'auto-scan' });

    expect(setNewMissionCount).toHaveBeenCalledWith(0);
    expect(setBadgeText).toHaveBeenCalledWith({ text: '' });
    expect(notifyHighScoreMissions).not.toHaveBeenCalled();
  });

  it('handles explicit connected dashboard retry messages', async () => {
    expect(messageListener).toBeTypeOf('function');
    const sendResponse = vi.fn();
    vi.mocked(chrome.storage.local.get).mockResolvedValueOnce({
      connectedDashboardRetrySnapshot: {
        sourceMissions: [
          {
            ...makeMission({ id: 'mission-duplicate', source: 'lehibou' }),
            scrapedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        duplicateRelations: [
          {
            canonicalMissionId: 'mission-1',
            duplicateMissionId: 'mission-duplicate',
            confidence: 0.92,
            reason: 'same-client-title',
          },
        ],
      },
    });

    const handled = messageListener?.({ type: 'RETRY_CONNECTED_SYNC' }, {}, sendResponse);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handled).toBe(true);
    expect(getMissions).toHaveBeenCalled();
    expect(getAllTrackings).toHaveBeenCalled();
    expect(syncConnectedDashboardSnapshot).toHaveBeenCalledWith({
      missions: [expect.objectContaining({ id: 'mission-1' })],
      sourceMissions: [
        expect.objectContaining({
          id: 'mission-duplicate',
          scrapedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      ],
      duplicateRelations: [
        {
          canonicalMissionId: 'mission-1',
          duplicateMissionId: 'mission-duplicate',
          confidence: 0.92,
          reason: 'same-client-title',
        },
      ],
      trackings: [],
      generatedAssetsByMissionId: new Map(),
      healthSnapshots: [],
    });
    expect(sendResponse).toHaveBeenCalledWith({
      type: 'CONNECTED_DASHBOARD_SYNCED',
      payload: {
        synced: true,
        missions: 1,
        applications: 0,
        skippedApplications: 0,
        connectorHealth: 0,
      },
    });
  });

  it('updates tracking details and triggers connected dashboard sync', async () => {
    expect(messageListener).toBeTypeOf('function');
    const sendResponse = vi.fn();
    getTracking.mockResolvedValueOnce({
      missionId: 'mission-1',
      currentStatus: 'selected',
      history: [
        { from: null, to: 'detected', timestamp: 1779340800000, note: null },
        { from: 'detected', to: 'selected', timestamp: 1779344400000, note: null },
      ],
      generatedAssetIds: [],
      userRating: null,
      notes: 'A relancer',
      nextActionAt: null,
    });

    const handled = messageListener?.(
      {
        type: 'UPDATE_TRACKING_DETAILS',
        payload: { missionId: 'mission-1', nextActionAt: '2026-05-24T09:00:00.000Z' },
      },
      {},
      sendResponse
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handled).toBe(true);
    expect(saveTracking).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: 'mission-1',
        nextActionAt: '2026-05-24T09:00:00.000Z',
      })
    );
    expect(syncConnectedDashboardTracking).toHaveBeenCalledWith('mission-1');
    expect(sendResponse).toHaveBeenCalledWith({
      type: 'TRACKING_UPDATED',
      payload: expect.objectContaining({
        missionId: 'mission-1',
        nextActionAt: '2026-05-24T09:00:00.000Z',
      }),
    });
  });

  it('routes profile page verification through the service worker shell', async () => {
    expect(messageListener).toBeTypeOf('function');
    const sendResponse = vi.fn();

    const handled = messageListener?.(
      {
        type: 'VERIFY_PROFILE_PAGE',
        payload: {
          url: 'https://www.linkedin.com/in/example/',
          fields: [{ id: 'title', label: 'Titre', value: 'Lead Svelte' }],
        },
      },
      {},
      sendResponse
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handled).toBe(true);
    expect(verifyProfilePage).toHaveBeenCalledWith('https://www.linkedin.com/in/example/', [
      { id: 'title', label: 'Titre', value: 'Lead Svelte' },
    ]);
    expect(sendResponse).toHaveBeenCalledWith({
      type: 'PROFILE_PAGE_VERIFIED',
      payload: {
        read: { status: 'available', finalUrl: 'https://www.linkedin.com/in/example/' },
        comparisons: [
          { fieldId: 'title', label: 'Titre', expected: 'Lead Svelte', status: 'match' },
        ],
        summary: { matches: 1, mismatches: 0, missing: 0 },
      },
    });
  });

  it('routes settings through the service worker shell', async () => {
    expect(messageListener).toBeTypeOf('function');
    const settings = {
      scanIntervalMinutes: 45,
      enabledConnectors: ['free-work'],
      notifications: false,
      autoScan: true,
      maxSemanticPerScan: 5,
      notificationScoreThreshold: 80,
      respectRateLimits: true,
      customDelayMs: 1000,
      theme: 'dark' as const,
    };
    const getResponse = vi.fn();
    const saveResponse = vi.fn();
    getSettings.mockResolvedValueOnce(settings);

    expect(messageListener?.({ type: 'GET_SETTINGS' }, {}, getResponse)).toBe(true);
    expect(messageListener?.({ type: 'SAVE_SETTINGS', payload: settings }, {}, saveResponse)).toBe(
      true
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getResponse).toHaveBeenCalledWith({ type: 'SETTINGS_RESULT', payload: settings });
    expect(setSettings).toHaveBeenCalledWith(settings);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'SETTINGS_UPDATED',
      payload: settings,
    });
    expect(saveResponse).toHaveBeenCalledWith({
      type: 'SETTINGS_SAVED',
      payload: { saved: true, settings },
    });
  });

  it('routes feed local data through the service worker shell', async () => {
    expect(messageListener).toBeTypeOf('function');
    const missionsResponse = vi.fn();
    const favoritesResponse = vi.fn();
    const hiddenResponse = vi.fn();
    const sortResponse = vi.fn();
    const seenResponse = vi.fn();
    const statusesResponse = vi.fn();

    const favorites = { 'mission-1': 1779436800000 };
    const hidden = { 'mission-2': 1779436900000 };
    const statuses = [
      {
        connectorId: 'free-work',
        connectorName: 'Free-Work',
        lastState: 'done' as const,
        missionsCount: 2,
        error: null,
        lastSyncAt: 1779436800000,
        lastSuccessAt: 1779436800000,
      },
    ];
    getMissions.mockResolvedValueOnce([makeMission()]);
    getFavorites.mockResolvedValueOnce(favorites);
    getHidden.mockResolvedValueOnce(hidden);
    getFeedSortBy.mockResolvedValueOnce('date');
    getSeenIds.mockResolvedValueOnce(['mission-1']);
    getConnectorStatuses.mockResolvedValueOnce(statuses);

    expect(messageListener?.({ type: 'GET_FEED_MISSIONS' }, {}, missionsResponse)).toBe(true);
    expect(messageListener?.({ type: 'GET_FEED_FAVORITES' }, {}, favoritesResponse)).toBe(true);
    expect(messageListener?.({ type: 'GET_FEED_HIDDEN' }, {}, hiddenResponse)).toBe(true);
    expect(messageListener?.({ type: 'GET_FEED_SORT' }, {}, sortResponse)).toBe(true);
    expect(messageListener?.({ type: 'GET_SEEN_MISSIONS' }, {}, seenResponse)).toBe(true);
    expect(
      messageListener?.({ type: 'GET_PERSISTED_CONNECTOR_STATUSES' }, {}, statusesResponse)
    ).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(missionsResponse).toHaveBeenCalledWith({
      type: 'FEED_MISSIONS_RESULT',
      payload: [expect.objectContaining({ id: 'mission-1' })],
    });
    expect(favoritesResponse).toHaveBeenCalledWith({
      type: 'FEED_FAVORITES_RESULT',
      payload: favorites,
    });
    expect(hiddenResponse).toHaveBeenCalledWith({
      type: 'FEED_HIDDEN_RESULT',
      payload: hidden,
    });
    expect(sortResponse).toHaveBeenCalledWith({
      type: 'FEED_SORT_RESULT',
      payload: 'date',
    });
    expect(seenResponse).toHaveBeenCalledWith({
      type: 'SEEN_MISSIONS_RESULT',
      payload: ['mission-1'],
    });
    expect(statusesResponse).toHaveBeenCalledWith({
      type: 'PERSISTED_CONNECTOR_STATUSES_RESULT',
      payload: statuses,
    });
  });

  it('routes feed local writes through the service worker shell', async () => {
    expect(messageListener).toBeTypeOf('function');
    const favoritesResponse = vi.fn();
    const hiddenResponse = vi.fn();
    const sortResponse = vi.fn();
    const seenResponse = vi.fn();
    const resetResponse = vi.fn();
    const badgeResponse = vi.fn();
    const openResponse = vi.fn();
    const favorites = { 'mission-1': 1779436800000 };
    const hidden = { 'mission-2': 1779436900000 };
    const seenIds = ['mission-1', 'mission-2'];

    expect(
      messageListener?.({ type: 'SAVE_FEED_FAVORITES', payload: favorites }, {}, favoritesResponse)
    ).toBe(true);
    expect(
      messageListener?.({ type: 'SAVE_FEED_HIDDEN', payload: hidden }, {}, hiddenResponse)
    ).toBe(true);
    expect(messageListener?.({ type: 'SAVE_FEED_SORT', payload: 'tjm' }, {}, sortResponse)).toBe(
      true
    );
    expect(
      messageListener?.({ type: 'SAVE_SEEN_MISSIONS', payload: seenIds }, {}, seenResponse)
    ).toBe(true);
    expect(messageListener?.({ type: 'RESET_NEW_MISSION_COUNT' }, {}, resetResponse)).toBe(true);
    expect(messageListener?.({ type: 'CLEAR_EXTENSION_BADGE' }, {}, badgeResponse)).toBe(true);
    expect(
      messageListener?.(
        { type: 'OPEN_EXTERNAL_URL', payload: { url: 'https://www.free-work.com/' } },
        {},
        openResponse
      )
    ).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(saveFavorites).toHaveBeenCalledWith(favorites);
    expect(saveHidden).toHaveBeenCalledWith(hidden);
    expect(setFeedSortBy).toHaveBeenCalledWith('tjm');
    expect(saveSeenIds).toHaveBeenCalledWith(seenIds);
    expect(resetNewMissionCount).toHaveBeenCalled();
    expect(setBadgeText).toHaveBeenCalledWith({ text: '' });
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://www.free-work.com/' });
    expect(favoritesResponse).toHaveBeenCalledWith({
      type: 'FEED_FAVORITES_SAVED',
      payload: { saved: true },
    });
    expect(hiddenResponse).toHaveBeenCalledWith({
      type: 'FEED_HIDDEN_SAVED',
      payload: { saved: true },
    });
    expect(sortResponse).toHaveBeenCalledWith({
      type: 'FEED_SORT_SAVED',
      payload: { saved: true },
    });
    expect(seenResponse).toHaveBeenCalledWith({
      type: 'SEEN_MISSIONS_SAVED',
      payload: { saved: true },
    });
    expect(resetResponse).toHaveBeenCalledWith({
      type: 'NEW_MISSION_COUNT_RESET',
      payload: { reset: true },
    });
    expect(badgeResponse).toHaveBeenCalledWith({
      type: 'EXTENSION_BADGE_CLEARED',
      payload: { cleared: true },
    });
    expect(openResponse).toHaveBeenCalledWith({
      type: 'EXTERNAL_URL_OPENED',
      payload: { opened: true },
    });
  });

  it('routes side panel app flags through the service worker shell', async () => {
    expect(messageListener).toBeTypeOf('function');
    const firstScanResponse = vi.fn();
    const bannerReadResponse = vi.fn();
    const bannerWriteResponse = vi.fn();
    const onboardingReadResponse = vi.fn();
    const onboardingWriteResponse = vi.fn();
    const onboardingClearResponse = vi.fn();
    const tourReadResponse = vi.fn();
    const tourWriteResponse = vi.fn();

    getFirstScanDone.mockResolvedValueOnce(true);
    getProfileBannerDismissed.mockResolvedValueOnce(false);
    getOnboardingCompleted.mockResolvedValueOnce(true);
    getFeedTourSeen.mockResolvedValueOnce(false);

    expect(messageListener?.({ type: 'GET_FIRST_SCAN_DONE' }, {}, firstScanResponse)).toBe(true);
    expect(
      messageListener?.({ type: 'GET_PROFILE_BANNER_DISMISSED' }, {}, bannerReadResponse)
    ).toBe(true);
    expect(
      messageListener?.({ type: 'SET_PROFILE_BANNER_DISMISSED' }, {}, bannerWriteResponse)
    ).toBe(true);
    expect(
      messageListener?.({ type: 'GET_ONBOARDING_COMPLETED' }, {}, onboardingReadResponse)
    ).toBe(true);
    expect(
      messageListener?.({ type: 'SET_ONBOARDING_COMPLETED' }, {}, onboardingWriteResponse)
    ).toBe(true);
    expect(
      messageListener?.({ type: 'CLEAR_ONBOARDING_COMPLETED' }, {}, onboardingClearResponse)
    ).toBe(true);
    expect(messageListener?.({ type: 'GET_FEED_TOUR_SEEN' }, {}, tourReadResponse)).toBe(true);
    expect(messageListener?.({ type: 'SET_FEED_TOUR_SEEN' }, {}, tourWriteResponse)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(firstScanResponse).toHaveBeenCalledWith({
      type: 'FIRST_SCAN_DONE_RESULT',
      payload: true,
    });
    expect(bannerReadResponse).toHaveBeenCalledWith({
      type: 'PROFILE_BANNER_DISMISSED_RESULT',
      payload: false,
    });
    expect(bannerWriteResponse).toHaveBeenCalledWith({
      type: 'PROFILE_BANNER_DISMISSED_SET',
      payload: { saved: true },
    });
    expect(onboardingReadResponse).toHaveBeenCalledWith({
      type: 'ONBOARDING_COMPLETED_RESULT',
      payload: true,
    });
    expect(onboardingWriteResponse).toHaveBeenCalledWith({
      type: 'ONBOARDING_COMPLETED_SET',
      payload: { saved: true },
    });
    expect(onboardingClearResponse).toHaveBeenCalledWith({
      type: 'ONBOARDING_COMPLETED_CLEARED',
      payload: { cleared: true },
    });
    expect(tourReadResponse).toHaveBeenCalledWith({
      type: 'FEED_TOUR_SEEN_RESULT',
      payload: false,
    });
    expect(tourWriteResponse).toHaveBeenCalledWith({
      type: 'FEED_TOUR_SEEN_SET',
      payload: { saved: true },
    });
  });

  it('resets local extension data from the service worker shell', async () => {
    expect(messageListener).toBeTypeOf('function');
    const sendResponse = vi.fn();

    const handled = messageListener?.({ type: 'RESET_LOCAL_DATA' }, {}, sendResponse);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(handled).toBe(true);
    expect(resetLocalData).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      type: 'LOCAL_DATA_RESET',
      payload: { reset: true },
    });
  });
});
