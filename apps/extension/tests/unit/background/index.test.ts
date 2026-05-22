import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mission } from '../../../src/lib/core/types/mission';

const getSettings = vi.fn();
const runScan = vi.fn();
const getSeenIds = vi.fn();
const saveSeenIds = vi.fn();
const setNewMissionCount = vi.fn();
const notifyHighScoreMissions = vi.fn();
const setupNotificationClickHandler = vi.fn();
const getMissions = vi.fn();
const saveConnectorStatuses = vi.fn();
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
const setBadgeText = vi.fn(async () => undefined);
const setBadgeBackgroundColor = vi.fn(async () => undefined);
const setBadgeTextColor = vi.fn(async () => undefined);

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
    create: vi.fn(),
  },
});

vi.mock('../../../src/lib/shell/storage/chrome-storage', () => ({
  getSettings,
  setSettings: vi.fn(async () => undefined),
}));

vi.mock('../../../src/lib/shell/storage/db', () => ({
  getProfile: vi.fn(async () => null),
  saveProfile: vi.fn(async () => undefined),
  saveConnectorStatuses,
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

vi.mock('../../../src/lib/shell/storage/session-storage', () => ({
  setNewMissionCount,
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
    await import('../../../src/background/index.ts');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getSettings.mockResolvedValue({
      scanIntervalMinutes: 30,
      enabledConnectors: ['free-work'],
      notifications: true,
      autoScan: true,
      maxSemanticPerScan: 10,
      notificationScoreThreshold: 70,
    });
    getSeenIds.mockResolvedValue(['already-seen']);
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

    const handled = messageListener?.({ type: 'RETRY_CONNECTED_SYNC' }, {}, sendResponse);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handled).toBe(true);
    expect(getMissions).toHaveBeenCalled();
    expect(getAllTrackings).toHaveBeenCalled();
    expect(syncConnectedDashboardSnapshot).toHaveBeenCalledWith({
      missions: [expect.objectContaining({ id: 'mission-1' })],
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
});
