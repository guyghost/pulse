import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFeedStore } from '../../../src/lib/state/feed.svelte';
import { createFeedPageState } from '../../../src/lib/state/feed-page.svelte';
import type { Mission, MissionSource } from '../../../src/lib/core/types/mission';
import type { FeedController } from '../../../src/lib/shell/facades/feed-controller.svelte';

const feedDataMock = vi.hoisted(() => ({
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
  syncFavoriteMission: vi.fn(),
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

function makeController(enabledConnectorIds = new Set<string>()): FeedController {
  return {
    get isScanning() {
      return false;
    },
    get scanCompleted() {
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
    feedDataMock.getFeedSavedViews.mockResolvedValue([]);
    feedDataMock.setFeedSavedViews.mockResolvedValue(undefined);
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

  it('filters the feed to unseen missions from the dashboard toggle', () => {
    const feed = createFeedStore();
    const page = createFeedPageState(feed, makeController());
    feed.setMissions([
      makeMission({ id: 'seen-1', score: 88 }),
      makeMission({ id: 'new-1', score: 72 }),
      makeMission({ id: 'new-2', score: 40 }),
    ]);

    page.handleMissionSeen('seen-1');

    expect(page.dashboardSummary.newCount).toBe(2);

    page.toggleNewOnly();

    expect(page.visibleCount).toBe(2);
    expect(page.displayMissions.map((mission) => mission.id)).toEqual(['new-1', 'new-2']);
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
      weakTjmCount: 1,
      remoteMatchCount: 1,
      semanticAnalyzedCount: 1,
    });
  });
});
