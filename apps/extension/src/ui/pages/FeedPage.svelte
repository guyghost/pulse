<script module lang="ts">
  // Re-export types from core for backward compatibility
  export type {
    FeedStory,
    FeedStoryInput,
    FeedStorySeverity,
  } from '$lib/core/feed/build-feed-story';
</script>

<script lang="ts">
  import { createFeedStore } from '$lib/state/feed.svelte';
  import {
    createFeedController,
    type SourceStatus,
  } from '$lib/shell/facades/feed-controller.svelte';
  import { createFeedPageState } from '$lib/state/feed-page.svelte';
  import {
    STATUS_LABELS,
    type ApplicationStatus,
    type MissionTracking,
  } from '$lib/core/types/tracking';
  import { pullToRefresh } from '../actions/pull-to-refresh';
  import { onDestroy, tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { slide } from 'svelte/transition';
  import ScanProgress from '../organisms/ScanProgress.svelte';
  import ScanSummaryCard from '../organisms/ScanSummary.svelte';
  import {
    buildScanSummary,
    type ScanSummary as ScanSummaryData,
  } from '$lib/core/scan/scan-summary';
  import { buildFeedStory } from '$lib/core/feed/build-feed-story';
  import SearchInput from '../molecules/SearchInput.svelte';
  import { Icon, type IconName } from '@pulse/ui';
  import type { Mission, MissionSource } from '$lib/core/types/mission';
  import { getMissionScore as getCanonicalMissionScore } from '$lib/core/scoring/mission-grade';
  import type { FeedTourStep } from '../molecules/FeedTourOverlay.svelte';
  import OperationalStoryCard from '../molecules/OperationalStoryCard.svelte';
  import FeedFilterSheet from '../organisms/FeedFilterSheet.svelte';
  import Tooltip from '../atoms/Tooltip.svelte';
  import {
    getProfileBannerDismissed,
    setProfileBannerDismissed,
    setFeedTourSeen,
  } from '$lib/shell/facades/app-flags.facade';
  import {
    getKbdCheatsheetTipSeen,
    setKbdCheatsheetTipSeen,
  } from '$lib/shell/facades/app-flags.facade';
  import { getConnectorsMeta, openExternalUrl } from '$lib/shell/facades/feed-data.facade';
  import { deriveHealthStatus } from '$lib/core/health/derive-health-status';
  import { getLastTransitionTime } from '$lib/core/tracking';
  import { DEFAULT_CONNECTED_ALERT_PREFERENCES } from '$lib/core/types/alert-preferences';
  import type { ConnectedAlertPreferences } from '$lib/core/types/alert-preferences';
  import { getAlertPreferences } from '$lib/shell/facades/alert-preferences.facade';
  import { showToast, showToastAction } from '$lib/shell/notifications/toast-service';
  import { subscribeMessages } from '$lib/shell/messaging/bridge';

  const {
    onNavigateToOnboarding,
    onNavigateToProfile,
    active = true,
  }: {
    onNavigateToOnboarding?: () => void;
    onNavigateToProfile?: () => void;
    active?: boolean;
  } = $props();

  // ============================================================
  // Initialization
  // ============================================================
  const feed = createFeedStore();
  const controller = createFeedController(feed);
  const page = createFeedPageState(feed, controller);
  const filterSourceOptions = getConnectorsMeta().map((source) => ({
    value: source.id as MissionSource,
    label: source.name,
  }));
  page.setup();
  onDestroy(() => page.dispose());
  onDestroy(() => {
    if (scanSummaryTimer) {
      clearTimeout(scanSummaryTimer);
    }
  });

  type TrackingStore = ReturnType<typeof import('$lib/state/tracking.svelte').createTrackingStore>;
  const emptyTrackings = new Map<string, MissionTracking>();
  let tracking = $state<TrackingStore | null>(null);
  const trackingPendingMissionIds = new SvelteSet<string>();
  let trackingLoadPromise: Promise<TrackingStore> | null = null;
  let trackingBootstrapStarted = false;

  function loadTrackingStore(): Promise<TrackingStore> {
    if (tracking?.state === 'loaded') {
      return Promise.resolve(tracking);
    }

    if (trackingLoadPromise) {
      return trackingLoadPromise;
    }

    const pending = (async (): Promise<TrackingStore> => {
      let store = tracking;
      if (!store) {
        const { createTrackingStore } = await import('$lib/state/tracking.svelte');
        store = tracking ?? createTrackingStore();
        tracking = store;
      }
      await store.loadTrackings();
      return store;
    })();

    trackingLoadPromise = pending.finally(() => {
      trackingLoadPromise = null;
    });
    return trackingLoadPromise;
  }

  function bootstrapTrackingStore(): void {
    if (trackingBootstrapStarted) {
      return;
    }
    trackingBootstrapStarted = true;
    void loadTrackingStore().catch(async (cause: unknown) => {
      await showToast(trackingFailureMessage(cause), 'error');
    });
  }

  let VirtualMissionFeed: typeof import('../organisms/VirtualMissionFeed.svelte').default | null =
    $state(null);
  let SourceHealthPanel: typeof import('../organisms/SourceHealthPanel.svelte').default | null =
    $state(null);
  let FeedActionDashboard: typeof import('../organisms/FeedActionDashboard.svelte').default | null =
    $state(null);
  let ConnectorStatusList: typeof import('../molecules/ConnectorStatusList.svelte').default | null =
    $state(null);
  let LastScanInfo: typeof import('../molecules/LastScanInfo.svelte').default | null = $state(null);
  let KeyboardShortcutsHelp:
    typeof import('../molecules/KeyboardShortcutsHelp.svelte').default | null = $state(null);
  let MissionInvestigationDrawer:
    typeof import('../organisms/MissionInvestigationDrawer.svelte').default | null = $state(null);
  let MissionComparison: typeof import('../organisms/MissionComparison.svelte').default | null =
    $state(null);
  let MissionArrivalStack: typeof import('../organisms/MissionArrivalStack.svelte').default | null =
    $state(null);
  let ProfileRefinementBanner:
    typeof import('../molecules/ProfileRefinementBanner.svelte').default | null = $state(null);
  let ProfileChecklistPill:
    typeof import('../molecules/ProfileChecklistPill.svelte').default | null = $state(null);
  let checklistPillDismissed = $state(false);
  let ConnectorAlertBar: typeof import('../molecules/ConnectorAlertBar.svelte').default | null =
    $state(null);
  let FeedTourOverlay: typeof import('../molecules/FeedTourOverlay.svelte').default | null =
    $state(null);

  function loadFeedContent(): void {
    if (!VirtualMissionFeed) {
      import('../organisms/VirtualMissionFeed.svelte').then((module) => {
        VirtualMissionFeed = module.default;
      });
    }
  }

  function loadFeedChrome(): void {
    if (!SourceHealthPanel) {
      import('../organisms/SourceHealthPanel.svelte').then((module) => {
        SourceHealthPanel = module.default;
      });
    }
    if (!FeedActionDashboard) {
      import('../organisms/FeedActionDashboard.svelte').then((module) => {
        FeedActionDashboard = module.default;
      });
    }
    if (!ConnectorStatusList) {
      import('../molecules/ConnectorStatusList.svelte').then((module) => {
        ConnectorStatusList = module.default;
      });
    }
    if (!LastScanInfo) {
      import('../molecules/LastScanInfo.svelte').then((module) => {
        LastScanInfo = module.default;
      });
    }
  }

  function loadShortcutsHelp(): void {
    if (!KeyboardShortcutsHelp) {
      import('../molecules/KeyboardShortcutsHelp.svelte').then((module) => {
        KeyboardShortcutsHelp = module.default;
      });
    }
  }

  function loadInvestigationDrawer(): void {
    if (!MissionInvestigationDrawer) {
      import('../organisms/MissionInvestigationDrawer.svelte').then((module) => {
        MissionInvestigationDrawer = module.default;
      });
    }
  }

  function loadComparison(): void {
    if (!MissionComparison) {
      import('../organisms/MissionComparison.svelte').then((module) => {
        MissionComparison = module.default;
      });
    }
  }

  function loadMissionArrivalStack(): void {
    if (!MissionArrivalStack) {
      import('../organisms/MissionArrivalStack.svelte').then((module) => {
        MissionArrivalStack = module.default;
      });
    }
  }

  function loadRefinementBanner(): void {
    if (!ProfileRefinementBanner) {
      import('../molecules/ProfileRefinementBanner.svelte').then((module) => {
        ProfileRefinementBanner = module.default;
      });
    }
  }

  // The checklist pill loads on its own condition (profile < 100%), decoupled
  // from the refinement banner. Previously it was bundled into
  // loadRefinementBanner(), so it never loaded when the banner was dismissed
  // or not yet needed — even though the pill's own render condition was true.
  function loadChecklistPill(): void {
    if (!ProfileChecklistPill) {
      import('../molecules/ProfileChecklistPill.svelte').then((module) => {
        ProfileChecklistPill = module.default;
      });
    }
  }

  function loadConnectorAlertBar(): void {
    if (!ConnectorAlertBar) {
      import('../molecules/ConnectorAlertBar.svelte').then((module) => {
        ConnectorAlertBar = module.default;
      });
    }
  }

  function loadFeedTourOverlay(): void {
    if (!FeedTourOverlay) {
      import('../molecules/FeedTourOverlay.svelte').then((module) => {
        FeedTourOverlay = module.default;
      });
    }
  }

  $effect(() => {
    requestAnimationFrame(() => {
      loadFeedContent();
      loadFeedChrome();
      bootstrapTrackingStore();
    });
  });

  // Refinement banner: shown only on zero-config first scan (no profile yet)
  let showRefinementBanner = $state(false);
  let showTour = $state(false);
  let tourStepIndex = $state(0);
  let missionScrollTop = $state(0);
  let feedChromeCompact = $state(false);
  let feedScrollContainer = $state<HTMLDivElement | null>(null);
  let missionFeedSection = $state<HTMLDivElement | null>(null);
  let feedHeroCard = $state<HTMLElement | null>(null);
  let alertPreferences = $state<ConnectedAlertPreferences>(DEFAULT_CONNECTED_ALERT_PREFERENCES);
  let showAlertOnly = $state(false);
  let showComparison = $state(false);
  let showAdvancedControls = $state(false);
  let investigationMission = $state<(typeof page.displayMissions)[number] | null>(null);
  let filterTrigger = $state<HTMLButtonElement | null>(null);
  let filterSheetWasOpen = false;
  let scrollStopTimeout: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (!active && page.showFilters) {
      page.dismissFilterSheet('page-hidden');
    }
  });

  $effect(() => {
    const isOpen = page.showFilters;
    if (!isOpen && filterSheetWasOpen && active) {
      void tick().then(() => filterTrigger?.focus());
    }
    filterSheetWasOpen = isOpen;
  });

  $effect(() => {
    if (page.showShortcutsHelp) {
      loadShortcutsHelp();
    }
  });

  $effect(() => {
    if (investigationMission) {
      loadInvestigationDrawer();
    }
  });

  $effect(() => {
    if (showComparison && page.comparisonMissions.length >= 2) {
      loadComparison();
    }
  });

  $effect(() => {
    if (page.arrivalStackVisible) {
      loadMissionArrivalStack();
    }
  });

  $effect(() => {
    const root = document.documentElement;
    if (!page.arrivalStackVisible) {
      root.style.removeProperty('--toast-bottom-offset');
      return;
    }

    root.style.setProperty('--toast-bottom-offset', '6.5rem');
    return () => root.style.removeProperty('--toast-bottom-offset');
  });

  $effect(() => {
    if (showRefinementBanner && page.profileLoaded && page.profileNeedsCompletion) {
      loadRefinementBanner();
    }
  });

  $effect(() => {
    if (page.profileLoaded && page.profileCompletion < 100) {
      loadChecklistPill();
    }
  });

  $effect(() => {
    if (brokenConnectors.length > 0) {
      loadConnectorAlertBar();
    }
  });

  $effect(() => {
    if (activeTourStep) {
      loadFeedTourOverlay();
    }
  });

  const tourSteps: FeedTourStep[] = [
    {
      id: 'score',
      title: 'La pertinence en premier',
      description:
        'Chaque mission affiche une note pour vous aider à repérer rapidement les opportunités les plus prometteuses.',
    },
    {
      id: 'filters',
      title: 'Affinez avec les filtres',
      description:
        'Utilisez la recherche, le tri et les filtres pour réduire le bruit en quelques clics.',
    },
    {
      id: 'expand',
      title: 'Ouvrez une carte pour plus de détails',
      description:
        'Touchez une mission pour développer la fiche, lire la description et accéder aux actions rapides.',
    },
    {
      id: 'seen',
      title: 'Repérez les nouveautés',
      description:
        'Les nouvelles missions sont distinguées visuellement pour éviter de re-traiter ce que vous avez déjà vu.',
    },
  ];

  const activeTourStep = $derived(showTour ? tourSteps[tourStepIndex] : null);
  const brokenConnectors = $derived.by(() => {
    const snapshots = controller.healthSnapshots;
    const enabled = controller.enabledConnectorIds;
    const names = new Map(
      controller.sourceStatuses.map((source) => [source.connectorId, source.name])
    );

    return [...snapshots.values()]
      .filter((snapshot) => deriveHealthStatus(snapshot) === 'broken')
      .map((snapshot) => ({
        connectorId: snapshot.connectorId,
        connectorName: names.get(snapshot.connectorId) ?? snapshot.connectorId,
        isEnabled: enabled.has(snapshot.connectorId),
      }));
  });

  function getMissionScore(mission: Mission): number {
    return getCanonicalMissionScore(mission) ?? 0;
  }

  function missionMatchesAlert(
    mission: (typeof page.displayMissions)[number],
    preferences: ConnectedAlertPreferences
  ): boolean {
    if (!preferences.enabled) {
      return false;
    }

    if (getMissionScore(mission) < preferences.scoreThreshold) {
      return false;
    }

    if (preferences.minDailyRate > 0 && (mission.tjm ?? 0) < preferences.minDailyRate) {
      return false;
    }

    const stacks = new Set(
      preferences.requiredStacks.map((stack) => stack.toLowerCase().trim()).filter(Boolean)
    );

    if (stacks.size > 0 && !mission.stack.some((stack) => stacks.has(stack.toLowerCase()))) {
      return false;
    }

    return true;
  }

  const alertMissions = $derived(
    page.displayMissions.filter((mission) => missionMatchesAlert(mission, alertPreferences))
  );

  const visibleFeedMissions = $derived(showAlertOnly ? alertMissions : page.displayMissions);
  const visibleFeedMissionCount = $derived(visibleFeedMissions.length);
  const hasVisibleFeedMissions = $derived(visibleFeedMissionCount > 0);
  const feedIsColdLoading = $derived(page.isLoading && !hasVisibleFeedMissions);
  const feedChromeBusy = $derived(controller.isScanning || feedIsColdLoading);
  const visibleFeedMissionLabel = $derived(formatMissionCount(visibleFeedMissionCount));

  // Focus lens (notification deep-link): banner shows when the feed is filtered
  // to the notified missions. See src/models/notification-deep-link.model.md.
  const focusActive = $derived(page.focusMode === 'focused' && page.focusMissions.length > 0);
  const arrivalDrawerExpanded = $derived(
    page.arrivalStackState.value === 'open' ||
      page.arrivalStackState.value === 'refreshing' ||
      (page.arrivalStackState.value === 'refresh-error' && page.arrivalStackState.drawerOpen)
  );
  const missionFeedResetKey = $derived(
    `${page.missionListResetKey}::alert:${showAlertOnly ? 'alert' : 'all'}`
  );
  // ── Feed story projection ────────────────────────────────────────────
  // The story strip is a surface for states that need a decision. Calm states
  // (feed-ready) stay silent — the mission list is the answer. See
  // src/models/feed-story.model.md.
  const alertMatchCount = $derived.by(() => {
    if (!alertPreferences.enabled) {
      return 0;
    }
    return alertMissions.length;
  });

  const feedStory = $derived(
    buildFeedStory({
      error: page.error,
      isOffline: page.isOffline,
      brokenConnectorCount: brokenConnectors.length,
      firstBrokenConnectorName: brokenConnectors[0]?.connectorName ?? null,
      newCount: page.dashboardSummary.newCount,
      highScoreCount: alertMatchCount,
      visibleCount: page.dashboardSummary.visibleCount,
      alertEnabled: alertPreferences.enabled,
      alertScoreThreshold: alertPreferences.scoreThreshold,
      hasCompletedScan: controller.lastScanAt !== null,
      filterActive: page.filterActive,
      totalMissionCount: page.totalMissions,
      searchQuery: page.searchQuery,
    })
  );

  const feedStoryNeedsAttention = $derived(
    feedStory.severity === 'critical' ||
      feedStory.severity === 'incident' ||
      feedStory.severity === 'attention'
  );
  // When connector health is the top-severity signal (no error, not offline),
  // the inline story owns the connector attention and the ConnectorAlertBar
  // panel must not stack a second strip over the feed — but only while the
  // inline story is actually rendered. The story lives inside the hero-content
  // block; with zero missions and an idle feed that block is skipped, so the
  // ConnectorAlertBar must stay the canonical surface. Model:
  // src/models/feed-story.model.md — « une seule surface d'attention ».
  const storyCoversConnectors = $derived(
    feedStoryNeedsAttention &&
      !page.error &&
      !page.isOffline &&
      brokenConnectors.length > 0 &&
      (page.heroCompact || showAdvancedControls || feedChromeBusy || scanSummaryVisible)
  );

  // The toolbar under the hero only carries auxiliary chrome (refinement
  // banner, checklist pill, busy indicator, presets) — the search/filter
  // controls now live in the floating capsule. When every piece is hidden the
  // container must not render at all, otherwise it leaves an empty bordered
  // strip inside the section card.
  const feedToolbarVisible = $derived(
    feedChromeBusy ||
      showAdvancedControls ||
      (showRefinementBanner &&
        !controller.isScanning &&
        page.profileLoaded &&
        page.profileNeedsCompletion) ||
      (!checklistPillDismissed && page.profileLoaded && page.profileCompletion < 100)
  );

  // ── Scan completion delight ──────────────────────────────────────────
  // Quiet, confident terminal summary shown the moment a scan finishes.
  // Pure projection of scan-lifecycle terminal facts — introduces no state
  // transition. Model: src/models/scan-completion-delight.model.md.
  let scanSummary = $state<ScanSummaryData | null>(null);
  let scanSummaryVisible = $state(false);
  let scanSummaryTimer: ReturnType<typeof setTimeout> | undefined;
  // Plain (non-reactive) refs for edge detection on the monotonic lastScanAt.
  let prevScanAt: number | null = controller.lastScanAt;
  // Suppresses reveal until a real scan is observed this session. The
  // controller starts with lastScanAt === null and hydrates the persisted
  // timestamp asynchronously during init(); without this guard, hydration
  // reads as a newly completed scan and surfaces a stale summary on reopen.
  let everScanned = false;

  function dismissScanSummary(): void {
    scanSummaryVisible = false;
    scanSummary = null;
    if (scanSummaryTimer) {
      clearTimeout(scanSummaryTimer);
      scanSummaryTimer = undefined;
    }
  }

  $effect(() => {
    const ts = controller.lastScanAt;
    const scanning = controller.isScanning;

    // A new scan starting dismisses any visible summary immediately, and
    // nulls it so a subsequent failed/cancelled scan (no lastScanAt update)
    // can never resurface a stale success summary. The baseline is synced
    // here too, so a non-update after a failed scan produces no edge.
    if (scanning) {
      everScanned = true;
      if (scanSummaryVisible || scanSummary || scanSummaryTimer) {
        scanSummaryVisible = false;
        scanSummary = null;
        if (scanSummaryTimer) {
          clearTimeout(scanSummaryTimer);
          scanSummaryTimer = undefined;
        }
      }
      prevScanAt = ts;
      return;
    }

    // Hydration guard: treat the first observed lastScanAt as baseline, not
    // a freshly completed scan, so reopening the panel never reveals a
    // stale summary.
    if (!everScanned) {
      prevScanAt = ts;
      return;
    }

    if (ts === null || ts === prevScanAt) {
      return;
    }
    prevScanAt = ts;
    scanSummary = buildScanSummary({
      newCount: page.dashboardSummary.newCount,
      highScoreCount: alertMatchCount,
      brokenConnectorCount: brokenConnectors.length,
      alertScoreThreshold: alertPreferences.scoreThreshold,
    });
    scanSummaryVisible = true;
    if (scanSummaryTimer) {
      clearTimeout(scanSummaryTimer);
    }
    scanSummaryTimer = setTimeout(() => {
      scanSummaryVisible = false;
      scanSummary = null;
      scanSummaryTimer = undefined;
    }, 4500);
  });

  function formatMissionCount(count: number): string {
    return `${count} mission${count > 1 ? 's' : ''}`;
  }

  async function scrollToMissionFeed(): Promise<void> {
    await tick();

    if (!missionFeedSection) {
      return;
    }

    missionFeedSection.focus({ preventScroll: true });
    missionFeedSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleFeedStoryPrimaryAction(): void {
    if (page.error) {
      handleMissionFeedScanAction();
      return;
    }

    if (page.isOffline) {
      if (hasVisibleFeedMissions) {
        void scrollToMissionFeed();
      }
      return;
    }

    if (brokenConnectors.length > 0) {
      // The story is the single attention surface for broken sources: recheck
      // every broken connector. Disabled connectors stay disabled — enabling
      // is a deliberate user transition (health panel / settings), never implicit.
      for (const broken of brokenConnectors) {
        void controller.recheckConnector(broken.connectorId);
      }
      return;
    }

    if (page.dashboardSummary.newCount > 0) {
      if (!page.showNewOnly) {
        page.toggleNewOnly();
      }
      void scrollToMissionFeed();
      return;
    }

    if (alertMatchCount > 0) {
      showAlertOnly = true;
      void scrollToMissionFeed();
      return;
    }

    // Empty state: filters hide all cached missions → clear filters (not Profile)
    if (page.dashboardSummary.visibleCount === 0 && page.filterActive && page.totalMissions > 0) {
      handleClearMissionFilters();
      return;
    }

    // Empty state: scanned but no matches → route to Profile
    if (page.dashboardSummary.visibleCount === 0 && controller.lastScanAt !== null) {
      onNavigateToProfile?.();
      return;
    }

    if (hasVisibleFeedMissions) {
      void scrollToMissionFeed();
      return;
    }

    handleMissionFeedScanAction();
  }

  function handleClearMissionFilters(): void {
    showAlertOnly = false;
    page.clearAllFilters();
    page.handleSearch('');
  }

  function openComparison(): void {
    if (page.comparisonMissions.length >= 2) {
      showComparison = true;
    }
  }

  function closeComparison(): void {
    showComparison = false;
  }

  function clearComparison(): void {
    showComparison = false;
    page.clearComparison();
  }

  function handleMissionFeedScanAction(): void {
    const presentation = page.feedPresentation;
    if (!presentation.actionEnabled || presentation.primaryAction === null) {
      return;
    }
    if (presentation.primaryAction === 'cancel') {
      void controller.stopScan();
      return;
    }
    void controller.startScan();
  }

  async function handleApplyPendingMissions(): Promise<void> {
    try {
      const completionEffects = await page.refreshArrivals();
      await tick();
      if (
        completionEffects.some((effect) => effect.type === 'scroll-feed-start') &&
        missionFeedSection
      ) {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        missionFeedSection.scrollIntoView({
          behavior: reduceMotion ? 'auto' : 'smooth',
          block: 'start',
        });
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[FeedPage] apply pending missions failed:', err);
      }
    }
  }

  function handleOpenExternalUrl(url: string): void {
    openExternalUrl(url).catch(() => {});
  }

  function cloneTrackingSnapshot(record: MissionTracking | undefined): MissionTracking | null {
    if (!record) {
      return null;
    }

    return {
      ...record,
      history: record.history.map((transition) => ({ ...transition })),
      generatedAssetIds: [...record.generatedAssetIds],
    };
  }

  function getTrackingUpdatedAt(missionId: string): number | null {
    const record = tracking?.getTrackingForMission(missionId);
    return record ? getLastTransitionTime(record) : null;
  }

  function trackingFailureMessage(cause: unknown): string {
    return cause instanceof Error ? cause.message : 'Impossible de confirmer le suivi.';
  }

  async function handleTrackingTransition(
    missionId: string,
    status: ApplicationStatus
  ): Promise<void> {
    if (trackingPendingMissionIds.has(missionId)) {
      return;
    }

    trackingPendingMissionIds.add(missionId);
    try {
      const trackingStore = await loadTrackingStore();
      const previousTracking = cloneTrackingSnapshot(
        trackingStore.getTrackingForMission(missionId)
      );
      await trackingStore.transitionStatus(missionId, status);
      showToastAction(`Statut: ${STATUS_LABELS[status]}`, 'success', {
        label: 'Annuler',
        onClick: () => {
          void (async () => {
            try {
              await trackingStore.restoreTracking(missionId, previousTracking);
            } catch (cause) {
              await showToast(trackingFailureMessage(cause), 'error');
            }
          })();
        },
      });
    } catch (cause) {
      await showToast(trackingFailureMessage(cause), 'error');
    } finally {
      trackingPendingMissionIds.delete(missionId);
    }
  }

  async function retryTrackingLoad(): Promise<void> {
    try {
      await loadTrackingStore();
    } catch (cause) {
      await showToast(trackingFailureMessage(cause), 'error');
    }
  }

  function handleInvestigationToggleCompare(): void {
    if (!investigationMission) {
      return;
    }
    page.toggleCompare(investigationMission.id);
  }

  function handleInvestigationHide(): void {
    if (!investigationMission) {
      return;
    }
    page.handleHide(investigationMission.id);
  }

  function handleInvestigationSelectForTracking(): void {
    if (!investigationMission) {
      return;
    }
    void handleTrackingTransition(investigationMission.id, 'selected');
  }

  (async () => {
    const [bannerDismissed, storedAlertPreferences] = await Promise.all([
      getProfileBannerDismissed(),
      getAlertPreferences(),
    ]);
    showRefinementBanner = !bannerDismissed;
    // The checklist pill shares the profile-completion nudge's dismiss state:
    // if the user dismissed the banner, don't re-surface the pill (and vice
    // versa). Persisted via the existing flag so it survives reloads.
    checklistPillDismissed = bannerDismissed;
    alertPreferences = storedAlertPreferences;
  })().catch(() => {});

  // First-run tip: surface the keyboard cheatsheet once.
  (async () => {
    const seen = await getKbdCheatsheetTipSeen();
    if (seen) {
      return;
    }
    showToastAction(
      'Navigation clavier — appuie sur ? pour voir les raccourcis.',
      'info',
      {
        label: 'Voir les raccourcis',
        onClick: () => {
          page.showShortcutsHelp = true;
        },
      },
      8000
    );
    await setKbdCheatsheetTipSeen();
  })().catch(() => {});

  $effect(() => {
    function handleOpenTour() {
      tourStepIndex = 0;
      showTour = true;
    }

    const unsubscribe = subscribeMessages((message) => {
      if (message.type === 'PROFILE_UPDATED') {
        showRefinementBanner = false;
      }
    });

    window.addEventListener('feed-tour:open', handleOpenTour);
    return () => {
      unsubscribe();
      window.removeEventListener('feed-tour:open', handleOpenTour);
    };
  });

  async function closeTour() {
    showTour = false;
    await setFeedTourSeen();
  }

  async function advanceTour() {
    if (tourStepIndex >= tourSteps.length - 1) {
      await closeTour();
      return;
    }

    tourStepIndex += 1;
  }

  function emitFeedScrollState(isScrolling: boolean, scrollTop: number) {
    window.dispatchEvent(
      new CustomEvent('feed:scroll-state', {
        detail: { isScrolling, scrollTop },
      })
    );
  }

  function handleMissionScroll(event: Event) {
    const target = event.currentTarget as HTMLElement;
    const nextScrollTop = target.scrollTop;
    const scrollingDown = nextScrollTop > missionScrollTop;

    missionScrollTop = nextScrollTop;

    if (scrollingDown && nextScrollTop > 12) {
      feedChromeCompact = true;
      emitFeedScrollState(true, nextScrollTop);
    }

    if (scrollStopTimeout) {
      clearTimeout(scrollStopTimeout);
    }

    scrollStopTimeout = setTimeout(() => {
      feedChromeCompact = false;
      emitFeedScrollState(false, missionScrollTop);
    }, 260);
  }

  $effect(() => {
    // Auto-scroll to the mission feed when the focus lens activates, so the
    // user lands on the notified missions instead of staying at the hero.
    if (focusActive) {
      void tick().then(() => {
        missionFeedSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  });

  function handleFilterSheetKeydown(event: KeyboardEvent): void {
    if (!active || !page.showFilters || event.key !== 'Escape') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    page.dismissFilterSheet('escape');
  }

  function toggleOperationalDetails(): void {
    if (page.showFilters) {
      page.dismissFilterSheet('button');
    }

    const nextOpen = !showAdvancedControls;
    showAdvancedControls = nextOpen;

    if (nextOpen) {
      void tick().then(() => {
        feedHeroCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }
</script>

<svelte:window onkeydown={handleFilterSheetKeydown} />

<div
  bind:this={feedScrollContainer}
  data-testid="feed-scroll-container"
  class="relative h-full overflow-y-auto"
  use:pullToRefresh={{ onRefresh: () => handleMissionFeedScanAction(), threshold: 60 }}
  onscroll={handleMissionScroll}
>
  <h1 class="sr-only">Feed de missions MissionPulse</h1>

  <div
    class="px-4 pt-4 transition-[filter] duration-200 ease-out {feedChromeCompact
      ? 'brightness-[0.99]'
      : ''}"
  >
    <div class="min-h-0 overflow-visible">
      <!-- ═══════════════════════════════════════════
           Hero card — greeting + filters unified
           ═══════════════════════════════════════════ -->
      <section
        bind:this={feedHeroCard}
        data-testid="feed-hero-card"
        class="section-card-strong relative overflow-visible rounded-2xl transition-[border-color,box-shadow] duration-200 ease-out {page.showFilters
          ? 'z-40'
          : ''} {feedChromeCompact ? 'border-blueprint-blue/10 shadow-subtle-3' : ''}"
      >
        <!-- ── Hero header ── -->
        {#snippet scanControl()}
          {#if page.feedPresentation.primaryAction === 'cancel'}
            <Tooltip
              label="Stopper le scan"
              description="Interrompt le scan en cours et conserve les données déjà chargées."
            >
              <button
                class="soft-ring inline-flex h-9 w-9 items-center justify-center rounded-full border border-status-red/30 bg-status-red/10 text-status-red transition-all duration-200 hover:bg-status-red/15"
                onclick={handleMissionFeedScanAction}
                disabled={!page.feedPresentation.actionEnabled}
                aria-label="Stopper le scan en cours"
              >
                <Icon name="square" size={14} />
              </button>
            </Tooltip>
          {:else}
            <Tooltip
              label={page.isOffline
                ? 'Scan indisponible hors ligne'
                : page.feedPresentation.primaryAction === 'retry'
                  ? 'Réessayer le scan'
                  : 'Lancer le scan'}
              description={page.isOffline
                ? 'Les données en cache restent disponibles.'
                : 'Raccourci clavier: r. Relance la détection des missions.'}
            >
              <button
                class="soft-ring relative inline-flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-200
                    {page.isOffline
                  ? 'border-border-light bg-subtle-gray text-text-muted cursor-not-allowed'
                  : 'border-border-light bg-surface-white text-text-primary hover:bg-subtle-gray'}"
                onclick={handleMissionFeedScanAction}
                disabled={!page.feedPresentation.actionEnabled}
                aria-label={page.isOffline
                  ? 'Scan indisponible hors ligne'
                  : page.feedPresentation.primaryAction === 'retry'
                    ? 'Réessayer le scan des missions'
                    : 'Lancer le scan des missions'}
              >
                <Icon name="play" size={14} class="ml-0.5" />
              </button>
            </Tooltip>
          {/if}
        {/snippet}
        {#if page.heroCompact || showAdvancedControls || feedChromeBusy || scanSummaryVisible}
          <div class="px-5 {page.heroCompact ? 'pt-3 pb-1.5' : 'pt-4 pb-0'}">
            {#if page.heroCompact}
              <!-- Compact: quiet title row — the missions lead, chrome follows -->
              <div class="flex items-center justify-between gap-3">
                <h2
                  class="min-w-0 text-heading font-semibold leading-tight tracking-[-0.01em] text-text-primary"
                >
                  Missions
                  <span
                    class="ml-1.5 align-baseline font-geist text-[0.6em] font-normal tabular-nums tracking-normal text-text-subtle"
                    aria-label={`${formatMissionCount(page.visibleCount)} visible${page.visibleCount > 1 ? 's' : ''}`}
                  >
                    {page.visibleCount}
                  </span>
                  {#if page.favoriteCount > 0}
                    <span
                      class="ml-1.5 inline-flex items-center gap-1 align-baseline text-[0.6em] font-normal tracking-normal text-blueprint-blue"
                    >
                      <Icon name="star" size={10} class="fill-blueprint-blue" />
                      {page.favoriteCount}
                    </span>
                  {/if}
                </h2>
                <div class="flex shrink-0 items-center gap-2">
                  {@render scanControl()}
                </div>
              </div>

              {#if hasVisibleFeedMissions && !feedIsColdLoading}
                <!-- Decision presets — primary triage shortcuts, quiet chips -->
                <div class="mt-2.5" aria-label="Presets métier du feed">
                  <div class="flex gap-1.5 overflow-x-auto pb-0.5">
                    {#each page.decisionPresets as preset (preset.id)}
                      <button
                        type="button"
                        class="inline-flex h-7.5 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-micro font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 {preset.active
                          ? 'border-blueprint-blue/25 bg-blueprint-blue/8 text-blueprint-blue'
                          : 'border-border-light bg-surface-white text-text-secondary hover:border-disabled-gray hover:text-text-primary'}"
                        onclick={() => page.applyDecisionPreset(preset.id)}
                        aria-pressed={preset.active}
                        disabled={preset.count === 0 && !preset.active}
                        title={preset.description}
                      >
                        <span>{preset.label}</span>
                        <span class="rounded-full bg-page-canvas px-1 py-px tabular-nums">
                          {preset.count}
                        </span>
                      </button>
                    {/each}
                    {#if page.decisionPreset}
                      <button
                        type="button"
                        class="inline-flex h-7.5 shrink-0 items-center rounded-full px-2 text-micro font-medium text-blueprint-blue transition-colors hover:text-blueprint-blue/80"
                        onclick={page.clearAllFilters}
                      >
                        Tout
                      </button>
                    {/if}
                  </div>
                </div>
              {/if}

              {#if feedStoryNeedsAttention}
                <div class="mt-1.5">
                  <OperationalStoryCard
                    eyebrow="À faire maintenant"
                    title={feedStory.title}
                    description={feedStory.description}
                    severity={feedStory.severity}
                    statusLabel={feedStory.statusLabel}
                    evidence={feedStory.evidence}
                    variant="inline"
                    primaryActionLabel={feedStory.primaryActionLabel}
                    primaryActionIcon={feedStory.primaryActionIcon}
                    onPrimaryAction={handleFeedStoryPrimaryAction}
                  />
                </div>
              {/if}
              {#if showAdvancedControls}
                {#if SourceHealthPanel}
                  <SourceHealthPanel
                    sources={controller.sourceStatuses as SourceStatus[]}
                    isChecking={controller.isCheckingSources}
                    compact={true}
                    scanResultCounts={page.sourceMissionCounts}
                    activeSourceFilter={page.selectedSource}
                    enabledConnectors={controller.enabledConnectorIds}
                    healthSnapshots={controller.healthSnapshots}
                    parserHealthRecords={controller.parserHealthRecords}
                    onRefresh={() => controller.checkSourceSessions()}
                    onFilterBySource={(id) => {
                      page.setSelectedSource(id as MissionSource | null);
                    }}
                    onToggleConnector={(id) => controller.handleToggleConnector(id)}
                    onRecheckConnector={(id, enable) => controller.recheckConnector(id, enable)}
                    onReconnect={handleOpenExternalUrl}
                  />
                {/if}
                {#if FeedActionDashboard}
                  <FeedActionDashboard
                    summary={page.dashboardSummary}
                    insightSummary={page.insightSummary}
                    scoreDistribution={page.scoreDistribution}
                    selectedScoreBucket={page.selectedScoreBucket}
                    showNewOnly={page.showNewOnly}
                    brokenConnectorCount={brokenConnectors.length}
                    onToggleNewOnly={page.toggleNewOnly}
                    onToggleFavorites={page.toggleFavoritesFilter}
                    onSetScoreBucket={page.setSelectedScoreBucket}
                  />
                {/if}
              {/if}
            {:else}
              <!-- Full: hero with description, progress, stats -->
              <div class="relative pr-14">
                <div class="max-w-[32rem]">
                  <p class="eyebrow text-blueprint-blue">MissionPulse</p>
                  <h2
                    class="mt-3 font-display text-[clamp(2.75rem,10vw,4rem)] font-normal leading-[0.94] tracking-[-0.03em] text-text-primary"
                  >
                    {page.firstName ? `Bonjour, ${page.firstName}` : 'Radar freelance'}
                  </h2>
                  <p class="mt-6 max-w-[26rem] text-subheading leading-[1.6] text-text-subtle">
                    Surveille les pistes utiles, filtre le bruit et garde les meilleures missions à
                    portée de main.
                  </p>
                </div>
                <div
                  class="absolute right-0 top-0 flex items-center gap-2"
                  class:flex-row-reverse={page.panelSide === 'left'}
                >
                  {@render scanControl()}
                </div>
              </div>

              <ScanProgress
                isScanning={feedChromeBusy}
                progress={controller.scanProgress.percent}
                missionsFound={page.totalMissions}
                connectorName={controller.scanProgress.connectorName}
                current={controller.scanProgress.current}
                total={controller.scanProgress.total}
                statuses={controller.connectorStatuses}
              />

              {#if feedStoryNeedsAttention}
                <div class="mt-3">
                  <OperationalStoryCard
                    eyebrow="À faire maintenant"
                    title={feedStory.title}
                    description={feedStory.description}
                    severity={feedStory.severity}
                    statusLabel={feedStory.statusLabel}
                    evidence={feedStory.evidence}
                    primaryActionLabel={feedStory.primaryActionLabel}
                    primaryActionIcon={feedStory.primaryActionIcon}
                    onPrimaryAction={handleFeedStoryPrimaryAction}
                  />
                </div>
              {/if}
              {#if showAdvancedControls}
                {#if ConnectorStatusList}
                  <ConnectorStatusList
                    statuses={controller.connectorStatuses}
                    persistedStatuses={controller.persistedStatuses}
                    isScanning={feedChromeBusy}
                  />
                {/if}

                {#if !feedIsColdLoading}
                  {#if SourceHealthPanel}
                    <SourceHealthPanel
                      sources={controller.sourceStatuses as SourceStatus[]}
                      isChecking={controller.isCheckingSources}
                      compact={true}
                      scanResultCounts={page.sourceMissionCounts}
                      activeSourceFilter={page.selectedSource}
                      enabledConnectors={controller.enabledConnectorIds}
                      healthSnapshots={controller.healthSnapshots}
                      parserHealthRecords={controller.parserHealthRecords}
                      onRefresh={() => controller.checkSourceSessions()}
                      onFilterBySource={(id) => {
                        page.setSelectedSource(id as MissionSource | null);
                      }}
                      onToggleConnector={(id) => controller.handleToggleConnector(id)}
                      onRecheckConnector={(id, enable) => controller.recheckConnector(id, enable)}
                      onReconnect={handleOpenExternalUrl}
                    />
                  {/if}
                  {#if page.totalMissions > 0}
                    {#if FeedActionDashboard}
                      <FeedActionDashboard
                        summary={page.dashboardSummary}
                        insightSummary={page.insightSummary}
                        scoreDistribution={page.scoreDistribution}
                        selectedScoreBucket={page.selectedScoreBucket}
                        showNewOnly={page.showNewOnly}
                        brokenConnectorCount={brokenConnectors.length}
                        onToggleNewOnly={page.toggleNewOnly}
                        onToggleFavorites={page.toggleFavoritesFilter}
                        onSetScoreBucket={page.setSelectedScoreBucket}
                      />
                    {/if}
                  {/if}
                {/if}

                {#if !feedIsColdLoading && controller.lastScanAt}
                  <div class="mt-2">
                    {#if LastScanInfo}
                      <LastScanInfo
                        lastScanAt={controller.lastScanAt}
                        missionCount={controller.lastScanMissionCount}
                      />
                    {/if}
                  </div>
                {/if}
              {/if}

              {#if page.isOffline}
                <div
                  class="mt-3 flex items-center gap-2 rounded-xl border border-blueprint-blue/20 bg-blueprint-blue/5 px-3 py-2 text-meta text-blueprint-blue"
                >
                  <Icon name="database" size={14} />
                  <span>Mode hors ligne — Données en cache</span>
                </div>
              {/if}
              {#if page.aiStatus === 'after-download'}
                <p class="mt-2 text-center text-caption text-text-muted">
                  Scoring IA en téléchargement...
                </p>
              {:else if page.aiStatus === 'no'}
                <p class="mt-2 text-center text-caption text-text-muted">Scoring IA indisponible</p>
              {/if}
            {/if}

            {#if scanSummaryVisible && scanSummary && !feedChromeBusy}
              <div class="mt-3">
                <ScanSummaryCard summary={scanSummary} onDismiss={dismissScanSummary} />
              </div>
            {/if}
          </div>
        {/if}

        <!-- ── Auxiliary toolbar (condensed-sticky in compact mode) ── -->
        {#if feedToolbarVisible}
          <div
            class="border-t border-border-light px-5 {page.heroCompact
              ? 'sticky top-0 z-20 rounded-b-2xl bg-surface-white/90 py-2 backdrop-blur-md'
              : 'rounded-b-2xl py-3'}"
          >
            <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
              {#if feedChromeBusy}Chargement des missions en cours{/if}
            </div>

            {#if showRefinementBanner && !controller.isScanning && page.profileLoaded && page.profileNeedsCompletion && ProfileRefinementBanner}
              <ProfileRefinementBanner
                completion={page.profileCompletion}
                missingItems={page.missingProfileItems}
                onSetupProfile={() => {
                  showRefinementBanner = false;
                  if (onNavigateToProfile) {
                    onNavigateToProfile();
                    return;
                  }
                  onNavigateToOnboarding?.();
                }}
              />
            {/if}

            {#if !checklistPillDismissed && page.profileLoaded && page.profileCompletion < 100 && ProfileChecklistPill}
              <div class="flex justify-center">
                <ProfileChecklistPill
                  completion={page.profileCompletion}
                  onOpenProfile={() => {
                    if (onNavigateToProfile) {
                      onNavigateToProfile();
                      return;
                    }
                    onNavigateToOnboarding?.();
                  }}
                  onDismiss={() => {
                    checklistPillDismissed = true;
                    // Persist: the pill and the refinement banner share the same
                    // profile-completion nudge, so one dismiss state covers both.
                    showRefinementBanner = false;
                    void setProfileBannerDismissed().catch(() => {});
                  }}
                />
              </div>
            {/if}

            {#if feedChromeBusy}
              <div class="flex items-center gap-2 text-meta text-text-muted">
                <span
                  class="h-3 w-3 animate-spin rounded-full border-2 border-blueprint-blue/20 border-t-blueprint-blue"
                ></span>
                Collecte...
              </div>
            {/if}

            {#if showAdvancedControls}
              <div class="mt-2" aria-label="Presets métier du feed">
                <div class="mb-1 flex items-center justify-between gap-2">
                  <p class="text-micro font-medium uppercase tracking-[0.14em] text-text-muted">
                    Presets métier
                  </p>
                  {#if page.decisionPreset}
                    <button
                      type="button"
                      class="text-micro font-medium text-blueprint-blue hover:text-blueprint-blue/80"
                      onclick={page.clearAllFilters}
                    >
                      Réinitialiser
                    </button>
                  {/if}
                </div>
                <div class="flex gap-1.5 overflow-x-auto pb-1">
                  {#each page.decisionPresets as preset (preset.id)}
                    <button
                      type="button"
                      class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-micro font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 {preset.active
                        ? 'border-blueprint-blue/25 bg-blueprint-blue/8 text-blueprint-blue'
                        : 'border-border-light bg-surface-white text-text-secondary hover:bg-subtle-gray hover:text-text-primary'}"
                      onclick={() => page.applyDecisionPreset(preset.id)}
                      aria-pressed={preset.active}
                      disabled={preset.count === 0 && !preset.active}
                      title={preset.description}
                    >
                      <span>{preset.label}</span>
                      <span class="rounded-md bg-page-canvas px-1 py-0.5 text-micro">
                        {preset.count}
                      </span>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </section>

      {#if brokenConnectors.length > 0 && !storyCoversConnectors && ConnectorAlertBar}
        <ConnectorAlertBar
          {brokenConnectors}
          onRecheck={(connectorId) => controller.recheckConnector(connectorId)}
          onEnableAndScan={(connectorId) => controller.recheckConnector(connectorId, true)}
        />
      {/if}
    </div>
  </div>

  <!-- ── Mission feed ── -->
  <div
    bind:this={missionFeedSection}
    data-testid="mission-feed"
    class="px-4 pt-4 focus:outline-none {page.arrivalStackVisible ? 'pb-40' : 'pb-28'}"
    tabindex="-1"
    aria-labelledby="mission-feed-title"
  >
    {#if focusActive}
      <div
        data-testid="focus-lens-banner"
        class="mb-4 flex items-start gap-3 rounded-xl border border-blueprint-blue/25 bg-blueprint-blue/[0.06] px-4 py-3"
        role="status"
      >
        <div
          class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blueprint-blue/15 text-blueprint-blue"
        >
          <svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path
              d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm.75 3.75v3.69l2.47 2.47-1.06 1.06L7.25 8.06V4.75h1.5z"
            />
          </svg>
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-body-lg font-semibold text-text-primary">
            {page.focusMissions.length} mission{page.focusMissions.length > 1 ? 's' : ''} issue{page
              .focusMissions.length > 1
              ? 's'
              : ''} de la notification
          </p>
          <p class="mt-0.5 text-meta leading-5 text-text-subtle">
            Notifications · {page.focusSinceLabel}
          </p>
        </div>
        <button
          type="button"
          onclick={() => page.dismissFocus()}
          class="shrink-0 rounded-lg px-2.5 py-1.5 text-meta font-semibold text-blueprint-blue transition-colors hover:bg-blueprint-blue/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blueprint-blue/40"
          data-testid="focus-lens-dismiss"
        >
          Voir tout le feed
        </button>
      </div>
    {/if}
    {#if hasVisibleFeedMissions && !page.heroCompact}
      <div
        data-testid="mission-feed-anchor"
        class="mb-3 flex items-end justify-between gap-3 border-t border-border-light pt-4"
      >
        <div class="min-w-0">
          <p class="text-micro font-semibold uppercase tracking-[0.16em] text-text-muted">
            Missions
          </p>
          <h2 id="mission-feed-title" class="mt-1 text-body-lg font-semibold text-text-primary">
            Missions à examiner
          </h2>
          <p class="mt-1 text-meta leading-5 text-text-subtle">
            {visibleFeedMissionLabel} visible{visibleFeedMissionCount > 1 ? 's' : ''} selon vos filtres
            actuels.
          </p>
        </div>
        <span
          class="shrink-0 rounded-lg border border-border-light bg-surface-white px-2 py-1 font-mono text-meta font-semibold tabular-nums text-text-primary"
          aria-label={`${formatMissionCount(visibleFeedMissionCount)} dans la liste`}
        >
          {visibleFeedMissionCount}
        </span>
      </div>
    {:else}
      <h2 id="mission-feed-title" class="sr-only">
        {hasVisibleFeedMissions ? 'Missions à examiner' : 'Missions proposées'}
      </h2>
    {/if}
    <div
      class="rounded-xl transition-all duration-200 {activeTourStep?.id === 'expand' ||
      activeTourStep?.id === 'seen'
        ? 'ring-2 ring-blueprint-blue/40 ring-offset-2 ring-offset-page-canvas'
        : ''}"
    >
      {#if VirtualMissionFeed}
        <VirtualMissionFeed
          missions={visibleFeedMissions}
          isLoading={feedIsColdLoading}
          error={page.error}
          seenIds={page.seenIds}
          favorites={page.favorites}
          favoritePendingIds={page.favoritePendingIds}
          hidden={page.hidden}
          comparisonMissionIds={page.comparisonMissionIds}
          trackingByMissionId={tracking?.trackings ?? emptyTrackings}
          statusPendingMissionIds={trackingPendingMissionIds}
          sortBy={page.sortBy}
          resetKey={missionFeedResetKey}
          filterActive={page.filterActive || showAlertOnly}
          searchQuery={page.searchQuery}
          stableQueueActive={page.stableQueueActive}
          onMissionReadSignal={page.handleMissionReadSignal}
          onToggleFavorite={page.handleToggleFavorite}
          onHide={page.handleHide}
          onToggleCompare={page.toggleCompare}
          onStatusTransition={handleTrackingTransition}
          onCopyLink={page.handleCopyLink}
          onOpenLink={handleOpenExternalUrl}
          onInvestigateMission={(mission) => (investigationMission = mission)}
          onRetry={handleMissionFeedScanAction}
          onStartScan={handleMissionFeedScanAction}
          onClearFilters={handleClearMissionFilters}
          tourStep={activeTourStep?.id ?? null}
        />
      {:else}
        <div class="flex flex-col gap-3" aria-busy="true">
          {#each Array(3) as _, i (i)}
            <div class="section-card rounded-xl p-4">
              <div class="h-4 w-2/3 rounded bg-subtle-gray"></div>
              <div class="mt-3 h-3 w-1/2 rounded bg-subtle-gray"></div>
              <div class="mt-4 flex gap-2">
                <div class="h-6 w-16 rounded-full bg-subtle-gray"></div>
                <div class="h-6 w-20 rounded-full bg-subtle-gray"></div>
                <div class="h-6 w-14 rounded-full bg-subtle-gray"></div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
    {#if showAlertOnly}
      <button
        class="mt-3 w-full rounded-xl border border-blueprint-blue/20 bg-blueprint-blue/6 py-2.5 text-caption font-medium text-blueprint-blue transition-all duration-200 hover:bg-blueprint-blue/10"
        onclick={() => (showAlertOnly = false)}
      >
        Afficher toutes les missions
      </button>
    {/if}
    {#if page.hiddenCount > 0 && !page.showFavoritesOnly}
      <button
        class="mt-3 w-full rounded-xl border border-border-light bg-surface-white py-2.5 text-caption text-text-secondary transition-all duration-200 hover:border-disabled-gray hover:bg-subtle-gray hover:text-text-primary"
        onclick={page.toggleHiddenFilter}
        aria-pressed={page.showHidden}
      >
        {page.showHidden ? 'Masquer les ignorées' : `Voir les ignorées (${page.hiddenCount})`}
        <span class="sr-only">Raccourci clavier : h.</span>
      </button>
    {/if}
  </div>
</div>

{#if active}
  <div
    class="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4"
    data-testid="feed-bottom-dock"
  >
    <div
      class="pointer-events-auto flex w-full max-w-[26rem] items-center gap-2.5"
      aria-label="Actions du feed"
    >
      <div
        class="flex h-12 min-w-0 flex-1 items-center rounded-full border border-white/70 bg-surface-white/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_10px_28px_rgba(28,25,23,0.13),0_2px_6px_rgba(28,25,23,0.05)] backdrop-blur-xl backdrop-saturate-150 transition-colors duration-200 focus-within:border-blueprint-blue/40"
      >
        <SearchInput
          variant="dock"
          placeholder="Rechercher une mission…"
          value={page.searchQuery}
          onSearch={page.handleSearch}
          bind:inputRef={page.searchInputRef}
        />
      </div>

      <Tooltip
        label={page.showFilters ? 'Masquer les filtres' : 'Filtrer les missions'}
        description="Ouvre la grille de filtres avec mise à jour immédiate du feed."
      >
        <button
          bind:this={filterTrigger}
          type="button"
          class="soft-ring relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border backdrop-blur-xl backdrop-saturate-150 transition-[background-color,color,transform,box-shadow] duration-200 active:scale-95 {page.showFilters ||
          page.filterActive
            ? 'border-blueprint-blue/30 bg-blueprint-blue/15 text-blueprint-blue shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_28px_rgba(28,25,23,0.13)]'
            : 'border-white/70 bg-surface-white/55 text-text-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_10px_28px_rgba(28,25,23,0.13),0_2px_6px_rgba(28,25,23,0.05)] hover:bg-surface-white/80 hover:text-text-primary'}"
          onclick={() => page.setShowFilters(!page.showFilters)}
          aria-expanded={page.showFilters}
          aria-controls="filter-panel"
          aria-label={page.showFilters ? 'Masquer les filtres' : 'Afficher les filtres'}
        >
          <Icon name="sliders-horizontal" size={19} />
          {#if page.filterActive && !page.showFilters}
            <span
              class="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-surface-white bg-blueprint-blue"
              aria-hidden="true"
            ></span>
          {/if}
        </button>
      </Tooltip>

      <Tooltip
        label={showAdvancedControls ? 'Masquer les détails' : 'Détails opérationnels'}
        description="Affiche les sources, métriques et presets du feed."
      >
        <button
          type="button"
          class="soft-ring inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border backdrop-blur-xl backdrop-saturate-150 transition-[background-color,color,transform,box-shadow] duration-200 active:scale-95 {showAdvancedControls
            ? 'border-blueprint-blue/30 bg-blueprint-blue/15 text-blueprint-blue shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_28px_rgba(28,25,23,0.13)]'
            : 'border-white/70 bg-surface-white/55 text-text-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_10px_28px_rgba(28,25,23,0.13),0_2px_6px_rgba(28,25,23,0.05)] hover:bg-surface-white/80 hover:text-text-primary'}"
          onclick={toggleOperationalDetails}
          aria-expanded={showAdvancedControls}
          aria-label={showAdvancedControls
            ? 'Masquer les détails opérationnels'
            : 'Afficher les détails opérationnels'}
        >
          <Icon name="activity" size={19} />
        </button>
      </Tooltip>
    </div>
  </div>
{/if}

{#if page.showFilters && page.filterSheetDraft}
  <FeedFilterSheet
    draft={page.filterSheetDraft}
    visibleCount={page.filterSheetPreviewCount}
    sources={filterSourceOptions}
    tjmTarget={page.profileTjmMin}
    onEdit={page.editFilterSheet}
    onDismiss={page.dismissFilterSheet}
  />
{/if}

{#if page.arrivalStackVisible && MissionArrivalStack}
  <MissionArrivalStack
    count={page.arrivalStackCount}
    missions={page.arrivalPreviewMissions}
    state={page.arrivalStackState.value}
    visible={page.arrivalStackVisible}
    expanded={page.arrivalStackState.drawerOpen}
    errorMessage={page.arrivalStackState.message}
    onOpen={page.openArrivalStack}
    onClose={page.closeArrivalStack}
    onRefresh={handleApplyPendingMissions}
  />
{/if}

{#if KeyboardShortcutsHelp}
  <KeyboardShortcutsHelp bind:isOpen={page.showShortcutsHelp} />
{/if}

{#if activeTourStep && FeedTourOverlay}
  <FeedTourOverlay
    step={activeTourStep}
    stepIndex={tourStepIndex}
    totalSteps={tourSteps.length}
    onNext={advanceTour}
    onSkip={closeTour}
  />
{/if}

{#if investigationMission && MissionInvestigationDrawer}
  <MissionInvestigationDrawer
    mission={investigationMission}
    isCompared={page.comparisonMissionIds.includes(investigationMission.id)}
    compareDisabled={page.comparisonMissionIds.length >= 3 &&
      !page.comparisonMissionIds.includes(investigationMission.id)}
    isHidden={investigationMission.id in page.hidden}
    trackingStatus={tracking?.getTrackingForMission(investigationMission.id)?.currentStatus ?? null}
    trackingUpdatedAt={getTrackingUpdatedAt(investigationMission.id)}
    trackingState={tracking?.state ?? 'loading'}
    trackingError={tracking?.error?.message ?? null}
    onClose={() => (investigationMission = null)}
    onOpenLink={handleOpenExternalUrl}
    onToggleCompare={handleInvestigationToggleCompare}
    onHide={handleInvestigationHide}
    onSelectForTracking={handleInvestigationSelectForTracking}
    onRetryTracking={() => void retryTrackingLoad()}
  />
{/if}

{#if page.comparisonMissionIds.length > 0 && !arrivalDrawerExpanded}
  <div
    class="fixed left-1/2 z-40 -translate-x-1/2 flex items-center gap-3 rounded-2xl border border-blueprint-blue/20 bg-surface-white/95 backdrop-blur-sm px-4 py-2.5 shadow-xl transition-[bottom] duration-200 {page.arrivalStackVisible
      ? 'bottom-40'
      : 'bottom-24'}"
  >
    <span class="text-meta text-text-secondary">
      {page.comparisonMissionIds.length}/3 sélectionnée{page.comparisonMissionIds.length > 1
        ? 's'
        : ''}
    </span>
    {#if page.comparisonMissions.length >= 2}
      <button
        class="rounded-lg bg-blueprint-blue/10 px-3 py-1.5 text-meta font-medium text-blueprint-blue hover:bg-blueprint-blue/15 transition-colors"
        onclick={openComparison}
      >
        Comparer
      </button>
    {/if}
    <button
      class="rounded-lg px-2 py-1.5 text-meta text-text-muted hover:text-text-primary transition-colors"
      onclick={clearComparison}
    >
      Annuler
    </button>
  </div>
{/if}

{#if showComparison && page.comparisonMissions.length >= 2 && MissionComparison}
  {#key page.comparisonMissionIds.join(',')}
    <MissionComparison missions={page.comparisonMissions} onClose={closeComparison} />
  {/key}
{/if}
