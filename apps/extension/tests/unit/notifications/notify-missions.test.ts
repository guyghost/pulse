import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mission } from '$lib/core/types/mission';

const getSettings = vi.fn();
const getMissions = vi.fn();
const getSeenIds = vi.fn();
const saveSeenIds = vi.fn();
const getConnectedAlertPreferences = vi.fn();
const recordAlertHistoryEntry = vi.fn();

const notificationsCreate = vi.fn();
const sessionGet = vi.fn();
const sessionSet = vi.fn();
const sessionRemove = vi.fn();

vi.mock('../../../src/lib/shell/storage/chrome-storage', () => ({
  getSettings,
}));

vi.mock('../../../src/lib/shell/settings-release/settings-release-reader', () => ({
  readSettingsReleaseSnapshot: vi.fn(async () => ({
    settings: await getSettings(),
    onboardingCompleted: true,
    revision: 0,
    generation: 0,
  })),
}));

vi.mock('../../../src/lib/shell/storage/db', () => ({
  getMissions,
}));

vi.mock('../../../src/lib/shell/storage/seen-missions', () => ({
  getSeenIds,
  saveSeenIds,
}));

vi.mock('../../../src/lib/shell/storage/connected-alert-preferences', () => ({
  getConnectedAlertPreferences,
}));

vi.mock('../../../src/lib/shell/storage/alert-history', () => ({
  recordAlertHistoryEntry,
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
    saveSeenIds.mockResolvedValue(undefined);
    getMissions.mockResolvedValue([]);
    getConnectedAlertPreferences.mockResolvedValue(null);
    recordAlertHistoryEntry.mockResolvedValue(undefined);
    sessionGet.mockResolvedValue({});
    sessionSet.mockResolvedValue(undefined);
    sessionRemove.mockResolvedValue(undefined);
    notificationsCreate.mockResolvedValue(undefined);

    vi.stubGlobal('chrome', {
      storage: {
        session: {
          get: sessionGet,
          set: sessionSet,
          remove: sessionRemove,
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
        sendMessage: vi.fn(async () => undefined),
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
    expect(recordAlertHistoryEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        triggeredAt: 1_700_000_000_000,
        missionCount: 1,
        missionIds: ['low-basic'],
        missionTitles: ['Mission IA'],
        scoreThreshold: 70,
        minDailyRate: 0,
        requiredStacks: [],
      })
    );
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

  it('uses connected dashboard alert preferences when synchronized', async () => {
    getConnectedAlertPreferences.mockResolvedValueOnce({
      enabled: true,
      scoreThreshold: 80,
      minDailyRate: 650,
      requiredStacks: ['Svelte'],
      maxResults: 1,
      mutedUntil: null,
      revision: 2,
      updatedAt: '2026-05-22T08:00:00.000Z',
    });

    const { notifyHighScoreMissions } =
      await import('../../../src/lib/shell/notifications/notify-missions');
    const result = await notifyHighScoreMissions([
      makeMission({ id: 'react', title: 'React', stack: ['React'], score: 95, tjm: 800 }),
      makeMission({ id: 'svelte', title: 'Svelte', stack: ['Svelte'], score: 86, tjm: 700 }),
      makeMission({ id: 'low-tjm', title: 'Low TJM', stack: ['Svelte'], score: 90, tjm: 500 }),
    ]);

    expect(result).toEqual({ shown: true, notifiedMissionIds: ['svelte'] });
    expect(notificationsCreate).toHaveBeenCalledWith(
      'high-score-missions',
      expect.objectContaining({ message: 'Svelte' })
    );
    expect(recordAlertHistoryEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        missionCount: 1,
        missionIds: ['svelte'],
        scoreThreshold: 80,
        minDailyRate: 650,
        requiredStacks: ['Svelte'],
        maxResults: 1,
      })
    );
  });

  it('does not notify when connected dashboard alert preferences disable alerts', async () => {
    getConnectedAlertPreferences.mockResolvedValueOnce({
      enabled: false,
      scoreThreshold: 0,
      minDailyRate: 0,
      requiredStacks: [],
      maxResults: 5,
      mutedUntil: null,
      revision: 2,
      updatedAt: '2026-05-22T08:00:00.000Z',
    });

    const { notifyHighScoreMissions } =
      await import('../../../src/lib/shell/notifications/notify-missions');
    const result = await notifyHighScoreMissions([makeMission({ score: 99 })]);

    expect(result).toEqual({ shown: false, notifiedMissionIds: [] });
    expect(notificationsCreate).not.toHaveBeenCalled();
  });

  it('does not notify while connected alert preferences are temporarily muted', async () => {
    getConnectedAlertPreferences.mockResolvedValueOnce({
      enabled: true,
      scoreThreshold: 70,
      minDailyRate: 0,
      requiredStacks: [],
      maxResults: 5,
      mutedUntil: '2099-05-22T08:00:00.000Z',
      revision: 2,
      updatedAt: '2026-05-22T08:00:00.000Z',
    });

    const { notifyHighScoreMissions } =
      await import('../../../src/lib/shell/notifications/notify-missions');
    const result = await notifyHighScoreMissions([makeMission({ score: 99 })]);

    expect(result).toEqual({ shown: false, notifiedMissionIds: [] });
    expect(notificationsCreate).not.toHaveBeenCalled();
    expect(recordAlertHistoryEntry).not.toHaveBeenCalled();
  });

  it('returns false when cooldown is still active from session storage', async () => {
    sessionGet.mockResolvedValueOnce({ last_notification_time: 1_700_000_000_000 - 60_000 });

    const { notifyHighScoreMissions } =
      await import('../../../src/lib/shell/notifications/notify-missions');
    const result = await notifyHighScoreMissions([makeMission({ title: 'Mission rate-limited' })]);

    expect(result).toEqual({ shown: false, notifiedMissionIds: [] });
    expect(notificationsCreate).not.toHaveBeenCalled();
  });

  it('writes the deep-link intent BEFORE showing the notification (thread C race)', async () => {
    const order: string[] = [];
    notificationsCreate.mockImplementation(async () => {
      order.push('notify');
    });
    sessionSet.mockImplementation(async (payload: unknown) => {
      if (payload && typeof payload === 'object' && 'deepLinkIntent' in payload) {
        order.push('intent');
      }
    });

    const { notifyHighScoreMissions } =
      await import('../../../src/lib/shell/notifications/notify-missions');
    await notifyHighScoreMissions([makeMission({ id: 'm1', score: 90 })]);

    const intentIdx = order.indexOf('intent');
    const notifyIdx = order.indexOf('notify');
    expect(intentIdx).toBeGreaterThanOrEqual(0);
    expect(notifyIdx).toBeGreaterThanOrEqual(0);
    // The intent MUST be persisted first so a fast click can never consume null.
    expect(intentIdx).toBeLessThan(notifyIdx);
  });

  it('rolls back the deep-link intent when notification creation fails', async () => {
    notificationsCreate.mockRejectedValueOnce(new Error('chrome refused'));

    const { notifyHighScoreMissions } =
      await import('../../../src/lib/shell/notifications/notify-missions');
    const result = await notifyHighScoreMissions([makeMission({ id: 'm1', score: 90 })]);

    expect(result).toEqual({ shown: false, notifiedMissionIds: [] });
    // The optimistic intent write must be cleaned up so the next panel open
    // does not land on missions the user was never actually notified about.
    expect(sessionRemove).toHaveBeenCalled();
  });
});

describe('sendDailyDigest', () => {
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
    getMissions.mockResolvedValue([makeMission({ id: 'digest-1', title: 'Digest mission' })]);
    getSeenIds.mockResolvedValue([]);
    saveSeenIds.mockResolvedValue(undefined);
    getConnectedAlertPreferences.mockResolvedValue(null);
    recordAlertHistoryEntry.mockResolvedValue(undefined);
    sessionGet.mockResolvedValue({});
    sessionSet.mockResolvedValue(undefined);
    sessionRemove.mockResolvedValue(undefined);
    notificationsCreate.mockResolvedValue(undefined);

    vi.stubGlobal('chrome', {
      storage: {
        session: {
          get: sessionGet,
          set: sessionSet,
          remove: sessionRemove,
        },
      },
      notifications: {
        create: notificationsCreate,
        onClicked: {
          addListener: vi.fn(),
        },
        clear: vi.fn(async () => undefined),
      },
    });
  });

  it('writes a digest deep-link intent before creating the notification', async () => {
    const order: string[] = [];
    sessionSet.mockImplementation(async (payload: unknown) => {
      if (payload && typeof payload === 'object' && 'deepLinkIntent' in payload) {
        order.push('intent');
      }
    });
    notificationsCreate.mockImplementation(async () => {
      order.push('notify');
    });

    const { sendDailyDigest } = await import('../../../src/lib/shell/notifications/daily-digest');
    const result = await sendDailyDigest();

    expect(result).toEqual({ sent: true, missionIds: ['digest-1'] });
    expect(sessionSet).toHaveBeenCalledWith({
      deepLinkIntent: {
        focusMissionIds: ['digest-1'],
        source: 'digest',
        triggeredAt: 1_700_000_000_000,
      },
    });
    expect(order).toEqual(['intent', 'notify']);
  });

  it('clears the digest deep-link intent when notification creation fails', async () => {
    notificationsCreate.mockRejectedValueOnce(new Error('notification blocked'));

    const { sendDailyDigest } = await import('../../../src/lib/shell/notifications/daily-digest');
    const result = await sendDailyDigest();

    expect(result).toEqual({ sent: false, missionIds: [] });
    expect(sessionRemove).toHaveBeenCalled();
    expect(saveSeenIds).not.toHaveBeenCalled();
  });
});
