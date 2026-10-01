import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFeedStore } from '../../../src/lib/state/feed.svelte';
import {
  countMissionsForFilterDraft,
  createFeedPageState,
  isRemoteCompatibleInsight,
  needsTjmNegotiation,
} from '../../../src/lib/state/feed-page.svelte';
import type { Mission, MissionSource } from '../../../src/lib/core/types/mission';
import type { FeedController } from '../../../src/lib/shell/facades/feed-controller.svelte';
import type { FeedFilterDraft } from '../../../src/models/feed-filter-sheet.model';

const feedDataMock = vi.hoisted(() => ({
  getMissionFeedback: vi.fn(async () => ({})),
  saveMissionFeedback: vi.fn(async () => {}),
  getSeenIds: vi.fn(),
  saveSeenIds: vi.fn(),
  getFavorites: vi.fn(),
  saveFavorites: vi.fn(),
  getHidden: vi.fn(),
  saveHidden: vi.fn(),
  getMissions: vi.fn(),
  getProfile: vi.fn(),
  resetNewMissionCount: vi.fn(),
  clearExtensionBadge: vi.fn(),
  getFeedSortBy: vi.fn(),
  setFeedSortBy: vi.fn(),
  getFeedSavedViews: vi.fn(),
  setFeedSavedViews: vi.fn(),
  consumeDeepLinkIntent: vi.fn(),
  subscribeToNotificationClicked: vi.fn(),
  syncFavoriteMission: vi.fn(),
}));
const toastMock = vi.hoisted(() => ({
  showToast: vi.fn(),
  showToastAction: vi.fn(),
}));

vi.mock('../../../src/lib/shell/facades/feed-data.facade', async () => {
  const favorites = await vi.importActual<
    typeof import('../../../src/lib/core/favorites/favorites')
  >('../../../src/lib/core/favorites/favorites');
  const seen = await vi.importActual<typeof import('../../../src/lib/core/seen/mark-seen')>(
    '../../../src/lib/core/seen/mark-seen'
  );

  return {
    ...feedDataMock,
    markAsSeen: seen.markAsSeen,
    toggleFavorite: favorites.toggleFavorite,
    toggleHidden: favorites.toggleHidden,
    filterHidden: favorites.filterHidden,
    filterFavoritesOnly: favorites.filterFavoritesOnly,
  };
});

vi.mock('../../../src/lib/shell/ui/panel-layout', () => ({
  getPanelSide: vi.fn(async () => 'right'),
}));

vi.mock('../../../src/lib/shell/ai/capabilities', () => ({
  isPromptApiAvailable: vi.fn(async () => 'no'),
}));

vi.mock('../../../src/lib/shell/utils/keyboard-shortcuts', () => ({
  FeedShortcuts: {
    REFRESH: { key: 'r' },
    TOGGLE_FAVORITES: { key: 'f' },
    TOGGLE_HIDDEN: { key: 'h' },
    FOCUS_SEARCH: { key: '/' },
    CLEAR_SEARCH: { key: 'Escape' },
    SHOW_HELP: { key: '?' },
  },
  registerShortcuts: vi.fn(() => vi.fn()),
}));

vi.mock('../../../src/lib/shell/notifications/toast-service', () => toastMock);

vi.mock('../../../src/lib/state/connection-singleton.svelte', () => ({
  getConnectionStore: vi.fn(() => ({ status: 'online' })),
}));

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'mission-1',
    title: 'Business Analyst',
    client: 'Client',
    description: 'Mission description',
    stack: ['Business analysis'],
    tjm: 700,
    location: 'Paris',
    remote: 'hybrid',
    duration: '6 mois',
    startDate: null,
    publishedAt: null,
    url: 'https://example.com/mission-1',
    source: 'hiway',
    scrapedAt: new Date('2026-05-27T12:00:00.000Z'),
    seniority: 'senior',
    scoreBreakdown: null,
    score: 80,
    semanticScore: null,
    semanticReason: null,
    ...overrides,
  };
}

function makeScoreBreakdown(overrides: Partial<NonNullable<Mission['scoreBreakdown']>> = {}) {
  return {
    criteria: {
      stack: 90,
      location: 70,
      tjm: 80,
      remote: 90,
      seniorityBonus: 0,
      startDateBonus: 0,
    },
    deterministic: 84,
    semantic: null,
    semanticReason: null,
    total: 84,
    grade: 'A' as const,
    ...overrides,
  };
}

function makeController(
  enabledConnectorIds = new Set<string>(),
  pendingMissions: Mission[] = []
): FeedController {
  return {
    get isScanning() {
      return false;
    },
    get ownedScan() {
      return null;
    },
    get scanCompleted() {
      return false;
    },
    get hasPendingMissions() {
      return pendingMissions.length > 0;
    },
    get pendingMissionCount() {
      return pendingMissions.length;
    },
    get pendingConnectorCount() {
      return 0;
    },
    get pendingMissions() {
      return [...pendingMissions];
    },
    get isApplyingPendingMissions() {
      return false;
    },
    get connectorStatuses() {
      return new Map();
    },
    get scanResultCounts() {
      return new Map([['hiway', 1]]);
    },
    get persistedStatuses() {
      return [];
    },
    get lastScanAt() {
      return null;
    },
    get lastScanMissionCount() {
      return 0;
    },
    get scanProgress() {
      return { current: 0, total: 0, percent: 0, connectorName: '' };
    },
    get healthSnapshots() {
      return new Map();
    },
    get parserHealthRecords() {
      return new Map();
    },
    get sourceStatuses() {
      return [];
    },
    get isCheckingSources() {
      return false;
    },
    get enabledConnectorIds() {
      return enabledConnectorIds;
    },
    startScan: vi.fn(async () => {}),
    stopScan: vi.fn(),
    handleScanComplete: vi.fn(async () => {}),
    applyPendingMissions: vi.fn(async () => {}),
    loadArrivalProjection: vi.fn(async (orderedIds: readonly string[]) => ({
      missions: orderedIds.map(
        (id) => pendingMissions.find((mission) => mission.id === id) ?? makeMission({ id })
      ),
      orderedUnseenIds: orderedIds.filter((id) =>
        pendingMissions.some((mission) => mission.id === id)
      ),
    })),
    smartLoad: vi.fn(async () => {}),
    checkSourceSessions: vi.fn(async () => {}),
    handleToggleConnector: vi.fn(async () => {}),
    refreshHealthSnapshots: vi.fn(async () => {}),
    recheckConnector: vi.fn(async () => {}),
    dispose: vi.fn(),
  };
}

describe('feed page state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    feedDataMock.getFeedSortBy.mockResolvedValue('score');
    feedDataMock.setFeedSortBy.mockResolvedValue(undefined);
    feedDataMock.saveSeenIds.mockResolvedValue(undefined);
    feedDataMock.getSeenIds.mockResolvedValue([]);
    feedDataMock.getFavorites.mockResolvedValue({});
    feedDataMock.saveFavorites.mockResolvedValue(undefined);
    feedDataMock.getHidden.mockResolvedValue({});
    feedDataMock.getProfile.mockResolvedValue(null);
    feedDataMock.resetNewMissionCount.mockResolvedValue(undefined);
    feedDataMock.clearExtensionBadge.mockResolvedValue(undefined);
    feedDataMock.getFeedSavedViews.mockResolvedValue([]);
    feedDataMock.setFeedSavedViews.mockResolvedValue(undefined);
    feedDataMock.consumeDeepLinkIntent.mockResolvedValue(null);
    feedDataMock.subscribeToNotificationClicked.mockReturnValue(() => {});
  });

  it('confirme un favori seulement après son accusé de persistance', async () => {
    let confirmPersistence: (() => void) | null = null;
    feedDataMock.saveFavorites.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          confirmPersistence = resolve;
        })
    );
    const page = createFeedPageState(createFeedStore(), makeController());

    const pending = page.handleToggleFavorite('mission-1');

    expect(page.favoritePendingIds.has('mission-1')).toBe(true);
    expect(page.favorites).not.toHaveProperty('mission-1');

    confirmPersistence?.();
    await pending;

    expect(page.favoritePendingIds.has('mission-1')).toBe(false);
    expect(page.favorites).toHaveProperty('mission-1');
  });

  it('counts source filter pills from the same missions shown by source filtering', () => {
    const feed = createFeedStore();
    const page = createFeedPageState(feed, makeController());
    feed.setMissions([
      makeMission({ id: 'hiway-1', source: 'hiway' }),
      makeMission({ id: 'hiway-2', source: 'hiway' }),
      makeMission({ id: 'hiway-3', source: 'hiway' }),
      makeMission({ id: 'hiway-4', source: 'hiway' }),
      makeMission({ id: 'free-work-1', source: 'free-work' }),
    ]);

    page.setSelectedSource('hiway' satisfies MissionSource);

    expect(page.visibleCount).toBe(4);
    expect(page.sourceMissionCounts.get('hiway')).toBe(4);
  });

  it('builds score distribution and filters by score bucket', () => {
    const feed = createFeedStore();
    const page = createFeedPageState(feed, makeController());
    feed.setMissions([
      makeMission({ id: 'strong-1', score: 92 }),
      makeMission({ id: 'strong-2', score: 80 }),
      makeMission({ id: 'good-1', score: 72 }),
      makeMission({ id: 'weak-1', score: 41 }),
    ]);

    expect(page.scoreDistribution.map((bucket) => [bucket.bucket, bucket.count])).toEqual([
      ['strong', 2],
      ['good', 1],
      ['weak', 1],
    ]);
    expect(page.dashboardSummary.highScoreCount).toBe(2);

    page.setSelectedScoreBucket('strong');

    expect(page.visibleCount).toBe(2);
    expect(page.displayMissions.map((mission) => mission.id)).toEqual(['strong-1', 'strong-2']);
  });

  it('keeps the focus banner active when search filters out the focused mission', () => {
    const feed = createFeedStore();
    const page = createFeedPageState(feed, makeController());
    feed.setMissions([
      makeMission({ id: 'focused-1', title: 'Focused Svelte mission', score: 92 }),
      makeMission({ id: 'search-hit', title: 'Rust backend mission', stack: ['Rust'], score: 75 }),
    ]);

    page.applyFocusIntent({
      focusMissionIds: ['focused-1'],
      source: 'notification',
      triggeredAt: 1_700_000_000_000,
    });
    feed.search('rust');

    expect(page.displayMissions.map((mission) => mission.id)).toEqual(['focused-1']);
    expect(page.focusMissions.map((mission) => mission.id)).toEqual(['focused-1']);
  });

  it('filters the feed to unseen missions from the dashboard toggle', () => {
    vi.useFakeTimers();
    try {
      const feed = createFeedStore();
      const page = createFeedPageState(feed, makeController());
      feed.setMissions([
        makeMission({ id: 'seen-1', score: 88 }),
        makeMission({ id: 'new-1', score: 72 }),
        makeMission({ id: 'new-2', score: 40 }),
      ]);

      page.handleMissionSeen('seen-1');
      vi.advanceTimersByTime(120);

      expect(page.dashboardSummary.newCount).toBe(2);

      page.toggleNewOnly();

      expect(page.visibleCount).toBe(2);
      expect(page.displayMissions.map((mission) => mission.id)).toEqual(['new-1', 'new-2']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a read mission in the active stable new queue until the queue is reopened', async () => {
    vi.useFakeTimers();
    try {
      const feed = createFeedStore();
      const page = createFeedPageState(feed, makeController());
      feed.setMissions([
        makeMission({ id: 'new-1', score: 88 }),
        makeMission({ id: 'new-2', score: 72 }),
      ]);

      page.toggleNewOnly();
      expect(page.stableQueueActive).toBe(true);
      expect(page.displayMissions.map((mission) => mission.id)).toEqual(['new-1', 'new-2']);

      page.handleMissionReadSignal('new-1', { type: 'started', at: 0 });
      page.handleMissionReadSignal('new-1', { type: 'elapsed', at: 1500 });
      vi.advanceTimersByTime(120);
      await Promise.resolve();
      await Promise.resolve();

      expect(page.seenIds).toContain('new-1');
      expect(page.displayMissions.map((mission) => mission.id)).toEqual(['new-1', 'new-2']);

      page.toggleNewOnly();
      page.toggleNewOnly();

      expect(page.displayMissions.map((mission) => mission.id)).toEqual(['new-2']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens frozen arrival previews without changing normal feed membership', async () => {
    const feed = createFeedStore();
    const pending = [
      makeMission({ id: 'pending-1', score: 91 }),
      makeMission({ id: 'pending-2', score: 86 }),
      makeMission({ id: 'pending-3', score: 82 }),
      makeMission({ id: 'pending-4', score: 78 }),
    ];
    const page = createFeedPageState(feed, makeController(new Set(['hiway']), pending));
    feed.setMissions([makeMission({ id: 'current-1' })]);
    await page.bootstrapArrivalActor();
    page.receiveAlarmMissions(pending);

    expect(page.arrivalStackState.value).toBe('collapsed');
    page.openArrivalStack();

    expect(page.arrivalStackState.value).toBe('open');
    expect(page.arrivalPreviewMissions.map((mission) => mission.id)).toEqual([
      'pending-1',
      'pending-2',
      'pending-3',
    ]);
    expect(page.displayMissions.map((mission) => mission.id)).toEqual(['current-1']);
  });

  it('hides pending arrivals until the Feed projection is loaded-compatible', async () => {
    const feed = createFeedStore();
    const pending = [makeMission({ id: 'pending-1', score: 91 })];
    const page = createFeedPageState(feed, makeController(new Set(['hiway']), pending));
    feed.setMissions([makeMission({ id: 'current-1' })]);
    await page.bootstrapArrivalActor();
    page.receiveAlarmMissions(pending);

    expect(page.feedPresentation).toEqual({
      value: 'loaded',
      primaryAction: 'start',
      actionEnabled: true,
      arrivalCompatible: true,
    });
    expect(page.arrivalStackVisible).toBe(true);

    feed.setError('Scan interrompu');

    expect(page.feedPresentation).toEqual({
      value: 'error',
      primaryAction: 'retry',
      actionEnabled: true,
      arrivalCompatible: false,
    });
    expect(page.arrivalStackVisible).toBe(false);
  });

  it('applies one exact base-plus-arrivals replacement after Core validation', async () => {
    const feed = createFeedStore();
    const pending = [makeMission({ id: 'pending-1', score: 91 })];
    const controller = makeController(new Set(['hiway']), pending);
    feed.setMissions([makeMission({ id: 'current-1' })]);
    const page = createFeedPageState(feed, controller);
    await page.bootstrapArrivalActor();
    page.receiveAlarmMissions(pending);

    await page.refreshArrivals();

    expect(controller.loadArrivalProjection).toHaveBeenCalledTimes(1);
    expect(controller.loadArrivalProjection).toHaveBeenCalledWith(['current-1', 'pending-1']);
    expect(feed.missions.map((mission) => mission.id)).toEqual(['current-1', 'pending-1']);
    expect(page.arrivalStackState.value).toBe('empty');
  });

  it('rejects an incomplete canonical candidate without changing the Feed', async () => {
    const feed = createFeedStore();
    const pending = [makeMission({ id: 'pending-1', score: 91 })];
    const controller = makeController(new Set(['hiway']), pending);
    feed.setMissions([makeMission({ id: 'current-1' })]);
    vi.mocked(controller.loadArrivalProjection).mockResolvedValue({
      missions: [makeMission({ id: 'current-1' })],
      orderedUnseenIds: [],
    });
    const page = createFeedPageState(feed, controller);
    await page.bootstrapArrivalActor();
    page.receiveAlarmMissions(pending);

    await page.refreshArrivals();

    expect(feed.missions.map((mission) => mission.id)).toEqual(['current-1']);
    expect(page.arrivalStackState.value).toBe('refresh-error');
  });

  it('does not silently consume arrivals when preparation fails before the indivisible commit', async () => {
    const feed = createFeedStore();
    const pending = [makeMission({ id: 'pending-1', score: 91 })];
    const controller = makeController(new Set(['hiway']), pending);
    feed.setMissions([makeMission({ id: 'current-1' })]);
    vi.mocked(controller.loadArrivalProjection).mockRejectedValue(
      new Error('canonical catalogue unavailable')
    );
    const page = createFeedPageState(feed, controller);
    await page.bootstrapArrivalActor();
    page.receiveAlarmMissions(pending);

    await page.refreshArrivals();

    expect(feed.missions.map((mission) => mission.id)).toEqual(['current-1']);
    expect(page.arrivalStackState.value).toBe('refresh-error');
    expect(page.arrivalStackCount).toBe(1);
  });

  it('applies decision presets for business-oriented feed filtering', () => {
    vi.useFakeTimers();
    try {
      const feed = createFeedStore();
      const page = createFeedPageState(feed, makeController());
      feed.setMissions([
        makeMission({ id: 'priority-remote', score: 92, remote: 'full' }),
        makeMission({ id: 'priority-onsite', score: 88, remote: 'onsite' }),
        makeMission({ id: 'remote-good', score: 72, remote: 'hybrid' }),
        makeMission({ id: 'weak-onsite', score: 41, remote: 'onsite' }),
      ]);

      expect(page.decisionPresets.map((preset) => [preset.id, preset.count])).toEqual([
        ['priority', 2],
        ['remote-compatible', 2],
        ['tjm-negotiation', 0],
        ['new', 4],
      ]);

      page.applyDecisionPreset('priority');

      expect(page.decisionPreset).toBe('priority');
      expect(page.visibleCount).toBe(2);
      expect(page.displayMissions.map((mission) => mission.id)).toEqual([
        'priority-remote',
        'priority-onsite',
      ]);

      page.applyDecisionPreset('remote-compatible');

      expect(page.decisionPreset).toBe('remote-compatible');
      expect(page.visibleCount).toBe(2);
      expect(page.displayMissions.map((mission) => mission.id)).toEqual([
        'priority-remote',
        'remote-good',
      ]);

      page.handleMissionSeen('priority-remote');
      vi.advanceTimersByTime(120);
      page.applyDecisionPreset('new');

      expect(page.decisionPreset).toBe('new');
      expect(page.visibleCount).toBe(3);
      expect(page.displayMissions.map((mission) => mission.id)).toEqual([
        'priority-onsite',
        'remote-good',
        'weak-onsite',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('saves, applies and deletes feed views', async () => {
    const feed = createFeedStore();
    const page = createFeedPageState(feed, makeController());
    feed.setMissions([
      makeMission({ id: 'remote-strong', remote: 'full', score: 91 }),
      makeMission({ id: 'hybrid-good', remote: 'hybrid', score: 72 }),
    ]);

    page.setSelectedRemote('full');
    page.setSelectedScoreBucket('strong');
    page.sortBy = 'date';
    await page.saveCurrentView('Remote prioritaire');

    expect(feedDataMock.setFeedSavedViews).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'Remote prioritaire',
        filters: expect.objectContaining({
          selectedRemote: 'full',
          selectedScoreBucket: 'strong',
          decisionPreset: null,
          sortBy: 'date',
        }),
      }),
    ]);
    expect(page.savedViews).toHaveLength(1);

    const savedId = page.savedViews[0].id;
    page.clearAllFilters();
    page.sortBy = 'score';
    expect(page.visibleCount).toBe(2);

    page.applySavedView(savedId);

    expect(page.selectedRemote).toBe('full');
    expect(page.selectedScoreBucket).toBe('strong');
    expect(page.sortBy).toBe('date');
    expect(page.visibleCount).toBe(1);
    expect(page.activeSavedViewId).toBe(savedId);

    await page.deleteSavedView(savedId);

    expect(page.savedViews).toEqual([]);
    expect(page.activeSavedViewId).toBeNull();

    expect(toastMock.showToastAction).toHaveBeenCalledWith(
      'Vue « Remote prioritaire » supprimée',
      'info',
      expect.objectContaining({ label: 'Annuler' }),
      5000
    );
    const undoAction = toastMock.showToastAction.mock.calls.at(-1)?.[2].onClick;
    expect(undoAction).toBeDefined();

    // Soft-delete contract: storage is not written while the window is open.
    const callsBeforeUndo = feedDataMock.setFeedSavedViews.mock.calls.length;
    undoAction?.();

    expect(page.savedViews).toHaveLength(1);
    expect(page.savedViews[0].id).toBe(savedId);
    expect(page.activeSavedViewId).toBe(savedId);
    // Undo reverts in-memory only; no new persistence call.
    expect(feedDataMock.setFeedSavedViews.mock.calls.length).toBe(callsBeforeUndo);
  });

  it('commits a deleted feed view to storage only when the undo window times out', async () => {
    vi.useFakeTimers();
    try {
      const feed = createFeedStore();
      const page = createFeedPageState(feed, makeController());
      feed.setMissions([makeMission({ id: 'm1', score: 80 })]);

      await page.saveCurrentView('Ma vue');
      const savedId = page.savedViews[0].id;

      const callsBeforeDelete = feedDataMock.setFeedSavedViews.mock.calls.length;
      page.deleteSavedView(savedId);

      // While the undo window is open, storage is NOT written.
      expect(feedDataMock.setFeedSavedViews.mock.calls.length).toBe(callsBeforeDelete);

      // Commit fires when the window times out (DEFAULT_UNDO_WINDOW_MS = 5000).
      vi.advanceTimersByTime(5000);

      expect(feedDataMock.setFeedSavedViews).toHaveBeenLastCalledWith([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('summarizes score explanations for the current dashboard scope', () => {
    const feed = createFeedStore();
    const page = createFeedPageState(feed, makeController());
    feed.setMissions([
      makeMission({
        id: 'strong-stack',
        scoreBreakdown: makeScoreBreakdown({
          criteria: {
            stack: 95,
            location: 80,
            tjm: 45,
            remote: 90,
            seniorityBonus: 0,
            startDateBonus: 0,
          },
          semantic: 88,
        }),
      }),
      makeMission({
        id: 'weak-remote',
        remote: 'onsite',
        scoreBreakdown: makeScoreBreakdown({
          criteria: {
            stack: 40,
            location: 80,
            tjm: 80,
            remote: 20,
            seniorityBonus: 0,
            startDateBonus: 0,
          },
          semantic: null,
        }),
      }),
    ]);

    expect(page.insightSummary).toEqual({
      strongStackCount: 1,
      weakTjmCount: 0,
      remoteMatchCount: 1,
      semanticAnalyzedCount: 1,
    });
  });

  it('batches visible mission seen writes into a single save', () => {
    vi.useFakeTimers();
    try {
      const feed = createFeedStore();
      const page = createFeedPageState(feed, makeController());
      const missions = Array.from({ length: 20 }, (_, index) =>
        makeMission({
          id: `mission-${index}`,
          url: `https://example.com/mission-${index}`,
        })
      );
      feed.setMissions(missions);

      for (const mission of missions) {
        page.handleMissionSeen(mission.id);
      }

      expect(feedDataMock.saveSeenIds).not.toHaveBeenCalled();

      vi.advanceTimersByTime(119);
      expect(feedDataMock.saveSeenIds).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);

      expect(page.seenIds).toHaveLength(20);
      expect(feedDataMock.saveSeenIds).toHaveBeenCalledTimes(1);
      expect(feedDataMock.saveSeenIds).toHaveBeenCalledWith(missions.map((mission) => mission.id));
    } finally {
      vi.useRealTimers();
    }
  });

  it('flags only missions below the profile TJM floor as needing negotiation', () => {
    expect(needsTjmNegotiation(makeMission({ tjm: 590 }), 600)).toBe(true);
    expect(needsTjmNegotiation(makeMission({ tjm: 600 }), 600)).toBe(false);
    expect(needsTjmNegotiation(makeMission({ tjm: 900 }), 600)).toBe(false);
    expect(needsTjmNegotiation(makeMission({ tjm: null }), 600)).toBe(false);
    expect(needsTjmNegotiation(makeMission({ tjm: 590 }), null)).toBe(false);
  });

  it('previews a filter draft count without mutating its inputs', () => {
    const missions = [
      makeMission({ id: 'priority-remote', score: 92, source: 'free-work', remote: 'full' }),
      makeMission({ id: 'priority-onsite', score: 88, source: 'free-work', remote: 'onsite' }),
      makeMission({ id: 'weak-remote', score: 55, source: 'hiway', remote: 'full' }),
    ];
    const draft: FeedFilterDraft = {
      decisionPreset: 'priority',
      selectedScoreBucket: null,
      selectedTjmMin: null,
      selectedSource: 'free-work',
      selectedRemote: 'full',
      selectedSeniority: null,
      selectedStacks: [],
    };

    expect(countMissionsForFilterDraft(missions, draft, [], 600)).toBe(1);
    expect(missions).toHaveLength(3);
    expect(draft.selectedStacks).toEqual([]);
  });

  it('keeps hidden missions in the session-triage scope so they count as qualified', () => {
    const feed = createFeedStore();
    const page = createFeedPageState(feed, makeController());
    feed.setMissions([
      makeMission({ id: 'm1', score: 90 }),
      makeMission({ id: 'm2', score: 70 }),
      makeMission({ id: 'm3', score: 50 }),
    ]);

    page.handleHide('m2');

    // The hidden mission leaves the visible list…
    expect(page.displayMissions.map((m) => m.id)).not.toContain('m2');
    // …but stays in the triage scope, which counts it as processed instead of
    // silently shrinking the denominator.
    expect(page.triageMissions.map((m) => m.id).sort()).toEqual(['m1', 'm2', 'm3']);
  });

  it('keeps hidden missions out of the triage scope when they do not match the active filter', () => {
    const feed = createFeedStore();
    const page = createFeedPageState(feed, makeController());
    feed.setMissions([
      makeMission({ id: 'react-1', score: 90, stack: ['React'] }),
      makeMission({ id: 'vue-hidden', score: 70, stack: ['Vue'] }),
      makeMission({ id: 'react-2', score: 60, stack: ['React'] }),
    ]);

    page.toggleStack('React');
    page.handleHide('vue-hidden');

    // The active stack filter drops vue-hidden from both the visible list and
    // the triage scope — an unfiltered re-admission would inflate the
    // denominator with a mission the user cannot see.
    expect(page.displayMissions.map((m) => m.id).sort()).toEqual(['react-1', 'react-2']);
    expect(page.triageMissions.map((m) => m.id).sort()).toEqual(['react-1', 'react-2']);
  });

  it('counts only explicit full or hybrid remote as remote-compatible insight', () => {
    expect(isRemoteCompatibleInsight(makeMission({ remote: 'full' }))).toBe(true);
    expect(isRemoteCompatibleInsight(makeMission({ remote: 'hybrid' }))).toBe(true);
    expect(isRemoteCompatibleInsight(makeMission({ remote: 'onsite' }))).toBe(false);
    expect(isRemoteCompatibleInsight(makeMission({ remote: null }))).toBe(false);
  });

  it('scopes dashboard new/high-score counts to the visible set when a preset is active', () => {
    const feed = createFeedStore();
    const page = createFeedPageState(feed, makeController());
    // 5 unseen missions: 2 high-score (>=80), 3 weak (<60).
    feed.setMissions([
      makeMission({ id: 'new-strong-1', score: 92 }),
      makeMission({ id: 'new-strong-2', score: 85 }),
      makeMission({ id: 'new-weak-1', score: 41 }),
      makeMission({ id: 'new-weak-2', score: 30 }),
      makeMission({ id: 'new-weak-3', score: 10 }),
    ]);

    // No filter active: counts match the full scope.
    expect(page.dashboardSummary.newCount).toBe(5);
    expect(page.dashboardSummary.highScoreCount).toBe(2);
    expect(page.dashboardSummary.visibleCount).toBe(5);

    // Activate the "Prioritaires" preset → only the 2 high-score missions remain visible.
    page.applyDecisionPreset('priority');
    expect(page.dashboardSummary.visibleCount).toBe(2);

    // FEED-01: the action queue must never advertise more than is visible.
    expect(page.dashboardSummary.newCount).toBeLessThanOrEqual(page.dashboardSummary.visibleCount);
    expect(page.dashboardSummary.highScoreCount).toBeLessThanOrEqual(
      page.dashboardSummary.visibleCount
    );
    // Visible set is exactly the 2 high-score, still-unseen missions.
    expect(page.dashboardSummary.newCount).toBe(2);
    expect(page.dashboardSummary.highScoreCount).toBe(2);
  });
  it('minimum B and C keep the A missions while the distribution remains exact', () => {
    const feed = createFeedStore();
    const page = createFeedPageState(feed, makeController());
    feed.setMissions([
      makeMission({ id: 'a', score: 80 }),
      makeMission({ id: 'b', score: 60 }),
      makeMission({ id: 'c', score: 40 }),
      makeMission({ id: 'below', score: 39 }),
    ]);
    page.setSelectedScoreBucket('good');
    expect(page.displayMissions.map((row) => row.id)).toEqual(['a', 'b']);
    page.setSelectedScoreBucket('weak');
    expect(page.displayMissions.map((row) => row.id)).toEqual(['a', 'b', 'c']);
    expect(page.scoreDistribution.map((bucket) => bucket.count)).toEqual([1, 1, 2]);
  });
  it('rejects empty names, quota overflow and persistence failure without losing saved views', async () => {
    const page = createFeedPageState(createFeedStore(), makeController());
    await expect(page.saveCurrentView('  ')).rejects.toThrow('nom');
    feedDataMock.setFeedSavedViews.mockRejectedValueOnce(new Error('quota'));
    await expect(page.saveCurrentView('Ma recherche')).rejects.toThrow('quota');
    expect(page.savedViews).toHaveLength(0);
    for (let index = 0; index < 12; index++) {
      await page.saveCurrentView(`Recherche ${index}`);
    }
    await expect(page.saveCurrentView('Treizième')).rejects.toThrow('12');
    expect(page.savedViews).toHaveLength(12);
  });
  it('saves minimum semantics and TJM, and applies legacy exact groups explicitly', async () => {
    const feed = createFeedStore();
    const page = createFeedPageState(feed, makeController());
    feed.setMissions([makeMission({ id: 'a', score: 90 }), makeMission({ id: 'b', score: 65 })]);
    page.openFilterSheet();
    page.editFilterSheet({ type: 'SET_SCORE_BUCKET', bucket: 'good' });
    page.editFilterSheet({ type: 'SET_TJM_MIN', tjmMin: 650 });
    await page.saveCurrentView('Minimum B');
    const view = page.savedViews[0];
    expect(view.filters).toMatchObject({ scoreFilterMode: 'minimum', selectedTjmMin: 650 });
    page.clearAllFilters();
    page.applySavedView(view.id);
    expect(page.visibleCount).toBe(2);
    const legacy = { ...view, filters: { ...view.filters, scoreFilterMode: undefined } };
    page.savedViews[0] = legacy;
    page.applySavedView(legacy.id);
    expect(page.displayMissions.map((row) => row.id)).toEqual(['b']);
    page.openFilterSheet();
    page.editFilterSheet({ type: 'SET_REMOTE', remote: 'hybrid' });
    expect(page.visibleCount).toBe(1);
    page.editFilterSheet({ type: 'SET_SCORE_BUCKET', bucket: 'good' });
    expect(page.visibleCount).toBe(2);
  });
  it('serializes concurrent feedback writes and preserves the canonical score', async () => {
    const feed = createFeedStore();
    const page = createFeedPageState(feed, makeController());
    feed.setMissions([makeMission({ id: 'a', score: 90 }), makeMission({ id: 'b', score: 60 })]);
    await Promise.all([page.setFeedback('a', 'off-target'), page.setFeedback('b', 'relevant')]);
    page.sortBy = 'personalized';
    expect(page.displayMissions.map((row) => row.id)).toEqual(['b', 'a']);
    expect(feed.missions.map((row) => row.score)).toEqual([90, 60]);
    await page.setFeedback('a', null);
    expect(page.feedback).toEqual({ b: 'relevant' });
    feedDataMock.saveMissionFeedback.mockRejectedValueOnce(new Error('quota'));
    await page.setFeedback('b', 'off-target');
    expect(page.feedback.b).toBe('relevant');
  });
  it('restores only the failed deleted search and keeps sibling searches', async () => {
    vi.useFakeTimers();
    try {
      const page = createFeedPageState(createFeedStore(), makeController());
      await page.saveCurrentView('Première');
      await page.saveCurrentView('Deuxième');
      const id = page.savedViews[1].id;
      page.deleteSavedView(id);
      feedDataMock.setFeedSavedViews.mockRejectedValueOnce(new Error('quota'));
      await vi.advanceTimersByTimeAsync(5000);
      expect(page.savedViews.map((view) => view.name).sort()).toEqual(['Deuxième', 'Première']);
      expect(toastMock.showToast).toHaveBeenCalledWith(
        'Suppression impossible : recherche restaurée.',
        'error'
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
