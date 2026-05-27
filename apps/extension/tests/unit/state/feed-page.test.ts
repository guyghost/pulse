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
});
