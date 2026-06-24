import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { AppSettings } from '../../../src/lib/core/types/app-settings';

const feedDataMock = vi.hoisted(() => ({
  getMissions: vi.fn(),
  getConnectorStatuses: vi.fn(),
  getConnectorsMeta: vi.fn(),
  detectAllConnectorSessions: vi.fn(),
}));

const settingsMock = vi.hoisted(() => ({
  getSettings: vi.fn(),
  setSettings: vi.fn(),
}));

const connectorsMock = vi.hoisted(() => ({
  getConnectors: vi.fn(),
}));

const bridgeMock = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  subscribeMessages: vi.fn(() => vi.fn()),
}));

vi.mock('../../../src/lib/shell/facades/feed-data.facade', () => feedDataMock);
vi.mock('../../../src/lib/shell/facades/settings.facade', () => settingsMock);
vi.mock('../../../src/lib/shell/connectors/index', () => connectorsMock);
vi.mock('../../../src/lib/shell/messaging/bridge', () => ({
  sendMessage: bridgeMock.sendMessage,
  subscribeMessages: bridgeMock.subscribeMessages,
}));

import { createFeedController } from '../../../src/lib/shell/facades/feed-controller.svelte';

const settings: AppSettings = {
  scanIntervalMinutes: 30,
  enabledConnectors: [],
  notifications: true,
  autoScan: true,
  maxSemanticPerScan: 10,
  notificationScoreThreshold: 70,
  respectRateLimits: true,
  customDelayMs: 0,
  theme: 'system',
};

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'mission-1',
    title: 'Lead Svelte',
    client: 'ScaleOps',
    description: 'Mission Svelte 5',
    stack: ['Svelte', 'TypeScript'],
    tjm: 750,
    location: 'Paris',
    remote: 'hybrid',
    duration: '6 mois',
    startDate: null,
    publishedAt: null,
    url: 'https://example.com/mission-1',
    source: 'free-work',
    scrapedAt: new Date('2026-05-22T08:00:00.000Z'),
    seniority: 'senior',
    scoreBreakdown: null,
    score: 91,
    semanticScore: null,
    semanticReason: null,
    ...overrides,
  };
}

function makeSerializedMission(
  overrides: Partial<Mission> = {}
): Omit<Mission, 'scrapedAt'> & { scrapedAt: string } {
  const mission = makeMission(overrides);
  return {
    ...mission,
    scrapedAt: mission.scrapedAt.toISOString(),
  };
}

function stubChrome(): { storageGet: ReturnType<typeof vi.fn> } {
  const storageGet = vi.fn(async () => {
    throw new Error('side panel should read sync status through the bridge');
  });

  vi.stubGlobal('chrome', {
    runtime: {
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    storage: {
      local: {
        get: storageGet,
      },
    },
  });

  return { storageGet };
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve();
  }
}

describe('feed controller facade', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T08:10:00.000Z'));
    vi.clearAllMocks();

    feedDataMock.getMissions.mockResolvedValue([makeMission()]);
    feedDataMock.getConnectorStatuses.mockResolvedValue([
      {
        connectorId: 'free-work',
        connectorName: 'Free-Work',
        lastState: 'done',
        missionsCount: 5,
        error: null,
        lastSyncAt: new Date('2026-05-22T08:05:00.000Z').getTime(),
        lastSuccessAt: new Date('2026-05-22T08:05:00.000Z').getTime(),
      },
    ]);
    feedDataMock.getConnectorsMeta.mockReturnValue([]);
    feedDataMock.detectAllConnectorSessions.mockResolvedValue([]);
    settingsMock.getSettings.mockResolvedValue(settings);
    settingsMock.setSettings.mockResolvedValue(undefined);
    connectorsMock.getConnectors.mockResolvedValue([]);
    bridgeMock.sendMessage.mockImplementation(async (message: { type: string }) => {
      if (message.type === 'GET_CONNECTOR_HEALTH') {
        return { type: 'CONNECTOR_HEALTH_RESULT', payload: [] };
      }

      return { type: 'SCAN_COMPLETE', payload: [] };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('loads fresh persisted missions using connector status timestamps', async () => {
    const { storageGet } = stubChrome();
    const feedStore = {
      load: vi.fn(),
      setMissions: vi.fn(),
      setError: vi.fn(),
    };

    const controller = createFeedController(feedStore);

    await controller.smartLoad();
    await flushPromises();

    const messageTypes = bridgeMock.sendMessage.mock.calls.map(
      ([message]) => (message as { type: string }).type
    );

    expect(feedStore.setMissions).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'mission-1' }),
    ]);
    // Should NOT start a scan because persistedStatuses show a recent sync (5 min ago)
    expect(messageTypes).not.toContain('SCAN_START');
    expect(storageGet).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('recovers from a legacy scan status response without leaving the feed loading', async () => {
    stubChrome();
    const feedStore = {
      load: vi.fn(),
      setMissions: vi.fn(),
      setError: vi.fn(),
    };

    const controller = createFeedController(feedStore);
    await flushPromises();
    vi.clearAllMocks();

    bridgeMock.sendMessage.mockImplementation(async (message: { type: string }) => {
      if (message.type === 'GET_CONNECTOR_HEALTH') {
        return { type: 'CONNECTOR_HEALTH_RESULT', payload: [] };
      }
      if (message.type === 'SCAN_START') {
        return {
          type: 'SCAN_STATUS',
          payload: { state: 'scanning', progress: 1 },
        };
      }
      return { type: 'SCAN_COMPLETE', payload: [] };
    });

    await controller.startScan();

    expect(feedStore.load).toHaveBeenCalledTimes(1);
    expect(feedStore.setMissions).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'mission-1' }),
    ]);
    expect(feedStore.setError).not.toHaveBeenCalled();
    expect(controller.isScanning).toBe(false);
    controller.dispose();
  });

  it('finalizes local scan state when SCAN_COMPLETE arrives through the bridge listener', async () => {
    stubChrome();
    let bridgeListener: ((message: unknown) => void) | null = null;
    let resolveScan: ((response: { type: 'SCAN_COMPLETE'; payload: Mission[] }) => void) | null =
      null;
    const feedStore = {
      load: vi.fn(),
      setMissions: vi.fn(),
      setError: vi.fn(),
    };

    bridgeMock.subscribeMessages.mockImplementation((handler: (message: unknown) => void) => {
      bridgeListener = handler;
      return vi.fn();
    });
    bridgeMock.sendMessage.mockImplementation((message: { type: string }) => {
      if (message.type === 'GET_CONNECTOR_HEALTH') {
        return Promise.resolve({ type: 'CONNECTOR_HEALTH_RESULT', payload: [] });
      }
      if (message.type === 'SCAN_START') {
        return new Promise((resolve) => {
          resolveScan = resolve;
        });
      }
      return Promise.resolve({ type: 'SCAN_COMPLETE', payload: [] });
    });

    const controller = createFeedController(feedStore);
    await flushPromises();
    vi.clearAllMocks();

    const startPromise = controller.startScan();
    await flushPromises();
    expect(controller.isScanning).toBe(true);

    bridgeListener?.({ type: 'SCAN_COMPLETE', payload: [makeMission()] });
    await flushPromises();

    expect(controller.isScanning).toBe(false);
    expect(feedStore.setMissions).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'mission-1' }),
    ]);

    resolveScan?.({ type: 'SCAN_COMPLETE', payload: [makeMission()] });
    await startPromise;
    controller.dispose();
  });

  it('merges SCAN_PARTIAL_RESULT with the scan snapshot without ending the scan', async () => {
    stubChrome();
    let bridgeListener: ((message: unknown) => void) | null = null;
    let resolveScan: ((response: { type: 'SCAN_COMPLETE'; payload: Mission[] }) => void) | null =
      null;
    const previousFreeWork = makeMission({
      id: 'old-free-work',
      title: 'Old Free-Work',
      source: 'free-work',
      url: 'https://example.com/old-free-work',
    });
    const previousLeHibou = makeMission({
      id: 'old-lehibou',
      title: 'Old LeHibou',
      source: 'lehibou',
      url: 'https://example.com/old-lehibou',
    });
    const partialFreeWork = makeMission({
      id: 'new-free-work',
      title: 'New Free-Work',
      source: 'free-work',
      url: 'https://example.com/new-free-work',
      scrapedAt: new Date('2026-05-22T08:08:00.000Z'),
    });
    let currentMissions = [previousFreeWork, previousLeHibou];
    const feedStore = {
      get missions() {
        return currentMissions;
      },
      load: vi.fn(),
      setMissions: vi.fn((missions: Mission[]) => {
        currentMissions = missions;
      }),
      setError: vi.fn(),
    };

    feedDataMock.getMissions.mockImplementation(async () => currentMissions);
    settingsMock.getSettings.mockResolvedValue({
      ...settings,
      enabledConnectors: ['free-work', 'lehibou'],
    });
    bridgeMock.subscribeMessages.mockImplementation((handler: (message: unknown) => void) => {
      bridgeListener = handler;
      return vi.fn();
    });
    bridgeMock.sendMessage.mockImplementation((message: { type: string }) => {
      if (message.type === 'GET_CONNECTOR_HEALTH') {
        return Promise.resolve({ type: 'CONNECTOR_HEALTH_RESULT', payload: [] });
      }
      if (message.type === 'SCAN_START') {
        return new Promise((resolve) => {
          resolveScan = resolve;
        });
      }
      return Promise.resolve({ type: 'SCAN_COMPLETE', payload: [] });
    });

    const controller = createFeedController(feedStore);
    await flushPromises();
    vi.clearAllMocks();

    const startPromise = controller.startScan();
    await flushPromises();

    bridgeListener?.({
      type: 'SCAN_PARTIAL_RESULT',
      payload: {
        connectorId: 'free-work',
        connectorName: 'Free-Work',
        missions: [makeSerializedMission(partialFreeWork)],
      },
    });
    await flushPromises();

    expect(controller.isScanning).toBe(true);
    expect(currentMissions.map((mission) => mission.id)).toEqual(['old-lehibou', 'new-free-work']);
    expect(currentMissions[1].scrapedAt).toEqual(new Date('2026-05-22T08:08:00.000Z'));

    bridgeListener?.({
      type: 'SCAN_COMPLETE',
      payload: [
        makeSerializedMission({
          id: 'final-free-work',
          title: 'Final Free-Work',
          source: 'free-work',
          url: 'https://example.com/final-free-work',
        }),
      ],
    });
    await flushPromises();

    expect(controller.isScanning).toBe(false);
    expect(currentMissions.map((mission) => mission.id)).toEqual(['final-free-work']);

    resolveScan?.({ type: 'SCAN_COMPLETE', payload: currentMissions });
    await startPromise;
    controller.dispose();
  });

  it('normalizes Chrome-serialized scan missions before updating feed state', async () => {
    stubChrome();
    const feedStore = {
      load: vi.fn(),
      setMissions: vi.fn(),
      setError: vi.fn(),
    };

    bridgeMock.sendMessage.mockImplementation(async (message: { type: string }) => {
      if (message.type === 'GET_CONNECTOR_HEALTH') {
        return { type: 'CONNECTOR_HEALTH_RESULT', payload: [] };
      }
      if (message.type === 'SCAN_START') {
        return {
          type: 'SCAN_COMPLETE',
          payload: [makeSerializedMission()],
        };
      }
      return { type: 'SCAN_COMPLETE', payload: [] };
    });

    const controller = createFeedController(feedStore);
    await flushPromises();
    vi.clearAllMocks();

    await controller.startScan();

    expect(feedStore.setMissions).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'mission-1',
        scrapedAt: new Date('2026-05-22T08:00:00.000Z'),
      }),
    ]);
    expect(feedStore.setError).not.toHaveBeenCalled();
    expect(controller.isScanning).toBe(false);
    controller.dispose();
  });
});
