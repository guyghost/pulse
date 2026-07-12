import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { MissionTracking } from '../../../src/lib/core/types/tracking';
import type { UserProfile } from '../../../src/lib/core/types/profile';

const getSettings = vi.fn();
const setSettings = vi.fn();
const getFeedSortBy = vi.fn();
const setFeedSortBy = vi.fn();
const getFeedSavedViews = vi.fn();
const setFeedSavedViews = vi.fn();
const runScan = vi.fn();
const getSeenIds = vi.fn();
const saveSeenIds = vi.fn();
const setNewMissionCount = vi.fn();
const resetNewMissionCount = vi.fn();
const setDeepLinkIntent = vi.fn();
const consumeDeepLinkIntent = vi.fn();
const notifyHighScoreMissions = vi.fn();
const setupNotificationClickHandler = vi.fn();
const getProfile = vi.fn();
const saveProfile = vi.fn();
const getMissions = vi.fn();
const saveConnectorStatuses = vi.fn();
const getConnectorStatuses = vi.fn();
const getFavorites = vi.fn();
const saveFavorites = vi.fn();
const getHidden = vi.fn();
const saveHidden = vi.fn();
const getTracking = vi.fn();
const saveTracking = vi.fn();
const deleteTracking = vi.fn();
const getAllTrackings = vi.fn();
const getGeneratedAssetsForMission = vi.fn();
const saveGeneratedAsset = vi.fn();
const generateAsset = vi.fn();
const getAllHealthSnapshots = vi.fn();
const resetHealthSnapshot = vi.fn();
const loadTJMHistory = vi.fn();
const verifyProfilePage = vi.fn();
const resetLocalData = vi.fn();
const rescoreStoredMissions = vi.fn();
const getFirstScanDone = vi.fn();
const getProfileBannerDismissed = vi.fn();
const setProfileBannerDismissed = vi.fn();
const getOnboardingCompleted = vi.fn();
const setOnboardingCompleted = vi.fn();
const clearOnboardingCompleted = vi.fn();
const getFeedTourSeen = vi.fn();
const setFeedTourSeen = vi.fn();
const clearFeedTourSeen = vi.fn();
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

const profile: UserProfile = {
  firstName: 'Guy',
  keywords: ['Svelte', 'TypeScript', 'mission svelte'],
  tjmMin: 650,
  tjmMax: 900,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  jobTitle: 'Lead Frontend',
};

const makeTracking = (overrides: Partial<MissionTracking> = {}): MissionTracking => ({
  missionId: 'mission-1',
  currentStatus: 'selected',
  history: [
    { from: null, to: 'detected', timestamp: 1779436800000, note: null },
    { from: 'detected', to: 'selected', timestamp: 1779436900000, note: null },
  ],
  generatedAssetIds: [],
  userRating: null,
  notes: '',
  nextActionAt: null,
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
    enabledConnectors: ['free-work', 'lehibou', 'hiway', 'collective', 'cherry-pick', 'malt'],
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
  getFeedSavedViews,
  setFeedSavedViews,
}));

vi.mock('../../../src/lib/shell/storage/db', () => ({
  getProfile,
  saveProfile,
  saveConnectorStatuses,
  getConnectorStatuses,
  getMissionById: vi.fn(async () => null),
  getMissions,
  runMigrations: vi.fn(async () => ({
    ok: true,
    from: { db: null, data: null },
    to: { db: 4, data: 1 },
  })),
  getMigrationStatus: vi.fn(() => ({
    state: 'idle',
    storedDbVersion: 4,
    storedDataVersion: 1,
    lastError: null,
    rejectedCount: 0,
  })),
}));

vi.mock('../../../src/lib/shell/scan/rescore', () => ({
  rescoreStoredMissions,
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
  setDeepLinkIntent,
  consumeDeepLinkIntent,
}));

vi.mock('../../../src/lib/shell/storage/tracking', () => ({
  getTracking,
  saveTracking,
  deleteTracking,
  getAllTrackings,
  getTrackingsByStatus: vi.fn(async () => []),
}));

vi.mock('../../../src/lib/shell/storage/generated-assets', () => ({
  saveGeneratedAsset,
  getGeneratedAssetsForMission,
}));

vi.mock('../../../src/lib/shell/ai/mission-generator', () => ({
  generateAsset,
}));

vi.mock('../../../src/lib/shell/storage/connector-health', () => ({
  getAllHealthSnapshots,
  resetHealthSnapshot,
}));

vi.mock('../../../src/lib/shell/storage/tjm-history', () => ({
  loadTJMHistory,
}));

vi.mock('../../../src/lib/shell/notifications/notify-missions', () => ({
  notifyHighScoreMissions,
  setupNotificationClickHandler,
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
  clearFeedTourSeen,
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
    getFeedSavedViews.mockResolvedValue([]);
    setFeedSavedViews.mockResolvedValue(undefined);
    getFirstScanDone.mockResolvedValue(true);
    getProfileBannerDismissed.mockResolvedValue(false);
    setProfileBannerDismissed.mockResolvedValue(undefined);
    getOnboardingCompleted.mockResolvedValue(true);
    setOnboardingCompleted.mockResolvedValue(undefined);
    clearOnboardingCompleted.mockResolvedValue(undefined);
    getFeedTourSeen.mockResolvedValue(false);
    setFeedTourSeen.mockResolvedValue(undefined);
    clearFeedTourSeen.mockResolvedValue(undefined);
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
    setDeepLinkIntent.mockResolvedValue(undefined);
    consumeDeepLinkIntent.mockResolvedValue(null);
    getConnectorStatuses.mockResolvedValue([]);
    getFavorites.mockResolvedValue({});
    saveFavorites.mockResolvedValue(undefined);
    getHidden.mockResolvedValue({});
    saveHidden.mockResolvedValue(undefined);
    getFeedSortBy.mockResolvedValue('score');
    setFeedSortBy.mockResolvedValue(undefined);
    getFeedSavedViews.mockResolvedValue([]);
    setFeedSavedViews.mockResolvedValue(undefined);
    getFirstScanDone.mockResolvedValue(true);
    getProfileBannerDismissed.mockResolvedValue(false);
    setProfileBannerDismissed.mockResolvedValue(undefined);
    getOnboardingCompleted.mockResolvedValue(true);
    setOnboardingCompleted.mockResolvedValue(undefined);
    clearOnboardingCompleted.mockResolvedValue(undefined);
    getFeedTourSeen.mockResolvedValue(false);
    setFeedTourSeen.mockResolvedValue(undefined);
    getProfile.mockResolvedValue(null);
    saveProfile.mockResolvedValue(undefined);
    getTracking.mockResolvedValue(null);
    saveTracking.mockResolvedValue(undefined);
    deleteTracking.mockResolvedValue(undefined);
    getAllTrackings.mockResolvedValue([]);
    getGeneratedAssetsForMission.mockResolvedValue([]);
    saveGeneratedAsset.mockResolvedValue(undefined);
    generateAsset.mockResolvedValue(null);
    getAllHealthSnapshots.mockResolvedValue(new Map());
    loadTJMHistory.mockResolvedValue({ records: [] });
    verifyProfilePage.mockResolvedValue({
      read: { status: 'available', finalUrl: 'https://www.linkedin.com/in/example/' },
      comparisons: [{ fieldId: 'title', label: 'Titre', expected: 'Lead Svelte', status: 'match' }],
      summary: { matches: 1, mismatches: 0, missing: 0 },
    });
    rescoreStoredMissions.mockResolvedValue([makeMission({ id: 'rescored-1', score: 96 })]);
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

  it('saves profiles through the service worker and rescored missions locally', async () => {
    expect(messageListener).toBeTypeOf('function');
    const sendResponse = vi.fn();

    const handled = messageListener?.({ type: 'SAVE_PROFILE', payload: profile }, {}, sendResponse);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handled).toBe(true);
    expect(saveProfile).toHaveBeenCalledWith(profile);
    expect(rescoreStoredMissions).toHaveBeenCalledWith(profile);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'MISSIONS_UPDATED',
      payload: [expect.objectContaining({ id: 'rescored-1', score: 96 })],
    });
    expect(sendResponse).toHaveBeenCalledWith({ type: 'PROFILE_RESULT', payload: profile });
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

  it('merges and persists the LinkedIn profile on SYNC_LINKEDIN_PROFILE_IMPORT', async () => {
    expect(messageListener).toBeTypeOf('function');
    const sendResponse = vi.fn();
    getProfile.mockResolvedValueOnce(profile);

    const draft = {
      title: 'Lead Frontend Svelte',
      summary: 'Test summary',
      experiences: [
        {
          title: 'Technical Lead',
          company: 'ScaleOps',
          employmentType: 'Freelance',
          location: 'Paris',
          startDate: '2024-01-01',
          endDate: null,
          isCurrent: true,
          description: 'Architecture de la plateforme.',
          skills: ['Svelte', 'TypeScript'],
          source: 'linkedin' as const,
          sourceExternalId: 'urn:li:position:1',
          positionIndex: 0,
        },
      ],
      skills: [{ skill: 'React', source: 'linkedin' as const, confidence: 0.9 }],
      education: [],
      links: [],
      source: 'linkedin' as const,
      confidence: 0.9,
      capturedAt: '2026-06-27T00:00:00.000Z',
      profileUrl: 'https://www.linkedin.com/in/test',
    };

    const handled = messageListener?.(
      { type: 'SYNC_LINKEDIN_PROFILE_IMPORT', payload: { profile: draft } },
      {},
      sendResponse
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handled).toBe(true);
    expect(getProfile).toHaveBeenCalled();
    expect(saveProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        jobTitle: 'Lead Frontend Svelte',
        keywords: expect.arrayContaining(['Svelte', 'TypeScript', 'React']),
        experiences: [
          expect.objectContaining({
            title: 'Technical Lead',
            employmentType: 'Freelance',
            source: 'linkedin',
          }),
        ],
      })
    );
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'PROFILE_UPDATED',
      payload: expect.objectContaining({ jobTitle: 'Lead Frontend Svelte' }),
    });
    expect(sendResponse).toHaveBeenCalledWith({
      type: 'LINKEDIN_PROFILE_IMPORTED',
      payload: { imported: true, profile: draft, addedCount: 1 },
    });
  });

  it('responds with sync_failed when persisting the merged profile throws', async () => {
    expect(messageListener).toBeTypeOf('function');
    const sendResponse = vi.fn();
    saveProfile.mockRejectedValueOnce(new Error('IndexedDB indisponible'));

    const draft = {
      title: 'Lead Frontend Svelte',
      summary: '',
      experiences: [],
      skills: [],
      education: [],
      links: [],
      source: 'linkedin' as const,
      confidence: 0.9,
      capturedAt: '2026-06-27T00:00:00.000Z',
      profileUrl: 'https://www.linkedin.com/in/test',
    };

    messageListener?.(
      { type: 'SYNC_LINKEDIN_PROFILE_IMPORT', payload: { profile: draft } },
      {},
      sendResponse
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendResponse).toHaveBeenCalledWith({
      type: 'LINKEDIN_PROFILE_IMPORTED',
      payload: {
        imported: false,
        errorCode: 'sync_failed',
        errorMessage: 'IndexedDB indisponible',
      },
    });
  });

  it('returns PREMIUM_REQUIRED for GENERATE_ASSET when premium feature is active and user is not premium', async () => {
    expect(messageListener).toBeTypeOf('function');
    vi.mocked(chrome.storage.local.get).mockResolvedValueOnce({
      premium_enabled: false,
      premium_feature_enabled: true,
    });
    const sendResponse = vi.fn();

    const handled = messageListener?.(
      {
        type: 'GENERATE_ASSET',
        payload: { missionId: 'mission-1', generationType: 'pitch' },
      },
      {},
      sendResponse
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handled).toBe(true);
    expect(generateAsset).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      type: 'GENERATION_RESULT',
      payload: { asset: null, error: 'PREMIUM_REQUIRED' },
    });
  });

  it('allows GENERATE_ASSET when premium feature is dormant even if user is not premium', async () => {
    expect(messageListener).toBeTypeOf('function');
    vi.mocked(chrome.storage.local.get).mockResolvedValueOnce({
      premium_enabled: false,
      premium_feature_enabled: false,
    });
    getMissions.mockResolvedValueOnce([makeMission({ id: 'mission-1' })]);
    getProfile.mockResolvedValueOnce(profile);
    const fakeAsset = {
      id: 'gen-pitch-mission-1-1000',
      missionId: 'mission-1',
      type: 'pitch' as const,
      content: 'Generated pitch content.',
      createdAt: 1000,
      modelUsed: 'gemini-nano',
    };
    generateAsset.mockResolvedValueOnce(fakeAsset);
    const sendResponse = vi.fn();

    const handled = messageListener?.(
      {
        type: 'GENERATE_ASSET',
        payload: { missionId: 'mission-1', generationType: 'pitch' },
      },
      {},
      sendResponse
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handled).toBe(true);
    expect(generateAsset).toHaveBeenCalled();
    expect(saveGeneratedAsset).toHaveBeenCalledWith(fakeAsset);
  });

  it('generates and persists an asset for GENERATE_ASSET when premium feature is active and user is premium', async () => {
    expect(messageListener).toBeTypeOf('function');
    vi.mocked(chrome.storage.local.get).mockResolvedValueOnce({
      premium_enabled: true,
      premium_feature_enabled: true,
    });
    getMissions.mockResolvedValueOnce([makeMission({ id: 'mission-1' })]);
    getProfile.mockResolvedValueOnce(profile);
    const fakeAsset = {
      id: 'gen-pitch-mission-1-1000',
      missionId: 'mission-1',
      type: 'pitch' as const,
      content: 'Generated pitch content.',
      createdAt: 1000,
      modelUsed: 'gemini-nano',
    };
    generateAsset.mockResolvedValueOnce(fakeAsset);
    const sendResponse = vi.fn();

    const handled = messageListener?.(
      {
        type: 'GENERATE_ASSET',
        payload: { missionId: 'mission-1', generationType: 'pitch' },
      },
      {},
      sendResponse
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handled).toBe(true);
    expect(generateAsset).toHaveBeenCalledWith(
      'mission-1',
      'pitch',
      expect.objectContaining({ id: 'mission-1' }),
      profile
    );
    expect(saveGeneratedAsset).toHaveBeenCalledWith(fakeAsset);
    expect(sendResponse).toHaveBeenCalledWith({
      type: 'GENERATION_RESULT',
      payload: { asset: fakeAsset },
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

  it('clears nextActionAt when transitioning to a terminal status (APP-01)', async () => {
    expect(messageListener).toBeTypeOf('function');
    const sendResponse = vi.fn();

    getTracking.mockResolvedValueOnce(
      makeTracking({
        missionId: 'mission-1',
        currentStatus: 'offer',
        nextActionAt: '2026-06-18T09:00:00.000Z',
      })
    );

    const handled = messageListener?.(
      { type: 'UPDATE_TRACKING', payload: { missionId: 'mission-1', status: 'accepted' } },
      {},
      sendResponse
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handled).toBe(true);
    // The persisted record reaches the terminal status with the stale follow-up cleared.
    expect(saveTracking).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: 'mission-1',
        currentStatus: 'accepted',
        nextActionAt: null,
      })
    );
    expect(sendResponse).toHaveBeenCalledWith({
      type: 'TRACKING_UPDATED',
      payload: expect.objectContaining({
        missionId: 'mission-1',
        currentStatus: 'accepted',
        nextActionAt: null,
      }),
    });
  });

  it('keeps nextActionAt when transitioning to a non-terminal status (APP-01)', async () => {
    expect(messageListener).toBeTypeOf('function');
    const sendResponse = vi.fn();

    getTracking.mockResolvedValueOnce(
      makeTracking({
        missionId: 'mission-1',
        currentStatus: 'application_prepared',
        nextActionAt: '2026-06-18T09:00:00.000Z',
      })
    );

    messageListener?.(
      { type: 'UPDATE_TRACKING', payload: { missionId: 'mission-1', status: 'applied' } },
      {},
      sendResponse
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(saveTracking).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: 'mission-1',
        currentStatus: 'applied',
        nextActionAt: '2026-06-18T09:00:00.000Z',
      })
    );
  });

  it('loads on Chrome 114-129 when action user settings events are unavailable', async () => {
    vi.resetModules();
    vi.stubGlobal('chrome', {
      ...globalThis.chrome,
      action: {
        setBadgeText,
        setBadgeBackgroundColor,
        setBadgeTextColor,
      },
    });

    await expect(import('../../../src/background/index.ts?chrome-114')).resolves.toBeDefined();
  });

  it('routes feed local data through the service worker shell', async () => {
    expect(messageListener).toBeTypeOf('function');
    const missionsResponse = vi.fn();
    const favoritesResponse = vi.fn();
    const hiddenResponse = vi.fn();
    const sortResponse = vi.fn();
    const savedViewsResponse = vi.fn();
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
    getFeedSavedViews.mockResolvedValueOnce([
      {
        id: 'view-1',
        name: 'Prioritaires',
        filters: {
          searchQuery: '',
          selectedStacks: [],
          selectedSource: null,
          selectedRemote: null,
          selectedSeniority: null,
          selectedScoreBucket: 'strong',
          decisionPreset: null,
          showNewOnly: false,
          showFavoritesOnly: false,
          showHidden: false,
          sortBy: 'score',
        },
        createdAt: 1779436800000,
        updatedAt: 1779436800000,
      },
    ]);
    getSeenIds.mockResolvedValueOnce(['mission-1']);
    getConnectorStatuses.mockResolvedValueOnce(statuses);

    expect(messageListener?.({ type: 'GET_FEED_MISSIONS' }, {}, missionsResponse)).toBe(true);
    expect(messageListener?.({ type: 'GET_FEED_FAVORITES' }, {}, favoritesResponse)).toBe(true);
    expect(messageListener?.({ type: 'GET_FEED_HIDDEN' }, {}, hiddenResponse)).toBe(true);
    expect(messageListener?.({ type: 'GET_FEED_SORT' }, {}, sortResponse)).toBe(true);
    expect(messageListener?.({ type: 'GET_FEED_SAVED_VIEWS' }, {}, savedViewsResponse)).toBe(true);
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
    expect(savedViewsResponse).toHaveBeenCalledWith({
      type: 'FEED_SAVED_VIEWS_RESULT',
      payload: [expect.objectContaining({ id: 'view-1', name: 'Prioritaires' })],
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

  it('routes TJM analysis through the service worker shell', async () => {
    expect(messageListener).toBeTypeOf('function');
    const response = vi.fn();
    loadTJMHistory.mockResolvedValueOnce({
      records: [
        {
          stack: 'svelte',
          date: '2026-05-21',
          min: 700,
          max: 800,
          average: 750,
          sampleCount: 2,
          seniority: 'senior',
          region: 'remote',
        },
        {
          stack: 'react',
          date: '2026-05-21',
          min: 500,
          max: 600,
          average: 550,
          sampleCount: 1,
          seniority: 'confirmed',
          region: 'ile-de-france',
        },
      ],
    });

    expect(
      messageListener?.(
        {
          type: 'GET_TJM_ANALYSIS',
          payload: { profileStacks: ['Svelte'], region: 'remote' },
        },
        {},
        response
      )
    ).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(loadTJMHistory).toHaveBeenCalled();
    expect(response).toHaveBeenCalledWith({
      type: 'TJM_ANALYSIS_RESULT',
      payload: {
        analysis: expect.objectContaining({
          dataPoints: 1,
          topStacks: [expect.objectContaining({ stack: 'svelte' })],
        }),
      },
    });
  });

  it('restores tracking snapshots through the service worker shell', async () => {
    expect(messageListener).toBeTypeOf('function');
    const restoreResponse = vi.fn();
    const clearResponse = vi.fn();
    const previousTracking = makeTracking();

    expect(
      messageListener?.(
        {
          type: 'RESTORE_TRACKING',
          payload: { missionId: 'mission-1', tracking: previousTracking },
        },
        {},
        restoreResponse
      )
    ).toBe(true);
    expect(
      messageListener?.(
        {
          type: 'RESTORE_TRACKING',
          payload: { missionId: 'mission-2', tracking: null },
        },
        {},
        clearResponse
      )
    ).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(saveTracking).toHaveBeenCalledWith(previousTracking);
    expect(deleteTracking).toHaveBeenCalledWith('mission-2');
    expect(restoreResponse).toHaveBeenCalledWith({
      type: 'TRACKING_RESTORED',
      payload: previousTracking,
    });
    expect(clearResponse).toHaveBeenCalledWith({
      type: 'TRACKING_RESTORED',
      payload: null,
    });
  });

  it('routes feed local writes through the service worker shell', async () => {
    expect(messageListener).toBeTypeOf('function');
    const favoritesResponse = vi.fn();
    const hiddenResponse = vi.fn();
    const sortResponse = vi.fn();
    const savedViewsResponse = vi.fn();
    const seenResponse = vi.fn();
    const resetResponse = vi.fn();
    const badgeResponse = vi.fn();
    const openResponse = vi.fn();
    const favorites = { 'mission-1': 1779436800000 };
    const hidden = { 'mission-2': 1779436900000 };
    const seenIds = ['mission-1', 'mission-2'];
    const savedViews = [
      {
        id: 'view-1',
        name: 'Remote',
        filters: {
          searchQuery: '',
          selectedStacks: [],
          selectedSource: null,
          selectedRemote: 'full' as const,
          selectedSeniority: null,
          selectedScoreBucket: null,
          decisionPreset: null,
          showNewOnly: false,
          showFavoritesOnly: false,
          showHidden: false,
          sortBy: 'score' as const,
        },
        createdAt: 1779436800000,
        updatedAt: 1779436800000,
      },
    ];

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
      messageListener?.(
        { type: 'SAVE_FEED_SAVED_VIEWS', payload: savedViews },
        {},
        savedViewsResponse
      )
    ).toBe(true);
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
    expect(setFeedSavedViews).toHaveBeenCalledWith(savedViews);
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
    expect(savedViewsResponse).toHaveBeenCalledWith({
      type: 'FEED_SAVED_VIEWS_SAVED',
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
    const tourClearResponse = vi.fn();

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
    expect(messageListener?.({ type: 'CLEAR_FEED_TOUR_SEEN' }, {}, tourClearResponse)).toBe(true);
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
    expect(tourClearResponse).toHaveBeenCalledWith({
      type: 'FEED_TOUR_SEEN_CLEARED',
      payload: { cleared: true },
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

  describe('UPDATE_TRACKING_DETAILS handler', () => {
    it('updates nextActionAt on an existing tracking and persists it', async () => {
      expect(messageListener).toBeTypeOf('function');
      const sendResponse = vi.fn();
      const existing = makeTracking({ missionId: 'mission-1', nextActionAt: null });
      getTracking.mockResolvedValueOnce(existing);

      const handled = messageListener?.(
        {
          type: 'UPDATE_TRACKING_DETAILS',
          payload: { missionId: 'mission-1', nextActionAt: '2026-07-15T10:00:00.000Z' },
        },
        {},
        sendResponse
      );
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handled).toBe(true);
      expect(saveTracking).toHaveBeenCalledWith(
        expect.objectContaining({
          missionId: 'mission-1',
          currentStatus: 'selected',
          nextActionAt: '2026-07-15T10:00:00.000Z',
        })
      );
      expect(sendResponse).toHaveBeenCalledWith({
        type: 'TRACKING_UPDATED',
        payload: expect.objectContaining({
          missionId: 'mission-1',
          nextActionAt: '2026-07-15T10:00:00.000Z',
        }),
      });
    });

    it('creates a fresh tracking when none exists before applying nextActionAt', async () => {
      expect(messageListener).toBeTypeOf('function');
      const sendResponse = vi.fn();
      getTracking.mockResolvedValueOnce(null);

      const handled = messageListener?.(
        {
          type: 'UPDATE_TRACKING_DETAILS',
          payload: { missionId: 'mission-new', nextActionAt: '2026-08-01T00:00:00.000Z' },
        },
        {},
        sendResponse
      );
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handled).toBe(true);
      expect(saveTracking).toHaveBeenCalledWith(
        expect.objectContaining({
          missionId: 'mission-new',
          currentStatus: 'detected',
          nextActionAt: '2026-08-01T00:00:00.000Z',
          history: expect.any(Array),
        })
      );
      expect(sendResponse).toHaveBeenCalledWith({
        type: 'TRACKING_UPDATED',
        payload: expect.objectContaining({
          missionId: 'mission-new',
          nextActionAt: '2026-08-01T00:00:00.000Z',
        }),
      });
    });

    it('clears nextActionAt when the payload explicitly sends null', async () => {
      expect(messageListener).toBeTypeOf('function');
      const sendResponse = vi.fn();
      getTracking.mockResolvedValueOnce(
        makeTracking({ missionId: 'mission-1', nextActionAt: '2026-07-15T10:00:00.000Z' })
      );

      messageListener?.(
        {
          type: 'UPDATE_TRACKING_DETAILS',
          payload: { missionId: 'mission-1', nextActionAt: null },
        },
        {},
        sendResponse
      );
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(saveTracking).toHaveBeenCalledWith(
        expect.objectContaining({ missionId: 'mission-1', nextActionAt: null })
      );
      expect(sendResponse).toHaveBeenCalledWith({
        type: 'TRACKING_UPDATED',
        payload: expect.objectContaining({ missionId: 'mission-1', nextActionAt: null }),
      });
    });

    it('treats an omitted nextActionAt as null (schema marks it optional)', async () => {
      expect(messageListener).toBeTypeOf('function');
      const sendResponse = vi.fn();
      getTracking.mockResolvedValueOnce(
        makeTracking({ missionId: 'mission-1', nextActionAt: '2026-07-15T10:00:00.000Z' })
      );

      messageListener?.(
        { type: 'UPDATE_TRACKING_DETAILS', payload: { missionId: 'mission-1' } },
        {},
        sendResponse
      );
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(saveTracking).toHaveBeenCalledWith(
        expect.objectContaining({ missionId: 'mission-1', nextActionAt: null })
      );
      expect(sendResponse).toHaveBeenCalledWith({
        type: 'TRACKING_UPDATED',
        payload: expect.objectContaining({ missionId: 'mission-1', nextActionAt: null }),
      });
    });

    it('responds with the current tracking instead of throwing when persistence fails', async () => {
      expect(messageListener).toBeTypeOf('function');
      const sendResponse = vi.fn();
      const existing = makeTracking({ missionId: 'mission-1', nextActionAt: null });
      // getTracking resolves to `existing` both for the initial read and the catch fallback.
      getTracking.mockResolvedValue(existing);
      saveTracking.mockRejectedValueOnce(new Error('storage down'));

      await expect(
        (async () => {
          messageListener?.(
            {
              type: 'UPDATE_TRACKING_DETAILS',
              payload: { missionId: 'mission-1', nextActionAt: '2026-07-15T10:00:00.000Z' },
            },
            {},
            sendResponse
          );
          await new Promise((resolve) => setTimeout(resolve, 0));
        })()
      ).resolves.toBeUndefined();

      expect(saveTracking).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({
        type: 'TRACKING_UPDATED',
        payload: existing,
      });
    });
  });
});
