/**
 * Feed Page State — Encapsulates all UI state for the FeedPage.
 *
 * Extracted from FeedPage.svelte to keep the component thin.
 * Manages: seen/favorites/hidden, sorting, filtering, search, keyboard shortcuts.
 *
 * Uses Svelte 5 runes for reactive state.
 */
import type { Mission, MissionSource, RemoteType } from '$lib/core/types/mission';
import { untrack } from 'svelte';
import { SvelteMap, SvelteSet, SvelteDate } from 'svelte/reactivity';
import type { SeniorityLevel, UserProfile } from '$lib/core/types/profile';
import type {
  FeedDecisionPresetId,
  FeedScoreBucket,
  FeedSortBy,
  FeedViewFilters,
  SavedFeedView,
} from '$lib/core/types/feed-view';
import type { FeedState } from './feed.svelte';
import type { FeedController } from '$lib/shell/facades/feed-controller.svelte';
import type { AiAvailability } from '$lib/shell/ai/capabilities';
import type { PanelSide } from '$lib/shell/ui/panel-layout';
import {
  getSeenIds,
  saveSeenIds,
  getFavorites,
  saveFavorites,
  getHidden,
  saveHidden,
  getProfile,
  resetNewMissionCount,
  clearExtensionBadge,
  getFeedSortBy,
  getFeedSavedViews,
  setFeedSortBy,
  setFeedSavedViews,
  markAsSeen,
  toggleFavorite,
  toggleHidden,
  filterHidden,
  filterFavoritesOnly,
  consumeDeepLinkIntent,
  subscribeToNotificationClicked,
} from '$lib/shell/facades/feed-data.facade';
import { getPanelSide } from '$lib/shell/ui/panel-layout';
import { isPromptApiAvailable } from '$lib/shell/ai/capabilities';
import { showToastAction } from '$lib/shell/notifications/toast-service';
import { createUndoController, type UndoController } from '$lib/shell/undo/undo-controller';
import {
  buildProfileImpactItems,
  buildProfileImpactSimulation,
  type ProfileImpactInput,
} from '$lib/core/profile/profile-impact';
import {
  registerShortcuts,
  FeedShortcuts,
  type ShortcutConfig,
} from '$lib/shell/utils/keyboard-shortcuts';
import { getConnectionStore } from '$lib/state/connection-singleton.svelte';
import { subscribeMessages } from '$lib/shell/messaging/bridge';
import { sortMissions } from '$lib/core/scoring/sort-missions';
import { rankMissions } from '$lib/core/scoring/rank-missions';
import type { DeepLinkIntent } from '$lib/core/deep-link/deep-link-intent';
import {
  selectFocusMissions,
  hasFocusMatch,
  formatFocusSince,
} from '$lib/core/deep-link/deep-link-intent';
import {
  createMissionArrivalQueueState,
  deriveFeedPresentation,
  getMissionArrivalStackView,
  isArrivalStackRenderable,
  type MissionArrivalQueueEffect,
  type MissionDwellSignal,
} from '$lib/core/feed/mission-arrival-queue';
import {
  createArrivalPreviewCacheState,
  transitionArrivalPreviewCache,
  type ArrivalPreviewCacheSource,
} from '$lib/core/feed/arrival-preview-cache';
import {
  createMissionArrivalActor,
  type MissionArrivalActorEvent,
} from '$lib/shell/arrival/mission-arrival-actor';

export type SortBy = FeedSortBy;
export type ScoreBucket = FeedScoreBucket;
export type DecisionPresetId = FeedDecisionPresetId;

export interface ScoreBucketSummary {
  bucket: ScoreBucket;
  label: string;
  count: number;
  min: number;
  max: number | null;
}

export interface FeedDashboardSummary {
  newCount: number;
  highScoreCount: number;
  favoriteCount: number;
  visibleCount: number;
}

export interface FeedInsightSummary {
  strongStackCount: number;
  weakTjmCount: number;
  remoteMatchCount: number;
  semanticAnalyzedCount: number;
}

export interface FeedDecisionPreset {
  id: DecisionPresetId;
  label: string;
  description: string;
  count: number;
  active: boolean;
}

interface FeedAggregates {
  scoreDistribution: ScoreBucketSummary[];
  decisionPresets: FeedDecisionPreset[];
  dashboardSummary: FeedDashboardSummary;
  insightSummary: FeedInsightSummary;
  sourceMissionCounts: Map<string, number>;
}

function getMissionScore(mission: Mission): number {
  return mission.scoreBreakdown?.total ?? mission.score ?? 0;
}

function getScoreBucket(score: number): ScoreBucket {
  if (score >= 80) {
    return 'strong';
  }
  if (score >= 60) {
    return 'good';
  }
  return 'weak';
}

const SCORE_BUCKETS: Array<Omit<ScoreBucketSummary, 'count'>> = [
  { bucket: 'strong', label: 'Prioritaires', min: 80, max: null },
  { bucket: 'good', label: 'À comparer', min: 60, max: 79 },
  { bucket: 'weak', label: 'À qualifier', min: 0, max: 59 },
];

const MAX_SAVED_VIEWS = 12;
const SEEN_FLUSH_MS = 120;

function toProfileImpactInput(profile: UserProfile | null): ProfileImpactInput {
  return {
    firstName: typeof profile?.firstName === 'string' ? profile.firstName : '',
    jobTitle: typeof profile?.jobTitle === 'string' ? profile.jobTitle : '',
    location: typeof profile?.location === 'string' ? profile.location : '',
    remote: profile?.remote ?? 'any',
    tjmMin: typeof profile?.tjmMin === 'number' ? profile.tjmMin : 0,
    tjmMax: typeof profile?.tjmMax === 'number' ? profile.tjmMax : 0,
    keywords: Array.isArray(profile?.keywords) ? profile.keywords : [],
  };
}

export function needsTjmNegotiation(mission: Pick<Mission, 'tjm'>, profileTjmMin: number | null) {
  return (
    profileTjmMin !== null &&
    profileTjmMin > 0 &&
    mission.tjm !== null &&
    mission.tjm < profileTjmMin
  );
}

export function isRemoteCompatibleInsight(mission: Pick<Mission, 'remote'>): boolean {
  return mission.remote === 'full' || mission.remote === 'hybrid';
}

function matchesDecisionPreset(
  mission: Mission,
  preset: DecisionPresetId,
  seenSet: Set<string>,
  profileTjmMin: number | null
): boolean {
  if (preset === 'priority') {
    return getMissionScore(mission) >= 80;
  }
  if (preset === 'remote-compatible') {
    return isRemoteCompatibleInsight(mission);
  }
  if (preset === 'tjm-negotiation') {
    return needsTjmNegotiation(mission, profileTjmMin);
  }
  return !seenSet.has(mission.id);
}

/**
 * Feed Page State — factory function returning a reactive state object.
 *
 * Exposes `$state` fields directly on the returned object so that
 * Svelte `bind:` directives work (they need a settable property).
 */
export function createFeedPageState(
  feedStore: {
    get state(): FeedState;
    get missions(): Mission[];
    get filteredMissions(): Mission[];
    get searchQuery(): string;
    get error(): string | null;
    load(): void;
    setMissions(missions: Mission[]): void;
    setError(msg: string): void;
    search(query: string): void;
    clearSearch(): void;
  },
  controller: FeedController
) {
  // ============================================================
  // Mutable $state fields — accessible directly for bind:
  // ============================================================
  let sortBy = $state<SortBy>('score');

  // Restore persisted sortBy via facade
  getFeedSortBy().then((stored) => {
    sortBy = stored;
  });
  let showFavoritesOnly = $state(false);
  let showHidden = $state(false);
  let showFilters = $state(false);
  let selectedStacks = $state<string[]>([]);
  let selectedSource = $state<MissionSource | null>(null);
  let selectedRemote = $state<RemoteType | null>(null);
  let selectedSeniority = $state<SeniorityLevel | null>(null);
  let selectedScoreBucket = $state<ScoreBucket | null>(null);
  let decisionPreset = $state<DecisionPresetId | null>(null);
  let showNewOnly = $state(false);
  let firstName = $state('');
  let profile = $state<UserProfile | null>(null);
  let profileLoaded = $state(false);
  let profileTjmMin = $state<number | null>(null);
  let panelSide = $state<PanelSide>('right');
  let aiStatus = $state<AiAvailability>('no');
  let showShortcutsHelp = $state(false);
  let comparisonMissionIds = $state<string[]>([]);
  let savedViews = $state<SavedFeedView[]>([]);
  let activeSavedViewId = $state<string | null>(null);
  const connection = getConnectionStore();
  let searchInputRef = $state<HTMLInputElement | null>(null);

  // Internal state (not directly bound)
  let seenIds = $state<string[]>([]);
  let favorites = $state<Record<string, number>>({});
  let hidden = $state<Record<string, number>>({});
  let pendingSeenIds = new SvelteSet<string>();
  let seenFlushTimer: ReturnType<typeof setTimeout> | null = null;
  let arrivalQueueState = $state(createMissionArrivalQueueState());
  let arrivalObservedEffects: MissionArrivalQueueEffect[] = [];
  const arrivalActor = createMissionArrivalActor({
    readFeed: () => feedStore.missions,
    replaceFeedSync: (nextMissions) => feedStore.setMissions([...nextMissions]),
    loadProjection: (orderedIds) => controller.loadArrivalProjection(orderedIds),
    persistSeen: async (missionId) => {
      const nextSeenIds = markAsSeen(Array.from(seenIds), [missionId]);
      await saveSeenIds(nextSeenIds);
      seenIds = nextSeenIds;
    },
    onStateChanged: (nextState) => {
      arrivalQueueState = nextState;
    },
    onEffect: (effect) => {
      arrivalObservedEffects = [...arrivalObservedEffects, effect];
    },
  });
  let arrivalPreviewCacheState = $state.raw(
    createArrivalPreviewCacheState(controller.pendingMissions)
  );
  const arrivalPreviewCatalog = $derived(arrivalPreviewCacheState.byId);

  // ============================================================
  // Focus lens — driven by the notification deep-link intent.
  // See src/models/notification-deep-link.model.md (Focus machine).
  // focusMode is the ONLY driver of displayMissions override; the LLM never
  // decides a transition here — the intent is consumed atomically once on
  // mount and dismissed explicitly by the user (or implicitly on empty).
  // ============================================================
  let focusMode = $state<'idle' | 'focused' | 'dismissed'>('idle');
  let focusIntent = $state<DeepLinkIntent | null>(null);

  // Cleanup functions
  let cleanupFns: Array<() => void> = [];

  // Undo windows (soft-delete). Persistence is deferred to commit only.
  // See src/models/undo-window.model.md for the authoritative state model.
  const hideUndo: UndoController<Record<string, number>> = createUndoController({
    kind: 'hide',
    onCommit: (_id, _snapshot, { stillPending }) => {
      // Persist every hidden mission EXCEPT those whose undo window is still open —
      // committing must not finalize a sibling hide the user can still undo.
      const pendingIds = new SvelteSet(stillPending.map((p) => p.targetId));
      const persist: Record<string, number> = {};
      for (const [hid, ts] of Object.entries(hidden)) {
        if (!pendingIds.has(hid)) {
          persist[hid] = ts;
        }
      }
      saveHidden(persist).catch(() => {});
    },
    onRestore: (id, snapshot) => {
      // Restore ONLY the target entry. Rolling back the whole snapshot would
      // clobber a sibling hide whose undo window is still open (the snapshot was
      // captured before that sibling was hidden). Merge: set the target's
      // presence to its pre-action state, leave every other entry untouched.
      const next = { ...hidden };
      if (id in snapshot) {
        next[id] = snapshot[id];
      } else {
        delete next[id];
      }
      hidden = next;
    },
    toastMessage: (id, snapshot) => (id in snapshot ? 'Mission restaurée' : 'Mission masquée'),
  });

  const viewDeleteUndo: UndoController<{
    views: SavedFeedView[];
    activeId: string | null;
    name: string;
  }> = createUndoController({
    kind: 'delete-view',
    onCommit: (_id, _snapshot, { stillPending }) => {
      // Re-include any view whose undo window is still open — its in-memory
      // deletion must not be finalized by a sibling view's commit.
      const restoreViews = stillPending.flatMap((p) =>
        p.snapshot.views.filter((v) => v.id === p.targetId)
      );
      setFeedSavedViews([...savedViews, ...restoreViews]).catch(() => {});
    },
    onRestore: (_id, snapshot) => {
      savedViews = snapshot.views;
      activeSavedViewId = snapshot.activeId;
    },
    toastMessage: (_id, snapshot) => `Vue « ${snapshot.name} » supprimée`,
  });

  // ============================================================
  // Derived — from feed store
  // ============================================================
  const missions = $derived(feedStore.filteredMissions);
  // Raw (unfiltered) missions for the focus lens: the deep-link intent points
  // at specific mission IDs that must be selectable even when a search query
  // or source filter is active, otherwise STALE_GUARD would auto-dismiss the
  // lens for missions that are merely filtered out of view.
  const allMissions = $derived(feedStore.missions);
  const isLoading = $derived(feedStore.state === 'loading');
  const error = $derived(feedStore.error);
  const searchQuery = $derived(feedStore.searchQuery);
  const totalMissions = $derived(missions.length);

  // ============================================================
  // Derived — UI computations
  // ============================================================
  const seenSet = $derived(new SvelteSet(Array.isArray(seenIds) ? Array.from(seenIds) : []));

  const favoriteCount = $derived(Object.keys(favorites).length);
  const hiddenCount = $derived(Object.keys(hidden).length);
  const isOffline = $derived(connection.status === 'offline');
  const heroCompact = $derived(totalMissions > 0);
  const profileImpactItems = $derived(buildProfileImpactItems(toProfileImpactInput(profile)));
  const profileImpactSimulation = $derived(buildProfileImpactSimulation(profileImpactItems));
  const missingProfileItems = $derived(
    profileImpactItems.filter((item) => !item.complete).map((item) => item.label)
  );
  const profileNeedsCompletion = $derived(missingProfileItems.length > 0);

  const filterActive = $derived(
    selectedSource !== null ||
      selectedRemote !== null ||
      selectedStacks.length > 0 ||
      selectedSeniority !== null ||
      selectedScoreBucket !== null ||
      decisionPreset !== null ||
      showNewOnly
  );

  const availableStacks = $derived.by(() => {
    const counts = new SvelteMap<string, number>();
    for (const m of missions) {
      for (const s of m.stack) {
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  });

  // Shared base filter (enabled connectors + favorites + hidden) reused by both
  // sourceCountBaseMissions and dashboardScopeMissions so this prefix runs once.
  // Output-equivalent to the previous inline prefix in both deriveds.
  const baseFilteredMissions = $derived.by(() => {
    let result = missions ?? [];
    if (controller.enabledConnectorIds.size > 0) {
      result = result.filter((m) => controller.enabledConnectorIds.has(m.source));
    }
    if (showFavoritesOnly) {
      result = filterFavoritesOnly(result, favorites);
    }
    if (!showHidden) {
      result = filterHidden(result, hidden);
    }
    return result;
  });

  const decisionFilteredMissions = $derived.by(() => {
    let result = baseFilteredMissions;

    if (selectedRemote !== null || selectedStacks.length > 0 || selectedSeniority !== null) {
      const stacksSet = selectedStacks.length > 0 ? new SvelteSet(selectedStacks) : null;
      result = result.filter((m) => {
        if (selectedRemote !== null && m.remote !== selectedRemote) {
          return false;
        }
        if (selectedSeniority !== null && m.seniority !== selectedSeniority) {
          return false;
        }
        if (stacksSet && !m.stack.some((s) => stacksSet.has(s))) {
          return false;
        }
        return true;
      });
    }
    if (selectedScoreBucket !== null) {
      result = result.filter((m) => getScoreBucket(getMissionScore(m)) === selectedScoreBucket);
    }
    if (decisionPreset !== null && decisionPreset !== 'new') {
      const activePreset = decisionPreset;
      result = result.filter((m) => matchesDecisionPreset(m, activePreset, seenSet, profileTjmMin));
    }

    return result;
  });

  const newQueueRequested = $derived(showNewOnly || decisionPreset === 'new');
  const stableQueueActive = $derived(arrivalQueueState.queue.value === 'stable-queue');
  const stableQueueIds = $derived(
    arrivalQueueState.queue.value === 'stable-queue'
      ? new SvelteSet(arrivalQueueState.queue.queueIds)
      : null
  );

  function sortCurrentMissions(input: Mission[]): Mission[] {
    return sortBy === 'score' ? rankMissions(input, new SvelteDate()) : sortMissions(input, sortBy);
  }

  const newQueueCandidateMissions = $derived.by(() => {
    const scoped =
      selectedSource === null
        ? decisionFilteredMissions
        : decisionFilteredMissions.filter((mission) => mission.source === selectedSource);
    return sortCurrentMissions(scoped.filter((mission) => !seenSet.has(mission.id)));
  });

  const sourceCountBaseMissions = $derived.by(() => {
    if (!newQueueRequested) {
      return decisionFilteredMissions;
    }

    if (stableQueueIds) {
      return decisionFilteredMissions.filter((mission) => stableQueueIds.has(mission.id));
    }

    return decisionFilteredMissions.filter((mission) => !seenSet.has(mission.id));
  });

  const dashboardScopeMissions = $derived.by(() => {
    let result = baseFilteredMissions;
    if (selectedSource !== null) {
      result = result.filter((m) => m.source === selectedSource);
    }
    if (selectedRemote !== null || selectedStacks.length > 0 || selectedSeniority !== null) {
      const stacksSet = selectedStacks.length > 0 ? new SvelteSet(selectedStacks) : null;
      result = result.filter((m) => {
        if (selectedRemote !== null && m.remote !== selectedRemote) {
          return false;
        }
        if (selectedSeniority !== null && m.seniority !== selectedSeniority) {
          return false;
        }
        if (stacksSet && !m.stack.some((s) => stacksSet.has(s))) {
          return false;
        }
        return true;
      });
    }
    return result;
  });

  const feedAggregates = $derived.by<FeedAggregates>(() => {
    const counts = new SvelteMap<ScoreBucket, number>(
      SCORE_BUCKETS.map((bucket) => [bucket.bucket, 0] as const)
    );
    const sourceMissionCounts = new SvelteMap<string, number>();
    let highScoreCount = 0;
    let newCount = 0;
    let priorityPresetCount = 0;
    let remoteCompatiblePresetCount = 0;
    let tjmNegotiationPresetCount = 0;
    let newPresetCount = 0;
    let strongStackCount = 0;
    let weakTjmCount = 0;
    let remoteMatchCount = 0;
    let semanticAnalyzedCount = 0;

    for (const mission of sourceCountBaseMissions) {
      sourceMissionCounts.set(mission.source, (sourceMissionCounts.get(mission.source) ?? 0) + 1);
    }

    // Facets (score distribution, preset chip counts, insights) are computed
    // over the broad dashboard scope so users always see how many missions
    // sit in each bucket/preset regardless of the active filter.
    for (const mission of dashboardScopeMissions) {
      const score = getMissionScore(mission);
      const bucket = getScoreBucket(score);
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);

      if (score >= 80) {
        priorityPresetCount += 1;
      }
      if (!seenSet.has(mission.id)) {
        newPresetCount += 1;
      }
      if (isRemoteCompatibleInsight(mission)) {
        remoteCompatiblePresetCount += 1;
        remoteMatchCount += 1;
      }
      if (needsTjmNegotiation(mission, profileTjmMin)) {
        tjmNegotiationPresetCount += 1;
        weakTjmCount += 1;
      }
      if ((mission.scoreBreakdown?.criteria.stack ?? 0) >= 80) {
        strongStackCount += 1;
      }
      if (
        mission.scoreBreakdown
          ? mission.scoreBreakdown.semantic !== null
          : mission.semanticScore !== null
      ) {
        semanticAnalyzedCount += 1;
      }
    }

    // Action-queue counts are scoped to the FILTERED/visible set so the
    // dashboard never advertises more new/high-score missions than are
    // actually visible (respects score bucket, decision preset, new-only and
    // source filters). displayMissions is the same set visibleCount derives from.
    for (const mission of displayMissions) {
      if (getMissionScore(mission) >= 80) {
        highScoreCount += 1;
      }
      if (!seenSet.has(mission.id)) {
        newCount += 1;
      }
    }

    return {
      scoreDistribution: SCORE_BUCKETS.map((bucket) => ({
        ...bucket,
        count: counts.get(bucket.bucket) ?? 0,
      })),
      decisionPresets: [
        {
          id: 'priority',
          label: 'Prioritaires',
          description: 'Score 80+',
          count: priorityPresetCount,
          active: decisionPreset === 'priority',
        },
        {
          id: 'remote-compatible',
          label: 'Remote compatible',
          description: 'Full remote ou hybride',
          count: remoteCompatiblePresetCount,
          active: decisionPreset === 'remote-compatible',
        },
        {
          id: 'tjm-negotiation',
          label: 'TJM à négocier',
          description: 'Sous le TJM cible',
          count: tjmNegotiationPresetCount,
          active: decisionPreset === 'tjm-negotiation',
        },
        {
          id: 'new',
          label: 'Nouvelles seulement',
          description: 'Jamais vues',
          count: newPresetCount,
          active: decisionPreset === 'new',
        },
      ],
      dashboardSummary: {
        newCount,
        highScoreCount,
        favoriteCount,
        visibleCount,
      },
      insightSummary: {
        strongStackCount,
        weakTjmCount,
        remoteMatchCount,
        semanticAnalyzedCount,
      },
      sourceMissionCounts,
    };
  });

  const scoreDistribution = $derived(feedAggregates.scoreDistribution);
  const decisionPresets = $derived.by(() => feedAggregates.decisionPresets);
  const dashboardSummary = $derived(feedAggregates.dashboardSummary);
  const insightSummary = $derived(feedAggregates.insightSummary);

  const canSaveCurrentView = $derived(
    filterActive ||
      searchQuery.trim().length > 0 ||
      sortBy !== 'score' ||
      showFavoritesOnly ||
      showHidden
  );

  const savedViewLimitReached = $derived(savedViews.length >= MAX_SAVED_VIEWS);

  const sourceMissionCounts = $derived(feedAggregates.sourceMissionCounts);

  const displayMissions = $derived.by(() => {
    // Focus lens (F1, F2): when focused, the feed shows ONLY the missions from
    // the consumed deep-link intent, regardless of seen/new/source filters.
    // Focus is an explicit id allow-list applied last, so seen-marking (which
    // powers the badge) doesn't defeat it. Empty match = no override (F-empty).
    if (focusMode === 'focused' && focusIntent) {
      const focused = selectFocusMissions(allMissions, focusIntent);
      if (focused.length > 0) {
        return sortBy === 'score'
          ? rankMissions(focused, new SvelteDate())
          : sortMissions(focused, sortBy);
      }
    }

    const scopedMissions =
      selectedSource === null
        ? sourceCountBaseMissions
        : sourceCountBaseMissions.filter((m) => m.source === selectedSource);

    // 'score' sort uses the composite ranking (relevance + freshness + source
    // diversity) instead of a plain single-key sort. Users can switch to 'date'
    // or 'tjm' for an explicit single-key sort.
    return sortCurrentMissions(scopedMissions);
  });

  const feedPresentation = $derived(
    deriveFeedPresentation({
      feedState: feedStore.state,
      ownedScan: controller.ownedScan,
      networkOnline: connection.status !== 'offline',
    })
  );
  const arrivalStackView = $derived(getMissionArrivalStackView(arrivalQueueState));
  const arrivalPreviewMissions = $derived.by(() => {
    const missionCatalog = new SvelteMap(
      [...allMissions, ...controller.pendingMissions, ...Object.values(arrivalPreviewCatalog)].map(
        (mission) => [mission.id, mission] as const
      )
    );
    return arrivalStackView.previewIds
      .map((id) => missionCatalog.get(id))
      .filter((mission): mission is Mission => mission !== undefined);
  });
  const arrivalStackVisible = $derived(
    isArrivalStackRenderable({ ...arrivalQueueState, presentation: feedPresentation })
  );

  // Focus-lens derived views for the banner UI.
  const focusMissions = $derived(
    focusMode === 'focused' && focusIntent ? selectFocusMissions(allMissions, focusIntent) : []
  );
  const focusSinceLabel = $derived(
    focusIntent ? formatFocusSince(focusIntent.triggeredAt, Date.now()) : ''
  );

  const comparisonMissions = $derived.by(() => {
    if (comparisonMissionIds.length < 2) {
      return [];
    }
    const idSet = new SvelteSet(comparisonMissionIds);
    return (missions ?? []).filter((m) => idSet.has(m.id));
  });

  const visibleCount = $derived(displayMissions.length);
  const missionListResetKey = $derived(
    [
      searchQuery.trim(),
      sortBy,
      selectedSource ?? '',
      selectedRemote ?? '',
      selectedSeniority ?? '',
      selectedScoreBucket ?? '',
      decisionPreset ?? '',
      showNewOnly ? 'new' : 'all',
      showFavoritesOnly ? 'favorites' : 'all-missions',
      showHidden ? 'hidden' : 'visible',
      selectedStacks.join('|'),
    ].join('::')
  );

  // ============================================================
  // Event handlers
  // ============================================================

  function dispatchArrival(event: MissionArrivalActorEvent): void {
    arrivalActor.dispatch(event);
  }

  function enterStableNewQueue(): void {
    dispatchArrival({
      type: 'ENTER_NEW_QUEUE',
      orderedUnseenIds: newQueueCandidateMissions.map((mission) => mission.id),
    });
  }

  function exitStableNewQueue(): void {
    dispatchArrival({ type: 'EXIT_NEW_QUEUE' });
  }

  function handleMissionReadSignal(missionId: string, signal: MissionDwellSignal): void {
    if (signal.type === 'started') {
      dispatchArrival({ type: 'DWELL_STARTED', missionId, now: signal.at });
      return;
    }
    if (signal.type === 'cancelled') {
      dispatchArrival({ type: 'DWELL_CANCELLED', missionId });
      return;
    }
    dispatchArrival({ type: 'DWELL_ELAPSED', missionId, now: signal.at });
  }

  function rememberArrivalPreviews(
    pendingMissions: readonly Mission[],
    source: ArrivalPreviewCacheSource
  ): void {
    arrivalPreviewCacheState = transitionArrivalPreviewCache(arrivalPreviewCacheState, {
      type: 'PREVIEW_OBJECTS_OBSERVED',
      source,
      missions: pendingMissions,
    });
  }

  function receiveAlarmMissions(alarmMissions: readonly Mission[]): void {
    rememberArrivalPreviews(alarmMissions, 'alarm-ingress');
    arrivalActor.publishAlarm(alarmMissions);
  }

  function openArrivalStack(): void {
    rememberArrivalPreviews(controller.pendingMissions, 'facade-pending-snapshot');
    dispatchArrival({ type: 'OPEN_STACK' });
  }

  function closeArrivalStack(): void {
    dispatchArrival({ type: 'CLOSE_STACK' });
  }

  async function refreshArrivals(): Promise<MissionArrivalQueueEffect[]> {
    const effectOffset = arrivalObservedEffects.length;
    dispatchArrival(
      arrivalQueueState.stack.value === 'projection-error'
        ? { type: 'RETRY_REQUESTED' }
        : { type: 'APPLY_REQUESTED' }
    );
    await arrivalActor.whenIdle();
    const effects = arrivalObservedEffects.slice(effectOffset);
    arrivalPreviewCacheState = transitionArrivalPreviewCache(arrivalPreviewCacheState, {
      type: 'APPLY_CYCLE_SETTLED',
      hasRemainingPreviewMembership: getMissionArrivalStackView(arrivalQueueState).count > 0,
    });
    return effects;
  }

  async function bootstrapArrivalActor(): Promise<void> {
    rememberArrivalPreviews(controller.pendingMissions, 'facade-pending-snapshot');
    arrivalActor.synchronizePresentation({
      feedState: feedStore.state,
      ownedScan: controller.ownedScan,
      networkOnline: connection.status !== 'offline',
    });
    arrivalActor.synchronizeScope(
      new SvelteSet([...controller.enabledConnectorIds] as MissionSource[])
    );
    await arrivalActor.whenIdle();
  }

  function flushSeenIds(): void {
    if (pendingSeenIds.size === 0) {
      return;
    }

    const nextSeenIds = markAsSeen(Array.from(seenIds), [...pendingSeenIds]);
    pendingSeenIds = new SvelteSet();
    seenIds = nextSeenIds;
    saveSeenIds(nextSeenIds).catch(() => {});
  }

  function scheduleSeenFlush(): void {
    if (seenFlushTimer) {
      return;
    }

    seenFlushTimer = setTimeout(() => {
      seenFlushTimer = null;
      flushSeenIds();
    }, SEEN_FLUSH_MS);
  }

  function handleMissionSeen(missionId: string): void {
    if (seenSet.has(missionId) || pendingSeenIds.has(missionId)) {
      return;
    }

    pendingSeenIds = new SvelteSet(pendingSeenIds).add(missionId);
    scheduleSeenFlush();
  }

  function handleToggleFavorite(id: string): void {
    const previous = { ...favorites };
    const wasFavorite = id in favorites;
    const updated = toggleFavorite(favorites, id, Date.now());
    favorites = updated;
    saveFavorites(favorites).catch(() => {});
    showToastAction(wasFavorite ? 'Favori retiré' : 'Mission ajoutée aux favoris', 'success', {
      label: 'Annuler',
      onClick: () => {
        favorites = previous;
        saveFavorites(previous).catch(() => {});
      },
    });
  }

  function handleHide(id: string): void {
    // Soft-delete: apply in-memory now, defer persistence to the undo-window commit.
    const previous = { ...hidden };
    hidden = toggleHidden(hidden, id, Date.now());
    hideUndo.request(id, previous);
  }

  function handleCopyLink(_id: string): void {
    // Copy handled in MissionCard, callback for future analytics
  }

  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const SEARCH_DEBOUNCE_MS = 300;

  function handleSearch(query: string): void {
    activeSavedViewId = null;
    // Clear immediately when emptying
    if (!query) {
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
      }
      searchDebounceTimer = null;
      feedStore.clearSearch();
      return;
    }
    // Debounce non-empty queries
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }
    searchDebounceTimer = setTimeout(() => {
      feedStore.search(query);
      searchDebounceTimer = null;
    }, SEARCH_DEBOUNCE_MS);
  }

  function toggleFavoritesFilter(): void {
    activeSavedViewId = null;
    showFavoritesOnly = !showFavoritesOnly;
  }

  function toggleHiddenFilter(): void {
    activeSavedViewId = null;
    showHidden = !showHidden;
  }

  function toggleStack(stack: string): void {
    activeSavedViewId = null;
    if (selectedStacks.includes(stack)) {
      selectedStacks = selectedStacks.filter((s) => s !== stack);
    } else {
      selectedStacks = [...selectedStacks, stack];
    }
  }

  function setSelectedSource(source: MissionSource | null): void {
    activeSavedViewId = null;
    selectedSource = source;
  }

  function setSelectedRemote(remote: RemoteType | null): void {
    activeSavedViewId = null;
    selectedRemote = remote;
  }

  function setSelectedSeniority(seniority: SeniorityLevel | null): void {
    activeSavedViewId = null;
    selectedSeniority = seniority;
  }

  function setSelectedScoreBucket(bucket: ScoreBucket | null): void {
    activeSavedViewId = null;
    selectedScoreBucket = bucket;
  }

  function applyDecisionPreset(preset: DecisionPresetId): void {
    activeSavedViewId = null;
    decisionPreset = decisionPreset === preset ? null : preset;

    if (preset === 'priority') {
      selectedScoreBucket = null;
    }
    if (preset === 'remote-compatible') {
      selectedRemote = null;
    }
    if (preset === 'new') {
      showNewOnly = false;
    }

    if (decisionPreset === 'new' || showNewOnly) {
      enterStableNewQueue();
    } else {
      exitStableNewQueue();
    }
  }

  function toggleNewOnly(): void {
    activeSavedViewId = null;
    showNewOnly = !showNewOnly;
    if (showNewOnly && decisionPreset === 'new') {
      decisionPreset = null;
    }
    if (showNewOnly || decisionPreset === 'new') {
      enterStableNewQueue();
    } else {
      exitStableNewQueue();
    }
  }

  function clearAllFilters(): void {
    activeSavedViewId = null;
    selectedStacks = [];
    selectedSource = null;
    selectedRemote = null;
    selectedSeniority = null;
    selectedScoreBucket = null;
    decisionPreset = null;
    showNewOnly = false;
    exitStableNewQueue();
  }

  function currentFilters(): FeedViewFilters {
    return {
      searchQuery,
      selectedStacks: [...selectedStacks],
      selectedSource,
      selectedRemote,
      selectedSeniority,
      selectedScoreBucket,
      decisionPreset,
      showNewOnly,
      showFavoritesOnly,
      showHidden,
      sortBy,
    };
  }

  function defaultSavedViewName(filters: FeedViewFilters): string {
    if (filters.selectedScoreBucket === 'strong') {
      return 'Prioritaires';
    }
    if (filters.decisionPreset === 'priority') {
      return 'Prioritaires';
    }
    if (filters.decisionPreset === 'remote-compatible') {
      return 'Remote compatible';
    }
    if (filters.decisionPreset === 'tjm-negotiation') {
      return 'TJM à négocier';
    }
    if (filters.decisionPreset === 'new') {
      return 'Nouvelles missions';
    }
    if (filters.showNewOnly) {
      return 'Nouvelles missions';
    }
    if (filters.showFavoritesOnly) {
      return 'Favoris';
    }
    if (filters.selectedRemote === 'full') {
      return 'Full remote';
    }
    if (filters.selectedStacks.length > 0) {
      return filters.selectedStacks.slice(0, 2).join(' + ');
    }
    return 'Vue personnalisée';
  }

  function normalizeSavedViewName(name: string, filters: FeedViewFilters): string {
    const trimmed = name.trim();
    return (trimmed || defaultSavedViewName(filters)).slice(0, 48);
  }

  async function persistSavedViews(nextViews: SavedFeedView[]): Promise<void> {
    savedViews = nextViews;
    await setFeedSavedViews(nextViews);
  }

  async function saveCurrentView(name = ''): Promise<void> {
    const filters = currentFilters();
    const now = Date.now();
    const view: SavedFeedView = {
      id: `feed-view-${now}`,
      name: normalizeSavedViewName(name, filters),
      filters,
      createdAt: now,
      updatedAt: now,
    };
    const nextViews = [view, ...savedViews].slice(0, MAX_SAVED_VIEWS);
    await persistSavedViews(nextViews);
    activeSavedViewId = view.id;
    if (showNewOnly || decisionPreset === 'new') {
      enterStableNewQueue();
    } else {
      exitStableNewQueue();
    }
  }

  function applySavedView(viewId: string): void {
    const view = savedViews.find((item) => item.id === viewId);
    if (!view) {
      return;
    }

    const filters = view.filters;
    selectedStacks = [...filters.selectedStacks];
    selectedSource = filters.selectedSource;
    selectedRemote = filters.selectedRemote;
    selectedSeniority = filters.selectedSeniority;
    selectedScoreBucket = filters.selectedScoreBucket;
    decisionPreset = filters.decisionPreset ?? null;
    showNewOnly = filters.showNewOnly;
    showFavoritesOnly = filters.showFavoritesOnly;
    showHidden = filters.showHidden;
    sortBy = filters.sortBy;
    setFeedSortBy(filters.sortBy).catch(() => {});
    if (filters.searchQuery.trim()) {
      feedStore.search(filters.searchQuery);
    } else {
      feedStore.clearSearch();
    }
    activeSavedViewId = view.id;
  }

  function deleteSavedView(viewId: string): void {
    const deletedView = savedViews.find((item) => item.id === viewId);
    if (!deletedView) {
      return;
    }

    const previousViews = [...savedViews];
    const previousActiveSavedViewId = activeSavedViewId;
    const nextViews = savedViews.filter((item) => item.id !== viewId);
    // Soft-delete: apply in-memory now, defer persistence to the undo-window commit.
    savedViews = nextViews;
    if (activeSavedViewId === viewId) {
      activeSavedViewId = null;
    }
    viewDeleteUndo.request(viewId, {
      views: previousViews,
      activeId: previousActiveSavedViewId,
      name: deletedView.name,
    });
  }

  function toggleCompare(missionId: string): void {
    if (comparisonMissionIds.includes(missionId)) {
      comparisonMissionIds = comparisonMissionIds.filter((id) => id !== missionId);
    } else if (comparisonMissionIds.length < 3) {
      comparisonMissionIds = [...comparisonMissionIds, missionId];
    }
  }

  function clearComparison(): void {
    comparisonMissionIds = [];
  }

  // ============================================================
  // Focus lens — notification deep-link (see Focus machine in model).
  // applyFocusIntent enters 'focused' optimistically. The empty-match guard
  // (F3: empty match = noop) is deferred to the effect in setup(), which runs
  // once missions have loaded reactively — this avoids a race where the intent
  // is consumed before the async mission load completes.
  // dismissFocus: user-initiated exit → 'dismissed'. The intent is already
  // consumed atomically at the SW level, so we only clear local state.
  // ============================================================
  function applyFocusIntent(intent: DeepLinkIntent): void {
    focusIntent = intent;
    focusMode = 'focused';
  }

  function dismissFocus(): void {
    focusMode = 'dismissed';
    focusIntent = null;
  }

  // ============================================================
  // Setup — run effects on first call
  // ============================================================

  function setup(): void {
    // Consume the deep-link focus intent once on mount (single-consume, I1).
    // The SW atomically reads+clears session storage, so only this first panel
    // open lands on the notified missions. A failure to consume is non-fatal:
    // the panel simply opens on the normal feed.
    $effect(() => {
      consumeDeepLinkIntent()
        .then((intent) => {
          if (intent) {
            applyFocusIntent(intent);
          }
        })
        .catch(() => {});
    });

    // Thread A: when a notification is clicked while the panel is already open,
    // chrome.sidePanel.open() is a no-op so the mount effect above does not
    // re-fire. The SW broadcasts NOTIFICATION_CLICKED so we re-consume here.
    // Safe with the session-storage mutex: if the mount effect already consumed
    // the intent, this consume returns null and is a no-op.
    $effect(() => {
      const unsubscribe = subscribeToNotificationClicked(() => {
        consumeDeepLinkIntent()
          .then((intent) => {
            if (intent) {
              applyFocusIntent(intent);
            }
          })
          .catch(() => {});
      });
      return unsubscribe;
    });

    // F3 (empty match = noop): once missions are loaded, if none match the
    // focus intent, auto-exit focus. Deferred so the intent survives the async
    // mission load that races with consumeDeepLinkIntent on mount.
    $effect(() => {
      if (
        focusMode === 'focused' &&
        focusIntent &&
        allMissions.length > 0 &&
        !hasFocusMatch(allMissions, focusIntent)
      ) {
        focusMode = 'idle';
        focusIntent = null;
      }
    });

    // Load seen IDs
    $effect(() => {
      getSeenIds()
        .then((ids) => {
          seenIds = ids;
        })
        .catch(() => {});
    });

    $effect(() => {
      const pendingMissions = controller.pendingMissions;
      untrack(() => {
        rememberArrivalPreviews(pendingMissions, 'facade-pending-snapshot');
      });
    });

    $effect(() => {
      const facts = {
        feedState: feedStore.state,
        ownedScan: controller.ownedScan,
        networkOnline: connection.status !== 'offline',
      };
      untrack(() => {
        arrivalActor.synchronizePresentation(facts);
      });
    });

    $effect(() => {
      const enabledSources = new SvelteSet([...controller.enabledConnectorIds] as MissionSource[]);
      const orderedIds = feedStore.missions.map((mission) => mission.id);
      untrack(() => {
        void orderedIds;
        arrivalActor.synchronizeScope(enabledSources);
      });
    });

    $effect(() => {
      if (newQueueRequested && !stableQueueActive) {
        enterStableNewQueue();
      } else if (!newQueueRequested && stableQueueActive) {
        exitStableNewQueue();
      }
    });

    // Load favorites & hidden
    $effect(() => {
      getFavorites()
        .then((f) => {
          favorites = f;
        })
        .catch(() => {});
      getHidden()
        .then((h) => {
          hidden = h;
        })
        .catch(() => {});
    });

    // Load saved views
    $effect(() => {
      getFeedSavedViews()
        .then((views) => {
          savedViews = views;
        })
        .catch(() => {});
    });

    function applyProfile(nextProfile: UserProfile | null): void {
      const impactInput = toProfileImpactInput(nextProfile);
      firstName = impactInput.firstName;
      profileTjmMin = impactInput.tjmMin > 0 ? impactInput.tjmMin : null;
      profile = nextProfile;
      profileLoaded = true;
    }

    // Load profile-derived UI hints
    $effect(() => {
      getProfile()
        .then((p) => {
          applyProfile(p);
        })
        .catch(() => {
          applyProfile(null);
        });
    });

    // Load panel side
    $effect(() => {
      getPanelSide().then((side) => {
        panelSide = side;
      });
    });

    // Load AI status
    $effect(() => {
      isPromptApiAvailable()
        .then((status) => {
          aiStatus = status;
        })
        .catch(() => {});
    });

    // Reset badge on mount
    $effect(() => {
      clearExtensionBadge().catch(() => {});
      resetNewMissionCount().catch(() => {});
    });

    // Keyboard shortcuts
    $effect(() => {
      const shortcuts: Array<{ config: ShortcutConfig; handler: () => void }> = [
        {
          config: FeedShortcuts.REFRESH,
          handler: () => {
            const presentation = deriveFeedPresentation({
              feedState: feedStore.state,
              ownedScan: controller.ownedScan,
              networkOnline: connection.status !== 'offline',
            });
            if (!presentation.actionEnabled) {
              return;
            }
            if (presentation.primaryAction === 'cancel') {
              void controller.stopScan();
            } else if (
              presentation.primaryAction === 'start' ||
              presentation.primaryAction === 'retry'
            ) {
              void controller.startScan();
            }
          },
        },
        {
          config: FeedShortcuts.TOGGLE_FAVORITES,
          handler: () => {
            toggleFavoritesFilter();
          },
        },
        {
          config: FeedShortcuts.TOGGLE_HIDDEN,
          handler: () => {
            toggleHiddenFilter();
          },
        },
        {
          config: FeedShortcuts.FOCUS_SEARCH,
          handler: () => {
            searchInputRef?.focus();
          },
        },
        {
          config: FeedShortcuts.CLEAR_SEARCH,
          handler: () => {
            if (searchQuery) {
              handleSearch('');
            } else if (showFilters) {
              showFilters = false;
            }
          },
        },
        {
          config: FeedShortcuts.SHOW_HELP,
          handler: () => {
            showShortcutsHelp = true;
          },
        },
      ];

      const unsubscribe = registerShortcuts(shortcuts);
      cleanupFns.push(unsubscribe);
      return unsubscribe;
    });

    $effect(() => {
      const unsubscribe = subscribeMessages((message) => {
        if (message.type === 'PROFILE_UPDATED') {
          applyProfile(message.payload);
        }
        if (message.type === 'MISSIONS_UPDATED' && message.projection === 'cold-only') {
          receiveAlarmMissions(message.payload);
        }
      });

      return unsubscribe;
    });

    // Dev event handlers
    if (import.meta.env.DEV) {
      $effect(() => {
        function handleMissions(e: Event) {
          const devMissions = (e as CustomEvent).detail;
          feedStore.setMissions(devMissions);
        }
        function handleDevState(e: Event) {
          const devState = (e as CustomEvent).detail as string;
          if (devState === 'empty') {
            feedStore.setMissions([]);
          } else if (devState === 'loading') {
            feedStore.load();
          } else if (devState === 'error') {
            feedStore.setError('[Dev] Simulated error');
          }
        }
        window.addEventListener('dev:missions', handleMissions);
        window.addEventListener('dev:feed-state', handleDevState);
        return () => {
          window.removeEventListener('dev:missions', handleMissions);
          window.removeEventListener('dev:feed-state', handleDevState);
        };
      });
    }

    // Cleanup controller on unmount
    $effect(() => {
      return () => controller.dispose();
    });

    // Dev logging
    if (import.meta.env.DEV) {
      $effect(() => {
        console.debug(
          '[FeedPage] state:',
          feedStore.state,
          'missions:',
          missions?.length ?? 0,
          'displayMissions:',
          displayMissions.length,
          'visibleCount:',
          visibleCount
        );
      });
    }
  }

  function dispose(): void {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }
    if (seenFlushTimer) {
      clearTimeout(seenFlushTimer);
      seenFlushTimer = null;
    }
    flushSeenIds();
    for (const fn of cleanupFns) {
      fn();
    }
    cleanupFns = [];
    // Cancel pending undo windows without committing (safe-by-default, invariant I5).
    hideUndo.dispose();
    viewDeleteUndo.dispose();
    arrivalActor.dispose();
    arrivalPreviewCacheState = transitionArrivalPreviewCache(arrivalPreviewCacheState, {
      type: 'PREVIEW_CACHE_DISPOSED',
      reason: 'feed-unmounted',
    });
  }

  // ============================================================
  // Return — all $state fields are directly accessible for bind:
  // ============================================================

  return {
    // Mutable state — bindable by Svelte
    get sortBy() {
      return sortBy;
    },
    set sortBy(v: SortBy) {
      activeSavedViewId = null;
      sortBy = v;
      setFeedSortBy(v);
    },

    get showFavoritesOnly() {
      return showFavoritesOnly;
    },
    get showHidden() {
      return showHidden;
    },
    get showFilters() {
      return showFilters;
    },
    get selectedStacks() {
      return selectedStacks;
    },
    get selectedSource() {
      return selectedSource;
    },
    get selectedRemote() {
      return selectedRemote;
    },
    get selectedSeniority() {
      return selectedSeniority;
    },
    get selectedScoreBucket() {
      return selectedScoreBucket;
    },
    get decisionPreset() {
      return decisionPreset;
    },
    get showNewOnly() {
      return showNewOnly;
    },
    get savedViews() {
      return savedViews;
    },
    get activeSavedViewId() {
      return activeSavedViewId;
    },
    get firstName() {
      return firstName;
    },
    get profileLoaded() {
      return profileLoaded;
    },
    get profileCompletion() {
      return profileImpactSimulation.currentCompletion;
    },
    get missingProfileItems() {
      return missingProfileItems;
    },
    get profileNeedsCompletion() {
      return profileNeedsCompletion;
    },
    get panelSide() {
      return panelSide;
    },
    get aiStatus() {
      return aiStatus;
    },

    get showShortcutsHelp() {
      return showShortcutsHelp;
    },
    set showShortcutsHelp(v: boolean) {
      showShortcutsHelp = v;
    },

    get searchInputRef() {
      return searchInputRef;
    },
    set searchInputRef(v: HTMLInputElement | null) {
      searchInputRef = v;
    },

    // Internal state (read-only from template, mutated via handlers)
    get seenIds() {
      return seenIds;
    },
    get favorites() {
      return favorites;
    },
    get hidden() {
      return hidden;
    },

    // Derived — from feed store
    get missions() {
      return missions;
    },
    get isLoading() {
      return isLoading;
    },
    get error() {
      return error;
    },
    get searchQuery() {
      return searchQuery;
    },
    get totalMissions() {
      return totalMissions;
    },

    // Derived — UI
    get seenSet() {
      return seenSet;
    },
    get favoriteCount() {
      return favoriteCount;
    },
    get hiddenCount() {
      return hiddenCount;
    },
    get isOffline() {
      return isOffline;
    },
    get heroCompact() {
      return heroCompact;
    },
    get filterActive() {
      return filterActive;
    },
    get availableStacks() {
      return availableStacks;
    },
    get displayMissions() {
      return displayMissions;
    },
    get stableQueueActive() {
      return stableQueueActive;
    },
    get arrivalStackState() {
      return {
        value: arrivalStackView.state,
        message: arrivalStackView.errorMessage,
        drawerOpen: arrivalStackView.drawerOpen,
      };
    },
    get arrivalStackCount() {
      return arrivalStackView.count;
    },
    get arrivalStackVisible() {
      return arrivalStackVisible;
    },
    get feedPresentation() {
      return feedPresentation;
    },
    get arrivalPreviewMissions() {
      return arrivalPreviewMissions;
    },
    get visibleCount() {
      return visibleCount;
    },
    get missionListResetKey() {
      return missionListResetKey;
    },
    get sourceMissionCounts() {
      return sourceMissionCounts;
    },
    get scoreDistribution() {
      return scoreDistribution;
    },
    get decisionPresets() {
      return decisionPresets;
    },
    get dashboardSummary() {
      return dashboardSummary;
    },
    get insightSummary() {
      return insightSummary;
    },
    get canSaveCurrentView() {
      return canSaveCurrentView;
    },
    get savedViewLimitReached() {
      return savedViewLimitReached;
    },

    get comparisonMissionIds() {
      return comparisonMissionIds;
    },
    get comparisonMissions() {
      return comparisonMissions;
    },

    // Focus lens (notification deep-link)
    get focusMode() {
      return focusMode;
    },
    get focusMissions() {
      return focusMissions;
    },
    get focusSinceLabel() {
      return focusSinceLabel;
    },

    // Setters for non-bind cases
    setShowFilters(v: boolean) {
      showFilters = v;
    },

    // Actions
    handleMissionSeen,
    handleMissionReadSignal,
    receiveAlarmMissions,
    openArrivalStack,
    closeArrivalStack,
    refreshArrivals,
    bootstrapArrivalActor,
    handleToggleFavorite,
    handleHide,
    handleCopyLink,
    handleSearch,
    toggleFavoritesFilter,
    toggleHiddenFilter,
    toggleStack,
    setSelectedSource,
    setSelectedRemote,
    setSelectedSeniority,
    setSelectedScoreBucket,
    applyDecisionPreset,
    toggleNewOnly,
    saveCurrentView,
    applySavedView,
    deleteSavedView,
    toggleCompare,
    clearComparison,
    clearAllFilters,
    applyFocusIntent,
    dismissFocus,

    // Lifecycle
    setup,
    dispose,
  };
}
