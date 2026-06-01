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

function makeMission(): Mission {
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
});
