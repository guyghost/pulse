import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mission } from '../../../src/lib/core/types/mission';

const getSettings = vi.fn();
const runScan = vi.fn();
const getSeenIds = vi.fn();
const saveSeenIds = vi.fn();
const setNewMissionCount = vi.fn();
const notifyHighScoreMissions = vi.fn();
const setupNotificationClickHandler = vi.fn();

let alarmListener: ((alarm: { name: string }) => Promise<void>) | undefined;

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
      set: vi.fn(async () => undefined),
    },
    onChanged: {
      addListener: vi.fn(),
    },
  },
  action: {
    setBadgeText: vi.fn(async () => undefined),
    setBadgeBackgroundColor: vi.fn(async () => undefined),
    setBadgeTextColor: vi.fn(async () => undefined),
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

vi.mock('../../../src/lib/shell/notifications/notify-missions', () => ({
  notifyHighScoreMissions,
  setupNotificationClickHandler,
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
    notifyHighScoreMissions.mockResolvedValue(true);
  });

  it('persists notified mission ids so they are not alerted again on the next scan', async () => {
    expect(alarmListener).toBeTypeOf('function');

    await alarmListener?.({ name: 'auto-scan' });

    expect(notifyHighScoreMissions).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'mission-1' }),
    ]);
    expect(saveSeenIds).toHaveBeenCalledWith(['already-seen', 'mission-1']);
  });
});
