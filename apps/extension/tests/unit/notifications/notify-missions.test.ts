import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mission } from '$lib/core/types/mission';

const getSettings = vi.fn();
const getSeenIds = vi.fn();

const notificationsCreate = vi.fn();
const sessionGet = vi.fn();
const sessionSet = vi.fn();

vi.mock('../../../src/lib/shell/storage/chrome-storage', () => ({
  getSettings,
}));

vi.mock('../../../src/lib/shell/storage/seen-missions', () => ({
  getSeenIds,
}));

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
  score: 80,
  semanticScore: null,
  semanticReason: null,
  ...overrides,
});

describe('notifyHighScoreMissions', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    getSettings.mockResolvedValue({
      scanIntervalMinutes: 30,
      enabledConnectors: ['free-work'],
      notifications: true,
      autoScan: true,
      maxSemanticPerScan: 10,
      notificationScoreThreshold: 70,
      respectRateLimits: true,
      customDelayMs: 0,
    });

    getSeenIds.mockResolvedValue([]);
    sessionGet.mockResolvedValue({});
    sessionSet.mockResolvedValue(undefined);
    notificationsCreate.mockResolvedValue(undefined);

    vi.stubGlobal('chrome', {
      storage: {
        session: {
          get: sessionGet,
          set: sessionSet,
        },
      },
      notifications: {
        create: notificationsCreate,
        onClicked: {
          addListener: vi.fn(),
        },
        clear: vi.fn(async () => undefined),
      },
      tabs: {
        query: vi.fn(),
        create: vi.fn(),
      },
      sidePanel: {
        open: vi.fn(),
      },
      runtime: {
        getURL: vi.fn((path: string) => path),
      },
    });
  });

  it('returns false when notifications are disabled', async () => {
    getSettings.mockResolvedValueOnce({
      scanIntervalMinutes: 30,
      enabledConnectors: ['free-work'],
      notifications: false,
      autoScan: true,
      maxSemanticPerScan: 10,
      notificationScoreThreshold: 70,
      respectRateLimits: true,
      customDelayMs: 0,
    });

    const { notifyHighScoreMissions } =
      await import('../../../src/lib/shell/notifications/notify-missions');
    const result = await notifyHighScoreMissions([makeMission()]);

    expect(result).toEqual({ shown: false, notifiedMissionIds: [] });
    expect(notificationsCreate).not.toHaveBeenCalled();
  });

  it('uses semantic score for threshold filtering and creates a notification', async () => {
    const { notifyHighScoreMissions } =
      await import('../../../src/lib/shell/notifications/notify-missions');
    const result = await notifyHighScoreMissions([
      makeMission({ id: 'low-basic', score: 40, semanticScore: 91, title: 'Mission IA' }),
      makeMission({
        id: 'below-threshold',
        score: 65,
        semanticScore: null,
        title: 'Mission faible',
      }),
    ]);

    expect(result).toEqual({ shown: true, notifiedMissionIds: ['low-basic'] });
    expect(notificationsCreate).toHaveBeenCalledWith(
      'high-score-missions',
      expect.objectContaining({
        title: '🎯 Nouvelle mission pertinente',
        message: 'Mission IA',
      })
    );
    expect(sessionSet).toHaveBeenCalledWith({ last_notification_time: 1_700_000_000_000 });
  });

  it('filters out seen missions before notifying', async () => {
    getSeenIds.mockResolvedValueOnce(['already-seen']);

    const { notifyHighScoreMissions } =
      await import('../../../src/lib/shell/notifications/notify-missions');
    const result = await notifyHighScoreMissions([
      makeMission({ id: 'already-seen', title: 'Déjà vue', score: 95 }),
      makeMission({ id: 'new-one', title: 'Nouvelle mission', score: 92 }),
    ]);

    expect(result).toEqual({ shown: true, notifiedMissionIds: ['new-one'] });
    expect(notificationsCreate).toHaveBeenCalledWith(
      'high-score-missions',
      expect.objectContaining({ message: 'Nouvelle mission' })
    );
  });

  it('groups more than 3 missions in a single notification', async () => {
    const { notifyHighScoreMissions } =
      await import('../../../src/lib/shell/notifications/notify-missions');
    const result = await notifyHighScoreMissions([
      makeMission({ id: '1', title: 'Mission 1', score: 95 }),
      makeMission({ id: '2', title: 'Mission 2', score: 94 }),
      makeMission({ id: '3', title: 'Mission 3', score: 93 }),
      makeMission({ id: '4', title: 'Mission 4', score: 92 }),
    ]);

    expect(result).toEqual({ shown: true, notifiedMissionIds: ['1', '2', '3', '4'] });
    expect(notificationsCreate).toHaveBeenCalledWith(
      'high-score-missions',
      expect.objectContaining({
        title: '🎯 4 nouvelles missions pertinentes',
        message: '• Mission 1\n• Mission 2\n• Mission 3\n• ...et 1 autres',
      })
    );
  });

  it('returns false when cooldown is still active from session storage', async () => {
    sessionGet.mockResolvedValueOnce({ last_notification_time: 1_700_000_000_000 - 60_000 });

    const { notifyHighScoreMissions } =
      await import('../../../src/lib/shell/notifications/notify-missions');
    const result = await notifyHighScoreMissions([makeMission({ title: 'Mission rate-limited' })]);

    expect(result).toEqual({ shown: false, notifiedMissionIds: [] });
    expect(notificationsCreate).not.toHaveBeenCalled();
  });
});
