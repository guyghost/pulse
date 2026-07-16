import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { MissionTracking } from '../../../src/lib/core/types/tracking';
import type { UserProfile } from '../../../src/lib/core/types/profile';
import type {
  ScanOptions,
  ScanProgressInfo,
  ScanResult,
} from '../../../src/lib/shell/scan/scanner';
import type { ScanCheckpoint } from '../../../src/models/scan-lifecycle.machine';

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
const saveScanCheckpoint = vi.fn();
const clearScanCheckpoint = vi.fn();
const waitForScanRecovery = vi.fn();
const notifyHighScoreMissions = vi.fn();
const setupNotificationClickHandler = vi.fn();
const getProfile = vi.fn();
const saveProfile = vi.fn();
const getMissions = vi.fn();
const saveMissions = vi.fn();
const purgeOldMissions = vi.fn();
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
const recordTJMFromMissions = vi.fn();
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
const arrivalSessionStore: Record<string, unknown> = {};

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

function expectedTrackingFailure(
  intent: 'load' | 'transition' | 'details' | 'restore',
  missionId: string | null,
  code:
    'LOAD_FAILED' | 'PERSIST_FAILED' | 'INVALID_TRANSITION' | 'INVALID_DETAILS' | 'INVALID_RESTORE',
  message: string,
  recoverable: boolean
) {
  return {
    type: 'TRACKING_FAILED',
    payload: {
      version: 1,
      code,
      intent,
      missionId,
      mutationId: null,
      message,
      recoverable,
    },
  };
}

function successfulScanImplementation(result: ScanResult) {
  return async (
    _signal?: AbortSignal,
    _onProgress?: (info: ScanProgressInfo) => void,
    options?: ScanOptions
  ): Promise<ScanResult> => {
    options?.onLifecycleEvent?.({ type: 'CONNECTOR_STARTED', connectorId: 'free-work' });
    options?.onLifecycleEvent?.({
      type: 'CONNECTOR_SUCCEEDED',
      connectorId: 'free-work',
      missions: result.missions,
    });
    return result;
  };
}

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
    session: {
      get: vi.fn(async (key: string) =>
        key in arrivalSessionStore ? { [key]: arrivalSessionStore[key] } : {}
      ),
      set: vi.fn(async (values: Record<string, unknown>) => {
        Object.assign(arrivalSessionStore, values);
      }),
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
  saveMissions,
  purgeOldMissions,
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
  ScanError: class ScanError extends Error {
    constructor(
      message: string,
      readonly code: string
    ) {
      super(message);
      this.name = 'ScanError';
    }
  },
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
  saveScanCheckpoint,
  clearScanCheckpoint,
}));

vi.mock('../../../src/background/scan-recovery', () => ({
  waitForScanRecovery,
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
  recordTJMFromMissions,
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
    waitForScanRecovery.mockResolvedValue(undefined);
    await import('../../../src/background/index.ts');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(arrivalSessionStore)) {
      delete arrivalSessionStore[key];
    }
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
    const missions = [
      makeMission({ id: 'mission-1', score: 92 }),
      makeMission({ id: 'mission-2', score: 45 }),
    ];
    runScan.mockImplementation(
      successfulScanImplementation({
        missions,
        sourceMissions: missions,
        duplicateRelations: [],
        errors: [],
      })
    );
    notifyHighScoreMissions.mockResolvedValue({
      shown: true,
      notifiedMissionIds: ['mission-1'],
    });
    getMissions.mockResolvedValue([makeMission()]);
    saveMissions.mockResolvedValue(undefined);
    purgeOldMissions.mockResolvedValue(0);
    recordTJMFromMissions.mockResolvedValue(undefined);
    resetNewMissionCount.mockResolvedValue(undefined);
    setDeepLinkIntent.mockResolvedValue(undefined);
    consumeDeepLinkIntent.mockResolvedValue(null);
    saveScanCheckpoint.mockResolvedValue(undefined);
    clearScanCheckpoint.mockResolvedValue(true);
    waitForScanRecovery.mockResolvedValue(undefined);
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
    const feedProjectionMessages = vi
      .mocked(chrome.runtime.sendMessage)
      .mock.calls.map(([message]) => message)
      .filter((message) => (message as { type?: string }).type === 'MISSIONS_UPDATED');
    expect(feedProjectionMessages).toEqual([
      {
        type: 'MISSIONS_UPDATED',
        projection: 'cold-only',
        payload: [
          expect.objectContaining({ id: 'mission-1' }),
          expect.objectContaining({ id: 'mission-2' }),
        ],
      },
    ]);
  });

  it('clears badge and new mission count when all fetched missions are already seen', async () => {
    const missions = [makeMission({ id: 'already-seen', score: 92 })];
    runScan.mockImplementationOnce(
      successfulScanImplementation({
        missions,
        sourceMissions: missions,
        duplicateRelations: [],
        errors: [],
      })
    );
    notifyHighScoreMissions.mockResolvedValueOnce({ shown: false, notifiedMissionIds: [] });

    await alarmListener?.({ name: 'auto-scan' });

    expect(setNewMissionCount).toHaveBeenCalledWith(0);
    expect(setBadgeText).toHaveBeenCalledWith({ text: '' });
    expect(notifyHighScoreMissions).not.toHaveBeenCalled();
    expect(saveSeenIds).not.toHaveBeenCalled();
  });

  it('clears badge and new mission count when scan returns no missions', async () => {
    runScan.mockImplementationOnce(
      successfulScanImplementation({
        missions: [],
        sourceMissions: [],
        duplicateRelations: [],
        errors: [],
      })
    );

    await alarmListener?.({ name: 'auto-scan' });

    expect(setNewMissionCount).toHaveBeenCalledWith(0);
    expect(setBadgeText).toHaveBeenCalledWith({ text: '' });
    expect(notifyHighScoreMissions).not.toHaveBeenCalled();
  });

  it('acknowledges start and cancel non-terminally, then broadcasts cancelled once after quiescence', async () => {
    expect(messageListener).toBeTypeOf('function');
    let activeSignal: AbortSignal | undefined;
    let releaseAbortSettlement: (() => void) | undefined;
    const abortSettled = new Promise<void>((resolve) => {
      releaseAbortSettlement = resolve;
    });
    runScan.mockImplementationOnce(
      (signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          activeSignal = signal;
          signal?.addEventListener(
            'abort',
            () => {
              void abortSettled.then(() => {
                reject(
                  Object.assign(new Error('Scan annulé'), {
                    name: 'ScanError',
                    code: 'CANCELLED',
                  })
                );
              });
            },
            { once: true }
          );
        })
    );

    const activeResponse = vi.fn();
    const busyResponse = vi.fn();
    const staleCancelResponse = vi.fn();
    const cancelResponse = vi.fn();

    messageListener?.(
      {
        type: 'SCAN_START',
        payload: { operationId: 'operation-active', trigger: 'manual' },
      },
      {},
      activeResponse
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      messageListener?.(
        {
          type: 'SCAN_START',
          payload: { operationId: 'operation-rejected', trigger: 'manual' },
        },
        {},
        busyResponse
      )
    ).toBe(true);
    await vi.waitFor(() => {
      expect(busyResponse).toHaveBeenCalledWith({
        type: 'SCAN_BUSY',
        payload: { operationId: 'operation-rejected', activeOperationId: 'operation-active' },
      });
    });
    expect(runScan).toHaveBeenCalledTimes(1);

    messageListener?.(
      { type: 'SCAN_CANCEL', payload: { operationId: 'operation-rejected' } },
      {},
      staleCancelResponse
    );
    await vi.waitFor(() => {
      expect(staleCancelResponse).toHaveBeenCalled();
    });
    expect(activeSignal?.aborted).toBe(false);
    expect(staleCancelResponse).toHaveBeenCalledWith({
      type: 'SCAN_CANCEL_REJECTED',
      payload: {
        operationId: 'operation-rejected',
        code: 'STALE_OPERATION',
        message: 'Aucun scan actif ne correspond à cette opération.',
      },
    });

    messageListener?.(
      { type: 'SCAN_CANCEL', payload: { operationId: 'operation-active' } },
      {},
      cancelResponse
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(activeSignal?.aborted).toBe(true);
    const terminalBeforeAbortSettlement = vi
      .mocked(chrome.runtime.sendMessage)
      .mock.calls.map(([message]) => message)
      .filter(
        (message) =>
          typeof message === 'object' &&
          message !== null &&
          ['SCAN_COMPLETE', 'SCAN_ERROR', 'SCAN_CANCELLED'].includes(
            (message as { type?: string }).type ?? ''
          )
      );

    releaseAbortSettlement?.();
    await vi.waitFor(() => {
      expect(
        vi
          .mocked(chrome.runtime.sendMessage)
          .mock.calls.some(
            ([message]) =>
              typeof message === 'object' &&
              message !== null &&
              (message as { type?: string }).type === 'SCAN_CANCELLED'
          )
      ).toBe(true);
    });

    expect(activeResponse).toHaveBeenCalledTimes(1);
    expect(activeResponse).toHaveBeenCalledWith({
      type: 'SCAN_STARTED',
      payload: { operationId: 'operation-active' },
    });
    expect(cancelResponse).toHaveBeenCalledTimes(1);
    expect(cancelResponse).toHaveBeenCalledWith({
      type: 'SCAN_CANCEL_REQUESTED',
      payload: { operationId: 'operation-active' },
    });
    expect(terminalBeforeAbortSettlement).toEqual([]);

    const terminalBroadcasts = vi
      .mocked(chrome.runtime.sendMessage)
      .mock.calls.map(([message]) => message)
      .filter(
        (message) =>
          typeof message === 'object' &&
          message !== null &&
          (message as { type?: string }).type === 'SCAN_CANCELLED'
      );
    expect(terminalBroadcasts).toEqual([
      { type: 'SCAN_CANCELLED', payload: { operationId: 'operation-active' } },
    ]);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SCAN_COMPLETE' })
    );
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SCAN_ERROR' })
    );
  });

  it('waits for the aborted mission transaction before cancelling and launches no post-commit effect', async () => {
    expect(messageListener).toBeTypeOf('function');
    let commitSignal: AbortSignal | undefined;
    let releaseTransactionAbort: (() => void) | undefined;
    const transactionAbortSettled = new Promise<void>((resolve) => {
      releaseTransactionAbort = resolve;
    });

    const missions = [makeMission({ id: 'mission-pending-commit' })];
    runScan.mockImplementationOnce(
      successfulScanImplementation({
        missions,
        sourceMissions: missions,
        duplicateRelations: [],
        errors: [],
      })
    );
    saveMissions.mockImplementationOnce(
      (_missions: Mission[], signal?: AbortSignal) =>
        new Promise<void>((_resolve, reject) => {
          commitSignal = signal;
          void transactionAbortSettled.then(() => {
            reject(new DOMException('The transaction was aborted.', 'AbortError'));
          });
        })
    );

    const startResponse = vi.fn();
    const cancelResponse = vi.fn();
    messageListener?.(
      {
        type: 'SCAN_START',
        payload: { operationId: 'operation-persisting', trigger: 'manual' },
      },
      {},
      startResponse
    );
    await vi.waitFor(() => {
      expect(saveMissions).toHaveBeenCalledTimes(1);
    });

    messageListener?.(
      { type: 'SCAN_CANCEL', payload: { operationId: 'operation-persisting' } },
      {},
      cancelResponse
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const terminalsBeforeAbortSettlement = vi
      .mocked(chrome.runtime.sendMessage)
      .mock.calls.map(([message]) => message)
      .filter(
        (message) =>
          typeof message === 'object' &&
          message !== null &&
          ['SCAN_COMPLETE', 'SCAN_ERROR', 'SCAN_CANCELLED'].includes(
            (message as { type?: string }).type ?? ''
          )
      );

    releaseTransactionAbort?.();
    await vi.waitFor(() => {
      expect(
        vi
          .mocked(chrome.runtime.sendMessage)
          .mock.calls.filter(
            ([message]) =>
              typeof message === 'object' &&
              message !== null &&
              (message as { type?: string }).type === 'SCAN_CANCELLED'
          )
      ).toHaveLength(1);
    });

    expect(terminalsBeforeAbortSettlement).toEqual([]);
    expect(commitSignal?.aborted).toBe(true);
    expect(startResponse).toHaveBeenCalledWith({
      type: 'SCAN_STARTED',
      payload: { operationId: 'operation-persisting' },
    });
    expect(cancelResponse).toHaveBeenCalledWith({
      type: 'SCAN_CANCEL_REQUESTED',
      payload: { operationId: 'operation-persisting' },
    });
    expect(recordTJMFromMissions).not.toHaveBeenCalled();
    expect(purgeOldMissions).not.toHaveBeenCalled();
    expect(saveConnectorStatuses).not.toHaveBeenCalled();
    expect(setNewMissionCount).not.toHaveBeenCalled();
    expect(notifyHighScoreMissions).not.toHaveBeenCalled();
  });

  it('publishes committed completion before deferred projections and makes late cancel a no-op', async () => {
    expect(messageListener).toBeTypeOf('function');
    let releaseProjection: (() => void) | undefined;
    const projectionSettled = new Promise<void>((resolve) => {
      releaseProjection = resolve;
    });
    recordTJMFromMissions.mockImplementationOnce(() => projectionSettled);
    const missions = [makeMission({ id: 'mission-committed-before-projections' })];
    runScan.mockImplementationOnce(
      successfulScanImplementation({
        missions,
        sourceMissions: missions,
        duplicateRelations: [],
        errors: [],
      })
    );

    const startResponse = vi.fn();
    const cancelResponse = vi.fn();
    const secondStartResponse = vi.fn();
    const postProjectionCancelResponse = vi.fn();
    messageListener?.(
      {
        type: 'SCAN_START',
        payload: { operationId: 'operation-committed', trigger: 'manual' },
      },
      {},
      startResponse
    );
    await vi.waitFor(() => {
      expect(recordTJMFromMissions).toHaveBeenCalledTimes(1);
    });

    const terminalsBeforeProjection = vi
      .mocked(chrome.runtime.sendMessage)
      .mock.calls.map(([message]) => message)
      .filter(
        (message) =>
          typeof message === 'object' &&
          message !== null &&
          ['SCAN_COMPLETE', 'SCAN_ERROR', 'SCAN_CANCELLED'].includes(
            (message as { type?: string }).type ?? ''
          )
      );

    messageListener?.(
      { type: 'SCAN_CANCEL', payload: { operationId: 'operation-committed' } },
      {},
      cancelResponse
    );
    messageListener?.(
      {
        type: 'SCAN_START',
        payload: { operationId: 'operation-after-projections', trigger: 'manual' },
      },
      {},
      secondStartResponse
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const secondStartAcknowledgedBeforeProjection = secondStartResponse.mock.calls.length > 0;
    const scanCallsBeforeProjection = runScan.mock.calls.length;
    releaseProjection?.();
    await vi.waitFor(() => {
      expect(secondStartResponse).toHaveBeenCalledWith({
        type: 'SCAN_STARTED',
        payload: { operationId: 'operation-after-projections' },
      });
      expect(runScan).toHaveBeenCalledTimes(2);
    });
    expect(saveConnectorStatuses).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(clearScanCheckpoint).toHaveBeenCalledWith('operation-after-projections');
    });
    messageListener?.(
      { type: 'SCAN_CANCEL', payload: { operationId: 'operation-committed' } },
      {},
      postProjectionCancelResponse
    );
    await vi.waitFor(() => {
      expect(postProjectionCancelResponse).toHaveBeenCalled();
    });

    expect(startResponse).toHaveBeenCalledWith({
      type: 'SCAN_STARTED',
      payload: { operationId: 'operation-committed' },
    });
    expect(terminalsBeforeProjection).toEqual([
      {
        type: 'SCAN_COMPLETE',
        payload: { operationId: 'operation-committed', missions },
      },
    ]);
    const terminalCheckpointCallIndex = saveScanCheckpoint.mock.calls.findIndex(
      ([checkpoint]) =>
        checkpoint.operationId === 'operation-committed' &&
        checkpoint.terminal?.type === 'SCAN_COMPLETE'
    );
    const terminalBroadcastCallIndex = vi
      .mocked(chrome.runtime.sendMessage)
      .mock.calls.findIndex(
        ([message]) =>
          typeof message === 'object' &&
          message !== null &&
          (message as { type?: string }).type === 'SCAN_COMPLETE'
      );
    expect(terminalCheckpointCallIndex).toBeGreaterThanOrEqual(0);
    expect(terminalBroadcastCallIndex).toBeGreaterThanOrEqual(0);
    expect(saveScanCheckpoint.mock.calls[terminalCheckpointCallIndex]?.[0]).toMatchObject({
      state: 'completed',
      terminal: {
        type: 'SCAN_COMPLETE',
        missionIds: ['mission-committed-before-projections'],
      },
    });
    expect(saveScanCheckpoint.mock.invocationCallOrder[terminalCheckpointCallIndex]).toBeLessThan(
      vi.mocked(chrome.runtime.sendMessage).mock.invocationCallOrder[terminalBroadcastCallIndex]
    );
    expect(
      vi.mocked(chrome.runtime.sendMessage).mock.invocationCallOrder[terminalBroadcastCallIndex]
    ).toBeLessThan(clearScanCheckpoint.mock.invocationCallOrder[0]);
    expect(clearScanCheckpoint.mock.invocationCallOrder[0]).toBeLessThan(
      recordTJMFromMissions.mock.invocationCallOrder[0]
    );
    expect(secondStartAcknowledgedBeforeProjection).toBe(false);
    expect(scanCallsBeforeProjection).toBe(1);
    expect(cancelResponse).toHaveBeenCalledWith({
      type: 'SCAN_CANCEL_REQUESTED',
      payload: { operationId: 'operation-committed' },
    });
    expect(postProjectionCancelResponse).toHaveBeenCalledWith({
      type: 'SCAN_CANCEL_REQUESTED',
      payload: { operationId: 'operation-committed' },
    });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SCAN_ERROR' })
    );
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SCAN_CANCELLED' })
    );
    expect(purgeOldMissions).toHaveBeenCalled();
  });

  it('awaits the starting checkpoint before acknowledging or launching scanner work', async () => {
    expect(messageListener).toBeTypeOf('function');
    let releaseStartingCheckpoint: (() => void) | undefined;
    let observeStartingCheckpoint: (() => void) | undefined;
    const startingCheckpointObserved = new Promise<void>((resolve) => {
      observeStartingCheckpoint = resolve;
    });
    saveScanCheckpoint.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          observeStartingCheckpoint?.();
          releaseStartingCheckpoint = resolve;
        })
    );
    const sendResponse = vi.fn();

    const listenerResult = messageListener?.(
      {
        type: 'SCAN_START',
        payload: { operationId: 'operation-checkpointed-start', trigger: 'manual' },
      },
      {},
      sendResponse
    );
    await startingCheckpointObserved;
    await Promise.resolve();

    expect(listenerResult).toBe(true);
    expect(sendResponse).not.toHaveBeenCalled();
    expect(runScan).not.toHaveBeenCalled();
    expect(saveScanCheckpoint).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        version: 1,
        operationId: 'operation-checkpointed-start',
        state: 'starting',
        terminal: null,
      })
    );

    releaseStartingCheckpoint?.();
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        type: 'SCAN_STARTED',
        payload: { operationId: 'operation-checkpointed-start' },
      });
    });
    await vi.waitFor(() => {
      expect(runScan).toHaveBeenCalledTimes(1);
    });
    await vi.waitFor(() => {
      expect(clearScanCheckpoint).toHaveBeenCalledWith('operation-checkpointed-start');
    });
  });

  it('admits the next queued start when the first provisional checkpoint fails', async () => {
    expect(messageListener).toBeTypeOf('function');
    let rejectFirstCheckpoint: ((error: Error) => void) | undefined;
    let observeFirstCheckpoint: (() => void) | undefined;
    const firstCheckpointObserved = new Promise<void>((resolve) => {
      observeFirstCheckpoint = resolve;
    });
    saveScanCheckpoint.mockImplementation((checkpoint: ScanCheckpoint) => {
      if (
        checkpoint.operationId === 'operation-provisional-failure' &&
        checkpoint.state === 'starting' &&
        checkpoint.terminal === null
      ) {
        observeFirstCheckpoint?.();
        return new Promise<void>((_resolve, reject) => {
          rejectFirstCheckpoint = reject;
        });
      }
      return Promise.resolve();
    });
    const firstResponse = vi.fn();
    const secondResponse = vi.fn();

    messageListener?.(
      {
        type: 'SCAN_START',
        payload: { operationId: 'operation-provisional-failure', trigger: 'manual' },
      },
      {},
      firstResponse
    );
    await firstCheckpointObserved;
    messageListener?.(
      {
        type: 'SCAN_START',
        payload: { operationId: 'operation-after-provisional-failure', trigger: 'manual' },
      },
      {},
      secondResponse
    );
    await new Promise((resolve) => setTimeout(resolve, 25));

    const firstRespondedBeforeDecision = firstResponse.mock.calls.length > 0;
    const secondRespondedBeforeDecision = secondResponse.mock.calls.length > 0;
    const secondCheckpointWrittenBeforeDecision = saveScanCheckpoint.mock.calls.some(
      ([checkpoint]) => checkpoint.operationId === 'operation-after-provisional-failure'
    );
    const scannerStartedBeforeDecision = runScan.mock.calls.length > 0;

    rejectFirstCheckpoint?.(new Error('first provisional checkpoint failed'));

    await vi.waitFor(() => {
      expect(firstResponse).toHaveBeenCalledWith({
        type: 'SCAN_START_REJECTED',
        payload: {
          operationId: 'operation-provisional-failure',
          code: 'CHECKPOINT_STORAGE',
          message: 'first provisional checkpoint failed',
        },
      });
      expect(secondResponse).toHaveBeenCalledWith({
        type: 'SCAN_STARTED',
        payload: { operationId: 'operation-after-provisional-failure' },
      });
    });
    expect(firstRespondedBeforeDecision).toBe(false);
    expect(secondRespondedBeforeDecision).toBe(false);
    expect(secondCheckpointWrittenBeforeDecision).toBe(false);
    expect(scannerStartedBeforeDecision).toBe(false);
    expect(secondResponse).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SCAN_BUSY' }));
    await vi.waitFor(() => {
      expect(clearScanCheckpoint).toHaveBeenCalledWith('operation-after-provisional-failure');
    });
  });

  it('reports busy only after the first provisional checkpoint publishes its accepted lease', async () => {
    expect(messageListener).toBeTypeOf('function');
    let releaseFirstCheckpoint: (() => void) | undefined;
    let observeFirstCheckpoint: (() => void) | undefined;
    let releaseFirstScan: (() => void) | undefined;
    const firstCheckpointObserved = new Promise<void>((resolve) => {
      observeFirstCheckpoint = resolve;
    });
    const firstScanBlocked = new Promise<void>((resolve) => {
      releaseFirstScan = resolve;
    });
    saveScanCheckpoint.mockImplementation((checkpoint: ScanCheckpoint) => {
      if (
        checkpoint.operationId === 'operation-provisional-success' &&
        checkpoint.state === 'starting' &&
        checkpoint.terminal === null
      ) {
        observeFirstCheckpoint?.();
        return new Promise<void>((resolve) => {
          releaseFirstCheckpoint = resolve;
        });
      }
      return Promise.resolve();
    });
    const missions = [makeMission({ id: 'mission-provisional-success' })];
    runScan.mockImplementationOnce(
      async (
        _signal?: AbortSignal,
        _onProgress?: (info: ScanProgressInfo) => void,
        options?: ScanOptions
      ) => {
        options?.onLifecycleEvent?.({ type: 'CONNECTOR_STARTED', connectorId: 'free-work' });
        await firstScanBlocked;
        options?.onLifecycleEvent?.({
          type: 'CONNECTOR_SUCCEEDED',
          connectorId: 'free-work',
          missions,
        });
        return { missions, sourceMissions: missions, duplicateRelations: [], errors: [] };
      }
    );
    const firstResponse = vi.fn();
    const secondResponse = vi.fn();

    messageListener?.(
      {
        type: 'SCAN_START',
        payload: { operationId: 'operation-provisional-success', trigger: 'manual' },
      },
      {},
      firstResponse
    );
    await firstCheckpointObserved;
    messageListener?.(
      {
        type: 'SCAN_START',
        payload: { operationId: 'operation-busy-after-acceptance', trigger: 'manual' },
      },
      {},
      secondResponse
    );
    await new Promise((resolve) => setTimeout(resolve, 25));

    const firstRespondedBeforeDecision = firstResponse.mock.calls.length > 0;
    const secondRespondedBeforeDecision = secondResponse.mock.calls.length > 0;
    releaseFirstCheckpoint?.();

    await vi.waitFor(() => {
      expect(firstResponse).toHaveBeenCalledWith({
        type: 'SCAN_STARTED',
        payload: { operationId: 'operation-provisional-success' },
      });
      expect(secondResponse).toHaveBeenCalledWith({
        type: 'SCAN_BUSY',
        payload: {
          operationId: 'operation-busy-after-acceptance',
          activeOperationId: 'operation-provisional-success',
        },
      });
    });
    expect(firstRespondedBeforeDecision).toBe(false);
    expect(secondRespondedBeforeDecision).toBe(false);
    expect(
      saveScanCheckpoint.mock.calls.some(
        ([checkpoint]) => checkpoint.operationId === 'operation-busy-after-acceptance'
      )
    ).toBe(false);

    await vi.waitFor(() => {
      expect(releaseFirstScan).toBeTypeOf('function');
    });
    releaseFirstScan?.();
    await vi.waitFor(() => {
      expect(clearScanCheckpoint).toHaveBeenCalledWith('operation-provisional-success');
    });
  });

  it('waits for a successful provisional start decision before cancelling it', async () => {
    expect(messageListener).toBeTypeOf('function');
    let releaseStartingCheckpoint: (() => void) | undefined;
    let observeStartingCheckpoint: (() => void) | undefined;
    const startingCheckpointObserved = new Promise<void>((resolve) => {
      observeStartingCheckpoint = resolve;
    });
    saveScanCheckpoint.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          observeStartingCheckpoint?.();
          releaseStartingCheckpoint = resolve;
        })
    );
    const startResponse = vi.fn();
    const cancelResponse = vi.fn();

    messageListener?.(
      {
        type: 'SCAN_START',
        payload: { operationId: 'operation-cancel-provisional-success', trigger: 'manual' },
      },
      {},
      startResponse
    );
    await startingCheckpointObserved;
    messageListener?.(
      { type: 'SCAN_CANCEL', payload: { operationId: 'operation-cancel-provisional-success' } },
      {},
      cancelResponse
    );
    await new Promise((resolve) => setTimeout(resolve, 25));

    const startRespondedBeforeDecision = startResponse.mock.calls.length > 0;
    const cancelRespondedBeforeDecision = cancelResponse.mock.calls.length > 0;
    releaseStartingCheckpoint?.();

    await vi.waitFor(() => {
      expect(startResponse).toHaveBeenCalledWith({
        type: 'SCAN_STARTED',
        payload: { operationId: 'operation-cancel-provisional-success' },
      });
      expect(cancelResponse).toHaveBeenCalledWith({
        type: 'SCAN_CANCEL_REQUESTED',
        payload: { operationId: 'operation-cancel-provisional-success' },
      });
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'SCAN_CANCELLED',
        payload: { operationId: 'operation-cancel-provisional-success' },
      });
    });
    expect(startRespondedBeforeDecision).toBe(false);
    expect(cancelRespondedBeforeDecision).toBe(false);
  });

  it('rejects cancel with the matching provisional checkpoint failure instead of stale', async () => {
    expect(messageListener).toBeTypeOf('function');
    let rejectStartingCheckpoint: ((error: Error) => void) | undefined;
    let observeStartingCheckpoint: (() => void) | undefined;
    const startingCheckpointObserved = new Promise<void>((resolve) => {
      observeStartingCheckpoint = resolve;
    });
    saveScanCheckpoint.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          observeStartingCheckpoint?.();
          rejectStartingCheckpoint = reject;
        })
    );
    const startResponse = vi.fn();
    const cancelResponse = vi.fn();

    messageListener?.(
      {
        type: 'SCAN_START',
        payload: { operationId: 'operation-cancel-provisional-failure', trigger: 'manual' },
      },
      {},
      startResponse
    );
    await startingCheckpointObserved;
    messageListener?.(
      { type: 'SCAN_CANCEL', payload: { operationId: 'operation-cancel-provisional-failure' } },
      {},
      cancelResponse
    );
    await new Promise((resolve) => setTimeout(resolve, 25));

    const startRespondedBeforeDecision = startResponse.mock.calls.length > 0;
    const cancelRespondedBeforeDecision = cancelResponse.mock.calls.length > 0;
    rejectStartingCheckpoint?.(new Error('provisional lease unavailable'));

    await vi.waitFor(() => {
      expect(startResponse).toHaveBeenCalledWith({
        type: 'SCAN_START_REJECTED',
        payload: {
          operationId: 'operation-cancel-provisional-failure',
          code: 'CHECKPOINT_STORAGE',
          message: 'provisional lease unavailable',
        },
      });
      expect(cancelResponse).toHaveBeenCalledWith({
        type: 'SCAN_CANCEL_REJECTED',
        payload: {
          operationId: 'operation-cancel-provisional-failure',
          code: 'CHECKPOINT_STORAGE',
          message: 'provisional lease unavailable',
        },
      });
    });
    expect(startRespondedBeforeDecision).toBe(false);
    expect(cancelRespondedBeforeDecision).toBe(false);
    expect(cancelResponse).not.toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ code: 'STALE_OPERATION' }),
      })
    );
    expect(runScan).not.toHaveBeenCalled();
  });

  it('correlates cancel with a queued start that becomes busy after the accepted lease', async () => {
    expect(messageListener).toBeTypeOf('function');
    let releaseFirstCheckpoint: (() => void) | undefined;
    let observeFirstCheckpoint: (() => void) | undefined;
    let releaseFirstScan: (() => void) | undefined;
    const firstCheckpointObserved = new Promise<void>((resolve) => {
      observeFirstCheckpoint = resolve;
    });
    const firstScanBlocked = new Promise<void>((resolve) => {
      releaseFirstScan = resolve;
    });
    saveScanCheckpoint.mockImplementation((checkpoint: ScanCheckpoint) => {
      if (
        checkpoint.operationId === 'operation-accepted-before-queued-cancel' &&
        checkpoint.state === 'starting' &&
        checkpoint.terminal === null
      ) {
        observeFirstCheckpoint?.();
        return new Promise<void>((resolve) => {
          releaseFirstCheckpoint = resolve;
        });
      }
      return Promise.resolve();
    });
    const missions = [makeMission({ id: 'mission-accepted-before-queued-cancel' })];
    runScan.mockImplementationOnce(
      async (
        _signal?: AbortSignal,
        _onProgress?: (info: ScanProgressInfo) => void,
        options?: ScanOptions
      ) => {
        options?.onLifecycleEvent?.({ type: 'CONNECTOR_STARTED', connectorId: 'free-work' });
        await firstScanBlocked;
        options?.onLifecycleEvent?.({
          type: 'CONNECTOR_SUCCEEDED',
          connectorId: 'free-work',
          missions,
        });
        return { missions, sourceMissions: missions, duplicateRelations: [], errors: [] };
      }
    );
    const firstResponse = vi.fn();
    const queuedStartResponse = vi.fn();
    const queuedCancelResponse = vi.fn();

    messageListener?.(
      {
        type: 'SCAN_START',
        payload: {
          operationId: 'operation-accepted-before-queued-cancel',
          trigger: 'manual',
        },
      },
      {},
      firstResponse
    );
    await firstCheckpointObserved;
    messageListener?.(
      {
        type: 'SCAN_START',
        payload: { operationId: 'operation-queued-then-busy', trigger: 'manual' },
      },
      {},
      queuedStartResponse
    );
    messageListener?.(
      { type: 'SCAN_CANCEL', payload: { operationId: 'operation-queued-then-busy' } },
      {},
      queuedCancelResponse
    );
    await new Promise((resolve) => setTimeout(resolve, 25));

    const queuedStartRespondedBeforeDecision = queuedStartResponse.mock.calls.length > 0;
    const queuedCancelRespondedBeforeDecision = queuedCancelResponse.mock.calls.length > 0;
    releaseFirstCheckpoint?.();

    await vi.waitFor(() => {
      expect(firstResponse).toHaveBeenCalledWith({
        type: 'SCAN_STARTED',
        payload: { operationId: 'operation-accepted-before-queued-cancel' },
      });
      expect(queuedStartResponse).toHaveBeenCalledWith({
        type: 'SCAN_BUSY',
        payload: {
          operationId: 'operation-queued-then-busy',
          activeOperationId: 'operation-accepted-before-queued-cancel',
        },
      });
      expect(queuedCancelResponse).toHaveBeenCalledWith({
        type: 'SCAN_CANCEL_REJECTED',
        payload: {
          operationId: 'operation-queued-then-busy',
          code: 'START_NOT_ACCEPTED',
          message:
            'Le scan operation-queued-then-busy n’a pas été accepté car operation-accepted-before-queued-cancel est actif.',
        },
      });
    });
    expect(queuedStartRespondedBeforeDecision).toBe(false);
    expect(queuedCancelRespondedBeforeDecision).toBe(false);
    expect(queuedCancelResponse).not.toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ code: 'STALE_OPERATION' }),
      })
    );

    await vi.waitFor(() => {
      expect(releaseFirstScan).toBeTypeOf('function');
    });
    releaseFirstScan?.();
    await vi.waitFor(() => {
      expect(clearScanCheckpoint).toHaveBeenCalledWith('operation-accepted-before-queued-cancel');
    });
  });

  it('does not overwrite the recovered operation while a concurrent start awaits the bootstrap gate', async () => {
    expect(messageListener).toBeTypeOf('function');
    let releaseRecovery: (() => void) | undefined;
    const recoveryGate = new Promise<void>((resolve) => {
      releaseRecovery = resolve;
    });
    waitForScanRecovery.mockReturnValueOnce(recoveryGate);
    const sendResponse = vi.fn();

    const listenerResult = messageListener?.(
      {
        type: 'SCAN_START',
        payload: { operationId: 'operation-after-recovery', trigger: 'manual' },
      },
      {},
      sendResponse
    );
    await Promise.resolve();

    expect(listenerResult).toBe(true);
    expect(saveScanCheckpoint).not.toHaveBeenCalled();
    expect(runScan).not.toHaveBeenCalled();
    expect(sendResponse).not.toHaveBeenCalled();

    releaseRecovery?.();
    await vi.waitFor(() => {
      expect(saveScanCheckpoint).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          operationId: 'operation-after-recovery',
          state: 'starting',
        })
      );
      expect(sendResponse).toHaveBeenCalledWith({
        type: 'SCAN_STARTED',
        payload: { operationId: 'operation-after-recovery' },
      });
    });
    await vi.waitFor(() => {
      expect(clearScanCheckpoint).toHaveBeenCalledWith('operation-after-recovery');
    });
  });

  it('rejects a start non-terminally when its starting checkpoint cannot be stored', async () => {
    expect(messageListener).toBeTypeOf('function');
    saveScanCheckpoint.mockRejectedValueOnce(new Error('session storage unavailable'));
    const sendResponse = vi.fn();

    const listenerResult = messageListener?.(
      {
        type: 'SCAN_START',
        payload: { operationId: 'operation-checkpoint-failed', trigger: 'manual' },
      },
      {},
      sendResponse
    );

    expect(listenerResult).toBe(true);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        type: 'SCAN_START_REJECTED',
        payload: {
          operationId: 'operation-checkpoint-failed',
          code: 'CHECKPOINT_STORAGE',
          message: 'session storage unavailable',
        },
      });
    });
    expect(runScan).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SCAN_ERROR' })
    );
  });

  it('retries bootstrap recovery after one rejected start command', async () => {
    expect(messageListener).toBeTypeOf('function');
    waitForScanRecovery
      .mockRejectedValueOnce(new Error('recovery read failed'))
      .mockResolvedValueOnce(null);
    const firstResponse = vi.fn();
    const secondResponse = vi.fn();

    messageListener?.(
      {
        type: 'SCAN_START',
        payload: { operationId: 'operation-recovery-first', trigger: 'manual' },
      },
      {},
      firstResponse
    );

    await vi.waitFor(() => {
      expect(firstResponse).toHaveBeenCalledWith({
        type: 'SCAN_START_REJECTED',
        payload: {
          operationId: 'operation-recovery-first',
          code: 'CHECKPOINT_STORAGE',
          message: 'recovery read failed',
        },
      });
    });
    expect(saveScanCheckpoint).not.toHaveBeenCalled();
    expect(runScan).not.toHaveBeenCalled();

    messageListener?.(
      {
        type: 'SCAN_START',
        payload: { operationId: 'operation-recovery-second', trigger: 'manual' },
      },
      {},
      secondResponse
    );

    await vi.waitFor(() => {
      expect(secondResponse).toHaveBeenCalledWith({
        type: 'SCAN_STARTED',
        payload: { operationId: 'operation-recovery-second' },
      });
      expect(runScan).toHaveBeenCalledTimes(1);
    });
  });

  it('waits for recovery before acknowledging a cancel for the recovered terminal id', async () => {
    expect(messageListener).toBeTypeOf('function');
    let releaseRecovery: ((operationId: string) => void) | undefined;
    waitForScanRecovery.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        releaseRecovery = resolve;
      })
    );
    const sendResponse = vi.fn();

    const handled = messageListener?.(
      { type: 'SCAN_CANCEL', payload: { operationId: 'operation-recovered-terminal' } },
      {},
      sendResponse
    );
    await Promise.resolve();

    expect(handled).toBe(true);
    expect(sendResponse).not.toHaveBeenCalled();
    releaseRecovery?.('operation-recovered-terminal');

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        type: 'SCAN_CANCEL_REQUESTED',
        payload: { operationId: 'operation-recovered-terminal' },
      });
    });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SCAN_ERROR' })
    );
  });

  it('scopes a health recheck connector without mutating global settings', async () => {
    expect(messageListener).toBeTypeOf('function');
    const sendResponse = vi.fn();
    runScan.mockImplementationOnce(
      async (
        _signal?: AbortSignal,
        _onProgress?: (info: ScanProgressInfo) => void,
        options?: ScanOptions
      ) => {
        const missions = [makeMission({ id: 'health-recheck-mission', source: 'lehibou' })];
        options?.onLifecycleEvent?.({ type: 'CONNECTOR_STARTED', connectorId: 'lehibou' });
        options?.onLifecycleEvent?.({
          type: 'CONNECTOR_SUCCEEDED',
          connectorId: 'lehibou',
          missions,
        });
        return { missions, sourceMissions: missions, duplicateRelations: [], errors: [] };
      }
    );

    const handled = messageListener?.(
      {
        type: 'RECHECK_CONNECTOR_HEALTH',
        payload: { connectorId: 'lehibou', enable: false },
      },
      {},
      sendResponse
    );

    expect(handled).toBe(true);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        type: 'CONNECTOR_HEALTH_RESULT',
        payload: [],
      });
    });
    expect(runScan).toHaveBeenCalledWith(
      expect.any(AbortSignal),
      undefined,
      expect.objectContaining({ connectorIdsOverride: ['lehibou'] })
    );
    expect(setSettings).not.toHaveBeenCalled();
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
      payload: { missionId: 'mission-1', tracking: previousTracking },
    });
    expect(clearResponse).toHaveBeenCalledWith({
      type: 'TRACKING_RESTORED',
      payload: { missionId: 'mission-2', tracking: null },
    });
  });

  describe('truthful tracking command settlement', () => {
    it('reports a failed collection load instead of inventing an empty success', async () => {
      const response = vi.fn();
      getAllTrackings.mockRejectedValueOnce(new Error('indexeddb unavailable'));

      expect(messageListener?.({ type: 'GET_TRACKINGS', payload: {} }, {}, response)).toBe(true);
      await vi.waitFor(() => expect(response).toHaveBeenCalled());

      expect(response).toHaveBeenCalledWith(
        expectedTrackingFailure(
          'load',
          null,
          'LOAD_FAILED',
          'Impossible de charger le suivi des candidatures.',
          true
        )
      );
      expect(response).not.toHaveBeenCalledWith({ type: 'TRACKINGS_RESULT', payload: [] });
    });

    it('reports transition persistence failure without a fallback record', async () => {
      const response = vi.fn();
      const current = makeTracking({ currentStatus: 'selected' });
      getTracking.mockResolvedValueOnce(current);
      saveTracking.mockRejectedValueOnce(new Error('quota'));

      messageListener?.(
        { type: 'UPDATE_TRACKING', payload: { missionId: 'mission-1', status: 'applied' } },
        {},
        response
      );
      await vi.waitFor(() => expect(response).toHaveBeenCalled());

      expect(response).toHaveBeenCalledWith(
        expectedTrackingFailure(
          'transition',
          'mission-1',
          'PERSIST_FAILED',
          'Impossible d’enregistrer le nouveau statut.',
          true
        )
      );
      expect(response).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'TRACKING_UPDATED' })
      );
    });

    it('rejects an invalid transition before persistence', async () => {
      const response = vi.fn();
      getTracking.mockResolvedValueOnce(makeTracking({ currentStatus: 'selected' }));

      messageListener?.(
        { type: 'UPDATE_TRACKING', payload: { missionId: 'mission-1', status: 'accepted' } },
        {},
        response
      );
      await vi.waitFor(() => expect(response).toHaveBeenCalled());

      expect(saveTracking).not.toHaveBeenCalled();
      expect(response).toHaveBeenCalledWith(
        expectedTrackingFailure(
          'transition',
          'mission-1',
          'INVALID_TRANSITION',
          'Ce changement de statut n’est pas autorisé.',
          false
        )
      );
    });

    it('reports details persistence failure without rereading a fallback', async () => {
      const response = vi.fn();
      getTracking.mockResolvedValueOnce(makeTracking());
      saveTracking.mockRejectedValueOnce(new Error('transaction aborted'));

      messageListener?.(
        {
          type: 'UPDATE_TRACKING_DETAILS',
          payload: { missionId: 'mission-1', nextActionAt: '2026-07-15T10:00:00.000Z' },
        },
        {},
        response
      );
      await vi.waitFor(() => expect(response).toHaveBeenCalled());

      expect(getTracking).toHaveBeenCalledTimes(1);
      expect(response).toHaveBeenCalledWith(
        expectedTrackingFailure(
          'details',
          'mission-1',
          'PERSIST_FAILED',
          'Impossible d’enregistrer les détails de suivi.',
          true
        )
      );
    });

    it('rejects invalid details before reading or writing', async () => {
      const response = vi.fn();

      messageListener?.(
        {
          type: 'UPDATE_TRACKING_DETAILS',
          payload: { missionId: 'mission-1', nextActionAt: 'demain' },
        },
        {},
        response
      );
      await vi.waitFor(() => expect(response).toHaveBeenCalled());

      expect(getTracking).not.toHaveBeenCalled();
      expect(saveTracking).not.toHaveBeenCalled();
      expect(response).toHaveBeenCalledWith(
        expectedTrackingFailure(
          'details',
          'mission-1',
          'INVALID_DETAILS',
          'Les détails de suivi sont invalides.',
          false
        )
      );
    });

    it.each(['accepted', 'rejected', 'archived'] as const)(
      'rejects a non-null follow-up for terminal status %s before persistence',
      async (currentStatus) => {
        const response = vi.fn();
        getTracking.mockResolvedValueOnce(makeTracking({ currentStatus }));

        messageListener?.(
          {
            type: 'UPDATE_TRACKING_DETAILS',
            payload: { missionId: 'mission-1', nextActionAt: '2026-07-15T10:00:00.000Z' },
          },
          {},
          response
        );
        await vi.waitFor(() => expect(response).toHaveBeenCalled());

        expect(saveTracking).not.toHaveBeenCalled();
        expect(response).toHaveBeenCalledWith(
          expectedTrackingFailure(
            'details',
            'mission-1',
            'INVALID_DETAILS',
            'Les détails de suivi sont invalides.',
            false
          )
        );
      }
    );

    it('rejects a restore snapshot for another mission before I/O', async () => {
      const response = vi.fn();

      messageListener?.(
        {
          type: 'RESTORE_TRACKING',
          payload: {
            missionId: 'mission-1',
            tracking: makeTracking({ missionId: 'mission-2' }),
          },
        },
        {},
        response
      );
      await vi.waitFor(() => expect(response).toHaveBeenCalled());

      expect(saveTracking).not.toHaveBeenCalled();
      expect(deleteTracking).not.toHaveBeenCalled();
      expect(response).toHaveBeenCalledWith(
        expectedTrackingFailure(
          'restore',
          'mission-1',
          'INVALID_RESTORE',
          'Cette annulation n’est pas valide.',
          false
        )
      );
    });

    it('rejects an incomplete restore snapshot before I/O', async () => {
      const response = vi.fn();

      messageListener?.(
        {
          type: 'RESTORE_TRACKING',
          payload: {
            missionId: 'mission-1',
            tracking: { missionId: 'mission-1', currentStatus: 'selected' },
          },
        },
        {},
        response
      );
      await vi.waitFor(() => expect(response).toHaveBeenCalled());

      expect(saveTracking).not.toHaveBeenCalled();
      expect(deleteTracking).not.toHaveBeenCalled();
      expect(response).toHaveBeenCalledWith(
        expectedTrackingFailure(
          'restore',
          'mission-1',
          'INVALID_RESTORE',
          'Cette annulation n’est pas valide.',
          false
        )
      );
    });

    it.each([['put', makeTracking()] as const, ['delete', null] as const])(
      'reports restore %s persistence failure without fallback success',
      async (kind, snapshot) => {
        const response = vi.fn();
        if (kind === 'put') {
          saveTracking.mockRejectedValueOnce(new Error('put failed'));
        } else {
          deleteTracking.mockRejectedValueOnce(new Error('delete failed'));
        }

        messageListener?.(
          { type: 'RESTORE_TRACKING', payload: { missionId: 'mission-1', tracking: snapshot } },
          {},
          response
        );
        await vi.waitFor(() => expect(response).toHaveBeenCalled());

        expect(response).toHaveBeenCalledWith(
          expectedTrackingFailure(
            'restore',
            'mission-1',
            'PERSIST_FAILED',
            'Impossible d’annuler la modification.',
            true
          )
        );
        expect(response).not.toHaveBeenCalledWith(
          expect.objectContaining({ type: 'TRACKING_RESTORED' })
        );
      }
    );
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

    it('responds with a typed failure when details persistence fails', async () => {
      expect(messageListener).toBeTypeOf('function');
      const sendResponse = vi.fn();
      const existing = makeTracking({ missionId: 'mission-1', nextActionAt: null });
      getTracking.mockResolvedValueOnce(existing);
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
      expect(getTracking).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith(
        expectedTrackingFailure(
          'details',
          'mission-1',
          'PERSIST_FAILED',
          'Impossible d’enregistrer les détails de suivi.',
          true
        )
      );
    });
  });

  it('retries idempotent terminal finalization before admitting the next start', async () => {
    expect(messageListener).toBeTypeOf('function');
    clearScanCheckpoint.mockRejectedValueOnce(new Error('session remove failed'));
    const firstResponse = vi.fn();
    const secondResponse = vi.fn();

    messageListener?.(
      {
        type: 'SCAN_START',
        payload: { operationId: 'operation-cleanup-blocker', trigger: 'manual' },
      },
      {},
      firstResponse
    );

    await vi.waitFor(() => {
      expect(firstResponse).toHaveBeenCalledWith({
        type: 'SCAN_STARTED',
        payload: { operationId: 'operation-cleanup-blocker' },
      });
      expect(clearScanCheckpoint).toHaveBeenCalledWith('operation-cleanup-blocker');
    });

    messageListener?.(
      {
        type: 'SCAN_START',
        payload: { operationId: 'operation-after-cleanup-failure', trigger: 'manual' },
      },
      {},
      secondResponse
    );

    await vi.waitFor(() => {
      expect(secondResponse).toHaveBeenCalledWith({
        type: 'SCAN_STARTED',
        payload: { operationId: 'operation-after-cleanup-failure' },
      });
      expect(runScan).toHaveBeenCalledTimes(2);
    });
    await vi.waitFor(() => {
      expect(clearScanCheckpoint).toHaveBeenCalledWith('operation-after-cleanup-failure');
      expect(purgeOldMissions).toHaveBeenCalledTimes(2);
    });

    const oldTerminalWrites = saveScanCheckpoint.mock.calls.filter(
      ([checkpoint]) =>
        checkpoint.operationId === 'operation-cleanup-blocker' && checkpoint.terminal !== null
    );
    const oldClearCalls = clearScanCheckpoint.mock.calls.filter(
      ([operationId]) => operationId === 'operation-cleanup-blocker'
    );
    const newStartingWriteIndex = saveScanCheckpoint.mock.calls.findIndex(
      ([checkpoint]) =>
        checkpoint.operationId === 'operation-after-cleanup-failure' &&
        checkpoint.state === 'starting'
    );
    const oldRetryClearIndex = clearScanCheckpoint.mock.calls.findLastIndex(
      ([operationId]) => operationId === 'operation-cleanup-blocker'
    );

    expect(oldTerminalWrites).toHaveLength(2);
    expect(oldClearCalls).toHaveLength(2);
    expect(newStartingWriteIndex).toBeGreaterThanOrEqual(0);
    expect(oldRetryClearIndex).toBeGreaterThanOrEqual(0);
    expect(clearScanCheckpoint.mock.invocationCallOrder[oldRetryClearIndex]).toBeLessThan(
      saveScanCheckpoint.mock.invocationCallOrder[newStartingWriteIndex]
    );
    expect(
      vi
        .mocked(chrome.runtime.sendMessage)
        .mock.calls.filter(
          ([message]) =>
            typeof message === 'object' &&
            message !== null &&
            (message as { type?: string; payload?: { operationId?: string } }).type ===
              'SCAN_COMPLETE' &&
            (message as { payload?: { operationId?: string } }).payload?.operationId ===
              'operation-cleanup-blocker'
        )
    ).toHaveLength(1);
  });

  it('retries a pre-broadcast terminal save before acknowledging late cancel as a no-op', async () => {
    expect(messageListener).toBeTypeOf('function');
    let terminalSaveFailed = false;
    saveScanCheckpoint.mockImplementation(async (checkpoint) => {
      if (
        checkpoint.operationId === 'operation-save-fail-once' &&
        checkpoint.terminal !== null &&
        !terminalSaveFailed
      ) {
        terminalSaveFailed = true;
        throw new Error('terminal save failed once');
      }
    });
    const startResponse = vi.fn();
    const cancelResponse = vi.fn();

    messageListener?.(
      {
        type: 'SCAN_START',
        payload: { operationId: 'operation-save-fail-once', trigger: 'manual' },
      },
      {},
      startResponse
    );
    await vi.waitFor(() => {
      expect(startResponse).toHaveBeenCalledWith({
        type: 'SCAN_STARTED',
        payload: { operationId: 'operation-save-fail-once' },
      });
      expect(
        saveScanCheckpoint.mock.calls.some(
          ([checkpoint]) =>
            checkpoint.operationId === 'operation-save-fail-once' && checkpoint.terminal !== null
        )
      ).toBe(true);
    });

    messageListener?.(
      { type: 'SCAN_CANCEL', payload: { operationId: 'operation-save-fail-once' } },
      {},
      cancelResponse
    );

    await vi.waitFor(() => {
      expect(cancelResponse).toHaveBeenCalledWith({
        type: 'SCAN_CANCEL_REQUESTED',
        payload: { operationId: 'operation-save-fail-once' },
      });
    });
    expect(
      vi
        .mocked(chrome.runtime.sendMessage)
        .mock.calls.filter(
          ([message]) =>
            typeof message === 'object' &&
            message !== null &&
            (message as { type?: string; payload?: { operationId?: string } }).type ===
              'SCAN_COMPLETE' &&
            (message as { payload?: { operationId?: string } }).payload?.operationId ===
              'operation-save-fail-once'
        )
    ).toHaveLength(1);
    expect(cancelResponse).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SCAN_CANCEL_REJECTED' })
    );
  });

  it('rejects a new start while terminal checkpoint cleanup keeps failing', async () => {
    expect(messageListener).toBeTypeOf('function');
    clearScanCheckpoint.mockRejectedValue(new Error('session remove still failing'));
    const firstResponse = vi.fn();
    const secondResponse = vi.fn();

    messageListener?.(
      {
        type: 'SCAN_START',
        payload: { operationId: 'operation-persistent-blocker', trigger: 'manual' },
      },
      {},
      firstResponse
    );

    await vi.waitFor(() => {
      expect(firstResponse).toHaveBeenCalledWith({
        type: 'SCAN_STARTED',
        payload: { operationId: 'operation-persistent-blocker' },
      });
      expect(clearScanCheckpoint).toHaveBeenCalledWith('operation-persistent-blocker');
    });

    messageListener?.(
      {
        type: 'SCAN_START',
        payload: { operationId: 'operation-still-blocked', trigger: 'manual' },
      },
      {},
      secondResponse
    );

    await vi.waitFor(() => {
      expect(secondResponse).toHaveBeenCalledWith({
        type: 'SCAN_START_REJECTED',
        payload: {
          operationId: 'operation-still-blocked',
          code: 'CHECKPOINT_CLEANUP_PENDING',
          message: 'Le checkpoint terminal de operation-persistent-blocker doit être récupéré.',
        },
      });
    });
    expect(
      saveScanCheckpoint.mock.calls.some(
        ([checkpoint]) => checkpoint.operationId === 'operation-still-blocked'
      )
    ).toBe(false);
    expect(runScan).toHaveBeenCalledTimes(1);
  });

  it('rejects late cancel as cleanup-pending when pre-broadcast terminal save keeps failing', async () => {
    vi.resetModules();
    await import('../../../src/background/index.ts');
    expect(messageListener).toBeTypeOf('function');
    saveScanCheckpoint.mockImplementation(async (checkpoint) => {
      if (checkpoint.operationId === 'operation-save-persistent' && checkpoint.terminal !== null) {
        throw new Error('terminal save still failing');
      }
    });
    const startResponse = vi.fn();
    const cancelResponse = vi.fn();

    messageListener?.(
      {
        type: 'SCAN_START',
        payload: { operationId: 'operation-save-persistent', trigger: 'manual' },
      },
      {},
      startResponse
    );
    await vi.waitFor(() => {
      expect(startResponse).toHaveBeenCalledWith({
        type: 'SCAN_STARTED',
        payload: { operationId: 'operation-save-persistent' },
      });
      expect(
        saveScanCheckpoint.mock.calls.some(
          ([checkpoint]) =>
            checkpoint.operationId === 'operation-save-persistent' && checkpoint.terminal !== null
        )
      ).toBe(true);
    });

    messageListener?.(
      { type: 'SCAN_CANCEL', payload: { operationId: 'operation-save-persistent' } },
      {},
      cancelResponse
    );

    await vi.waitFor(() => {
      expect(cancelResponse).toHaveBeenCalledWith({
        type: 'SCAN_CANCEL_REJECTED',
        payload: {
          operationId: 'operation-save-persistent',
          code: 'CHECKPOINT_CLEANUP_PENDING',
          message: 'Le checkpoint terminal de operation-save-persistent doit être récupéré.',
        },
      });
    });
    expect(cancelResponse).not.toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ code: 'STALE_OPERATION' }),
      })
    );
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: expect.stringMatching(/^SCAN_(?:COMPLETE|ERROR|CANCELLED)$/),
      })
    );
  });
});
