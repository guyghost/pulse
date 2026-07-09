<script module lang="ts">
  import type { IconName } from '@pulse/ui';
  import type { OperationalEvidence } from '../molecules/OperationalStoryCard.svelte';

  export type FeedStorySeverity = 'critical' | 'incident' | 'attention' | 'success' | 'neutral';

  export interface FeedStory {
    severity: FeedStorySeverity;
    statusLabel: string;
    title: string;
    description: string;
    evidence: OperationalEvidence[];
    primaryActionLabel: string;
    primaryActionIcon: IconName;
  }

  export interface FeedStoryInput {
    error: string | null;
    isOffline: boolean;
    brokenConnectorCount: number;
    firstBrokenConnectorName: string | null;
    newCount: number;
    highScoreCount: number;
    visibleCount: number;
    alertEnabled: boolean;
    alertScoreThreshold: number;
  }

  function formatStoryMissionCount(count: number): string {
    return `${count} mission${count > 1 ? 's' : ''}`;
  }

  /**
   * Pure resolver for the feed operational story.
   *
   * Extracted from the FeedPage derived so the precedence rules (error vs
   * offline vs broken sources vs new/priority) are unit-testable without
   * mounting the whole page. Shell/page wiring assembles the inputs; this
   * function owns the decision tree and the copy.
   */
  export function buildFeedStory(input: FeedStoryInput): FeedStory {
    const {
      error,
      isOffline,
      brokenConnectorCount,
      firstBrokenConnectorName,
      newCount,
      highScoreCount,
      visibleCount,
      alertEnabled,
      alertScoreThreshold,
    } = input;

    const evidence: OperationalEvidence[] = [
      {
        label: 'Nouvelles',
        value: newCount,
        icon: 'sparkles',
        severity: newCount > 0 ? 'attention' : 'neutral',
      },
      {
        label: `Prioritaires ${alertScoreThreshold}+`,
        value: highScoreCount,
        icon: 'target',
        severity: highScoreCount > 0 ? 'success' : 'neutral',
      },
      {
        label: 'Sources en erreur',
        value: brokenConnectorCount,
        icon: brokenConnectorCount > 0 ? 'triangle-alert' : 'shield-check',
        severity: brokenConnectorCount > 0 ? 'critical' : 'success',
      },
    ];

    if (error) {
      // The feed list still renders cached missions, so degrade the hero
      // story to a warning rather than a critical "impossible to retrieve"
      // incident. Only escalate to critical when nothing is visible.
      if (visibleCount > 0) {
        return {
          severity: 'incident',
          statusLabel: 'Données en cache',
          title: 'Récupération interrompue — affichage en cache',
          description: `Les ${formatStoryMissionCount(visibleCount)} déjà récupérées restent disponibles. Réessayez le scan ou vérifiez vos sources.`,
          evidence,
          primaryActionLabel: 'Réessayer le scan',
          primaryActionIcon: 'refresh-cw',
        };
      }
      return {
        severity: 'critical',
        statusLabel: 'Incident',
        title: 'Impossible de récupérer les missions',
        description: 'Réessayez le scan ou vérifiez vos sources pour récupérer les missions.',
        evidence,
        primaryActionLabel: 'Réessayer le scan',
        primaryActionIcon: 'refresh-cw',
      };
    }

    if (isOffline) {
      return {
        severity: 'incident' as const,
        statusLabel: 'Hors ligne',
        title: 'Pulse affiche les données en cache',
        description:
          'Le scan est suspendu. Vous pouvez encore qualifier, filtrer et ouvrir les missions déjà stockées.',
        evidence,
        primaryActionLabel:
          visibleCount > 0
            ? `Voir les ${formatStoryMissionCount(visibleCount)} en cache`
            : 'Hors ligne',
        primaryActionIcon: visibleCount > 0 ? 'chevron-down' : 'database',
      };
    }

    if (brokenConnectorCount > 0) {
      return {
        severity: 'critical' as const,
        statusLabel: 'Action requise',
        title: `${brokenConnectorCount} source${brokenConnectorCount > 1 ? 's' : ''} à corriger avant de traiter les missions`,
        description: `${firstBrokenConnectorName ?? 'Une source'} ne remonte plus correctement. Le feed peut manquer des opportunités.`,
        evidence,
        primaryActionLabel: 'Relancer le diagnostic',
        primaryActionIcon: 'refresh-cw',
      };
    }

    if (newCount > 0) {
      return {
        severity: 'attention' as const,
        statusLabel: 'À traiter',
        title:
          highScoreCount > 0
            ? `${highScoreCount} mission${highScoreCount > 1 ? 's' : ''} prioritaire${highScoreCount > 1 ? 's' : ''} à examiner`
            : `${newCount} nouvelle${newCount > 1 ? 's' : ''} mission${newCount > 1 ? 's' : ''} à examiner`,
        description:
          highScoreCount > 0
            ? `${newCount} nouvelle${newCount > 1 ? 's' : ''} mission${newCount > 1 ? 's' : ''} au total. Commencez par celles qui dépassent le seuil ${alertScoreThreshold}+.`
            : 'Aucune urgence détectée, mais les nouvelles missions méritent une qualification rapide.',
        evidence,
        primaryActionLabel:
          highScoreCount > 0
            ? `Voir les ${formatStoryMissionCount(highScoreCount)} prioritaires`
            : `Voir les ${formatStoryMissionCount(newCount)} nouvelles`,
        primaryActionIcon: 'chevron-down',
      };
    }

    if (alertEnabled && highScoreCount > 0) {
      return {
        severity: 'success' as const,
        statusLabel: 'Priorités prêtes',
        title: `${highScoreCount} opportunité${highScoreCount > 1 ? 's' : ''} prioritaire${highScoreCount > 1 ? 's' : ''} prête${highScoreCount > 1 ? 's' : ''}`,
        description: `Elles dépassent votre seuil ${alertScoreThreshold}+. Comparez-les avant de mettre une mission en suivi.`,
        evidence,
        primaryActionLabel:
          alertScoreThreshold >= 80
            ? `Voir les ${formatStoryMissionCount(highScoreCount)} prioritaire${highScoreCount > 1 ? 's' : ''}`
            : `Voir les ${formatStoryMissionCount(highScoreCount)} prioritaires`,
        primaryActionIcon: 'chevron-down',
      };
    }

    if (visibleCount === 0) {
      return {
        severity: 'neutral' as const,
        statusLabel: 'Aucune donnée',
        title: 'Lancez un premier scan pour voir vos missions',
        description:
          'Connectez ou vérifiez les sources, puis lancez un scan pour obtenir les premières recommandations.',
        evidence,
        primaryActionLabel: 'Lancer le scan',
        primaryActionIcon: 'play',
      };
    }

    return {
      severity: 'success' as const,
      statusLabel: 'Normal',
      title: `${visibleCount} mission${visibleCount > 1 ? 's' : ''} disponible${visibleCount > 1 ? 's' : ''}, aucune priorité critique`,
      description:
        'Le système est stable. Continuez par les favoris ou relancez un scan si la veille doit être rafraîchie.',
      evidence,
      primaryActionLabel: `Voir les ${formatStoryMissionCount(visibleCount)}`,
      primaryActionIcon: 'chevron-down',
    };
  }
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
  import { slide } from 'svelte/transition';
  import ScanProgress from '../organisms/ScanProgress.svelte';
  import SearchInput from '../molecules/SearchInput.svelte';
  import { Icon, type IconName } from '@pulse/ui';
  import type { MissionSource } from '$lib/core/types/mission';
  import type { FeedTourStep } from '../molecules/FeedTourOverlay.svelte';
  import OperationalStoryCard from '../molecules/OperationalStoryCard.svelte';
  import Tooltip from '../atoms/Tooltip.svelte';
  import { getProfileBannerDismissed, setFeedTourSeen } from '$lib/shell/facades/app-flags.facade';
  import {
    getKbdCheatsheetTipSeen,
    setKbdCheatsheetTipSeen,
  } from '$lib/shell/facades/app-flags.facade';
  import { openExternalUrl } from '$lib/shell/facades/feed-data.facade';
  import { deriveHealthStatus } from '$lib/core/health/derive-health-status';
  import { getLastTransitionTime } from '$lib/core/tracking';
  import { DEFAULT_CONNECTED_ALERT_PREFERENCES } from '$lib/core/types/alert-preferences';
  import type { ConnectedAlertPreferences } from '$lib/core/types/alert-preferences';
  import { getAlertPreferences } from '$lib/shell/facades/alert-preferences.facade';
  import { showToastAction } from '$lib/shell/notifications/toast-service';
  import { subscribeMessages } from '$lib/shell/messaging/bridge';

  const {
    onNavigateToOnboarding,
    onNavigateToProfile,
  }: { onNavigateToOnboarding?: () => void; onNavigateToProfile?: () => void } = $props();

  // ============================================================
  // Initialization
  // ============================================================
  const feed = createFeedStore();
  const controller = createFeedController(feed);
  const page = createFeedPageState(feed, controller);
  page.setup();
  onDestroy(() => page.dispose());

  type TrackingStore = ReturnType<typeof import('$lib/state/tracking.svelte').createTrackingStore>;
  const emptyTrackings = new Map<string, MissionTracking>();
  let tracking = $state<TrackingStore | null>(null);
  let trackingLoadPromise: Promise<TrackingStore> | null = null;

  function loadTrackingStore(): Promise<TrackingStore> {
    if (tracking) {
      return Promise.resolve(tracking);
    }

    trackingLoadPromise ??= import('$lib/state/tracking.svelte').then(({ createTrackingStore }) => {
      if (tracking) {
        return tracking;
      }
      const store = createTrackingStore();
      tracking = store;
      store.loadTrackings().catch(() => {});
      return store;
    });

    return trackingLoadPromise;
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
  let FilterBar: typeof import('../organisms/FilterBar.svelte').default | null = $state(null);
  let KeyboardShortcutsHelp:
    typeof import('../molecules/KeyboardShortcutsHelp.svelte').default | null = $state(null);
  let MissionInvestigationDrawer:
    typeof import('../organisms/MissionInvestigationDrawer.svelte').default | null = $state(null);
  let MissionComparison: typeof import('../organisms/MissionComparison.svelte').default | null =
    $state(null);
  let ProfileRefinementBanner:
    typeof import('../molecules/ProfileRefinementBanner.svelte').default | null = $state(null);
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

  function loadFilterBar(): void {
    if (!FilterBar) {
      import('../organisms/FilterBar.svelte').then((module) => {
        FilterBar = module.default;
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

  function loadRefinementBanner(): void {
    if (!ProfileRefinementBanner) {
      import('../molecules/ProfileRefinementBanner.svelte').then((module) => {
        ProfileRefinementBanner = module.default;
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
      loadTrackingStore().catch(() => {});
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
  let missionFeedReached = $state(false);
  let alertPreferences = $state<ConnectedAlertPreferences>(DEFAULT_CONNECTED_ALERT_PREFERENCES);
  let showAlertOnly = $state(false);
  let showComparison = $state(false);
  let showAdvancedControls = $state(false);
  // Tracks whether the advanced panel was opened by the user (vs. auto-expanded
  // by a broken-connector state). Lets us auto-collapse only the auto-expand.
  let advancedControlsUserOpened = $state(false);
  // Tracks whether the user has interacted with the toggle at all. Once true,
  // the broken-connector auto-expand stops fighting the user's explicit choice
  // (e.g. they collapsed to "Vue simple" while a connector is broken).
  let advancedControlsUserInteracted = $state(false);
  let investigationMission = $state<(typeof page.displayMissions)[number] | null>(null);
  let scrollStopTimeout: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (page.showFilters) {
      loadFilterBar();
    }
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
    if (showRefinementBanner && page.profileLoaded && page.profileNeedsCompletion) {
      loadRefinementBanner();
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
        'Chaque mission affiche un score pour vous aider à repérer rapidement les opportunités les plus prometteuses.',
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

  function getMissionScore(mission: {
    scoreBreakdown?: { total?: number } | null;
    score?: number | null;
  }): number {
    return mission.scoreBreakdown?.total ?? mission.score ?? 0;
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
  const pendingMissionLabel = $derived(formatMissionCount(controller.pendingMissionCount));
  const pendingConnectorLabel = $derived(
    controller.pendingConnectorCount > 0
      ? `${controller.pendingConnectorCount} source${controller.pendingConnectorCount > 1 ? 's' : ''}`
      : 'scan terminé'
  );
  const missionFeedResetKey = $derived(
    `${page.missionListResetKey}::alert:${showAlertOnly ? 'alert' : 'all'}`
  );
  const showMissionScrollCue = $derived(
    feedChromeCompact && hasVisibleFeedMissions && !missionFeedReached && !feedIsColdLoading
  );

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
    })
  );

  function formatMissionCount(count: number): string {
    return `${count} mission${count > 1 ? 's' : ''}`;
  }

  function updateMissionFeedReached(container: HTMLElement): void {
    if (!missionFeedSection) {
      missionFeedReached = false;
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const sectionRect = missionFeedSection.getBoundingClientRect();
    missionFeedReached = sectionRect.top <= containerRect.bottom - 48;
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
      controller.startScan();
      return;
    }

    if (page.isOffline) {
      if (hasVisibleFeedMissions) {
        void scrollToMissionFeed();
      }
      return;
    }

    if (brokenConnectors.length > 0) {
      controller.recheckConnector(brokenConnectors[0].connectorId);
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

    if (hasVisibleFeedMissions) {
      void scrollToMissionFeed();
      return;
    }

    controller.startScan();
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
    if (page.isOffline || controller.isScanning || page.isLoading) {
      return;
    }
    controller.startScan();
  }

  function handleApplyPendingMissions(): void {
    controller.applyPendingMissions().catch((err) => {
      if (import.meta.env.DEV) {
        console.warn('[FeedPage] apply pending missions failed:', err);
      }
    });
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

  async function handleTrackingTransition(
    missionId: string,
    status: ApplicationStatus
  ): Promise<void> {
    const trackingStore = await loadTrackingStore();
    const previousTracking = cloneTrackingSnapshot(trackingStore.getTrackingForMission(missionId));
    await trackingStore.transitionStatus(missionId, status);
    showToastAction(`Statut: ${STATUS_LABELS[status]}`, 'success', {
      label: 'Annuler',
      onClick: () => {
        void trackingStore.restoreTracking(missionId, previousTracking);
      },
    });
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
    updateMissionFeedReached(target);

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
    const hasBroken = brokenConnectors.length > 0;
    if (hasBroken && !showAdvancedControls && !advancedControlsUserInteracted) {
      // First time a connector breaks: surface it once. After the user has
      // touched the toggle, respect their explicit choice (see "Vue simple").
      showAdvancedControls = true;
      advancedControlsUserOpened = false;
    } else if (!hasBroken && showAdvancedControls && !advancedControlsUserOpened) {
      showAdvancedControls = false;
    }
  });

  $effect(() => {
    const container = feedScrollContainer;
    missionFeedSection;
    visibleFeedMissionCount;
    page.showFilters;
    showAlertOnly;

    void tick().then(() => {
      if (container) {
        updateMissionFeedReached(container);
      }
    });
  });
</script>

<div
  bind:this={feedScrollContainer}
  data-testid="feed-scroll-container"
  class="relative h-full overflow-y-auto"
  use:pullToRefresh={{ onRefresh: () => controller.startScan(), threshold: 60 }}
  onscroll={handleMissionScroll}
>
  {#if showMissionScrollCue}
    <div
      class="pointer-events-none sticky top-[calc(100%-5.5rem)] z-40 px-4"
      data-testid="mission-scroll-cue-layer"
    >
      <button
        data-testid="mission-scroll-cue"
        class="pointer-events-auto flex w-full items-center justify-between gap-3 rounded-xl border border-blueprint-blue/20 bg-surface-white/95 px-4 py-3 text-left text-blueprint-blue shadow-subtle-3 backdrop-blur-sm transition-all duration-200 hover:border-blueprint-blue/30 hover:bg-blueprint-blue/5 focus:outline-none focus:ring-2 focus:ring-blueprint-blue/25"
        type="button"
        onclick={scrollToMissionFeed}
        aria-label={`Faire défiler vers ${visibleFeedMissionLabel}`}
        transition:slide={{ duration: 160 }}
      >
        <span class="min-w-0">
          <span class="block text-[11px] font-semibold text-text-primary"
            >Missions proposées plus bas</span
          >
          <span class="mt-0.5 block text-[10px] leading-4 text-text-subtle"
            >{visibleFeedMissionLabel} selon vos filtres. Continuez pour les comparer.</span
          >
        </span>
        <span
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blueprint-blue/8 text-blueprint-blue"
          aria-hidden="true"
        >
          <Icon name="chevron-down" size={14} />
        </span>
      </button>
    </div>
  {/if}

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
        class="section-card-strong relative overflow-visible rounded-2xl transition-[border-color,box-shadow] duration-200 ease-out {feedChromeCompact
          ? 'border-blueprint-blue/10 shadow-subtle-3'
          : ''}"
      >
        <!-- ── Hero header ── -->
        <div class="px-5 {page.heroCompact ? 'pt-2.5 pb-1.5' : 'pt-4 pb-0'}">
          {#if page.heroCompact}
            <!-- Compact: single row with stats and scan button -->
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <div>
                  <p
                    class="text-[10px] font-semibold uppercase tracking-[0.18em] text-blueprint-blue"
                  >
                    MissionPulse
                  </p>
                  <div
                    class="mt-1 flex items-baseline gap-3"
                    aria-label={`${page.visibleCount} missions visibles`}
                  >
                    <span class="text-lg font-semibold text-text-primary">{page.visibleCount}</span>
                    <span class="text-[10px] text-text-muted">missions</span>
                    {#if page.favoriteCount > 0}
                      <span class="flex items-center gap-1 text-[10px] text-blueprint-blue">
                        <Icon name="star" size={10} class="fill-blueprint-blue" />
                        {page.favoriteCount}
                      </span>
                    {/if}
                  </div>
                </div>
              </div>
              <div
                class="flex items-center gap-2"
                class:flex-row-reverse={page.panelSide === 'left'}
              >
                {#if page.isOffline}
                  <span class="text-[10px] text-blueprint-blue">
                    <Icon name="database" size={12} />
                  </span>
                {/if}
                <Tooltip
                  label={page.isOffline ? 'Scan indisponible hors ligne' : 'Lancer le scan'}
                  description={page.isOffline
                    ? 'Pulse utilise les données en cache jusqu’au retour réseau.'
                    : 'Raccourci clavier: r. Relance les sources connectées.'}
                >
                  <button
                    class="soft-ring relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-border-light bg-surface-white text-text-primary transition-all duration-200 hover:bg-subtle-gray"
                    onclick={() => controller.startScan()}
                    disabled={controller.isScanning || feedIsColdLoading || page.isOffline}
                    aria-label="Lancer le scan des missions"
                  >
                    <Icon name="play" size={12} class="ml-0.5" />
                  </button>
                </Tooltip>
              </div>
            </div>
            <div class="mt-2">
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
                  class="mt-3 font-display text-[clamp(2.75rem,10vw,5.25rem)] font-normal leading-[0.88] tracking-[-0.055em] text-text-primary"
                >
                  {page.firstName ? `Bonjour, ${page.firstName}` : 'Radar freelance'}
                </h2>
                <p class="mt-6 max-w-[26rem] text-[0.95rem] leading-[1.6] text-text-subtle">
                  Surveille les pistes utiles, filtre le bruit et garde les meilleures missions à
                  portée de main.
                </p>
              </div>
              <div
                class="absolute right-0 top-0 flex items-center gap-2"
                class:flex-row-reverse={page.panelSide === 'left'}
              >
                {#if feedChromeBusy}
                  <Tooltip
                    label="Stopper le scan"
                    description="Interrompt le scan en cours et conserve les données déjà chargées."
                  >
                    <button
                      class="soft-ring inline-flex h-9 w-9 items-center justify-center rounded-full border border-status-red/30 bg-status-red/10 text-status-red transition-all duration-200 hover:bg-status-red/15"
                      onclick={() => controller.stopScan()}
                      aria-label="Stopper le scan en cours"
                    >
                      <Icon name="square" size={14} />
                    </button>
                  </Tooltip>
                {/if}
                <Tooltip
                  label={feedChromeBusy
                    ? 'Scan en cours'
                    : page.isOffline
                      ? 'Scan indisponible hors ligne'
                      : 'Lancer le scan'}
                  description={feedChromeBusy
                    ? 'Pulse interroge les sources connectées.'
                    : page.isOffline
                      ? 'Les données en cache restent disponibles.'
                      : 'Raccourci clavier: r. Relance la détection des missions.'}
                >
                  <button
                    class="soft-ring relative inline-flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-200
                    {feedChromeBusy
                      ? 'border-blueprint-blue/20 bg-blueprint-blue/8'
                      : page.isOffline
                        ? 'border-border-light bg-subtle-gray text-text-muted cursor-not-allowed'
                        : 'border-border-light bg-surface-white text-text-primary hover:bg-subtle-gray'}"
                    onclick={() => controller.startScan()}
                    disabled={controller.isScanning || feedIsColdLoading || page.isOffline}
                    aria-label={feedChromeBusy
                      ? 'Scan en cours'
                      : page.isOffline
                        ? 'Scan indisponible hors ligne'
                        : 'Lancer le scan des missions'}
                  >
                    {#if feedChromeBusy}
                      <span class="absolute inset-0 flex items-center justify-center">
                        <span
                          class="radar-ping absolute h-8 w-8 rounded-full border border-blueprint-blue/40"
                        ></span>
                        <span
                          class="radar-ping animation-delay-500 absolute h-5 w-5 rounded-full border border-blueprint-blue/60"
                        ></span>
                        <span class="h-2 w-2 rounded-full bg-blueprint-blue"></span>
                      </span>
                    {:else}
                      <Icon name="play" size={14} class="ml-0.5" />
                    {/if}
                  </button>
                </Tooltip>
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
                class="mt-3 flex items-center gap-2 rounded-xl border border-blueprint-blue/20 bg-blueprint-blue/5 px-3 py-2 text-xs text-blueprint-blue"
              >
                <Icon name="database" size={14} />
                <span>Mode hors ligne — Données en cache</span>
              </div>
            {/if}
            {#if page.aiStatus === 'after-download'}
              <p class="mt-2 text-center text-[11px] text-text-muted">
                Scoring IA en téléchargement...
              </p>
            {:else if page.aiStatus === 'no'}
              <p class="mt-2 text-center text-[11px] text-text-muted">Scoring IA indisponible</p>
            {/if}
          {/if}
        </div>

        <!-- ── Search + Filter toolbar (condensed-sticky in compact mode) ── -->
        <div
          class="border-t border-border-light px-5 {page.heroCompact
            ? 'sticky top-0 z-20 bg-surface-white/90 py-2 backdrop-blur-md'
            : 'py-3'}"
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

          <!-- Row 1: title + search -->
          {#if feedChromeBusy}
            <div class="flex items-center gap-2 text-xs text-text-muted">
              <span
                class="h-3 w-3 animate-spin rounded-full border-2 border-blueprint-blue/20 border-t-blueprint-blue"
              ></span>
              Collecte...
            </div>
          {/if}

          <div class={feedChromeBusy ? 'mt-2' : ''}>
            <SearchInput
              value={page.searchQuery}
              onSearch={page.handleSearch}
              bind:inputRef={page.searchInputRef}
            />
          </div>

          <!-- Row 2: filter pills -->
          <div
            class="mt-2 flex items-center gap-1.5 rounded-xl transition-all duration-200 {activeTourStep?.id ===
            'filters'
              ? 'ring-2 ring-blueprint-blue/40 ring-offset-2 ring-offset-page-canvas px-1 py-1'
              : ''}"
          >
            <Tooltip
              label={page.showFavoritesOnly ? 'Voir toutes les missions' : 'Filtrer les favoris'}
              description={`Raccourci clavier: f. ${page.favoriteCount} mission${page.favoriteCount > 1 ? 's' : ''} en favori.`}
            >
              <button
                class="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 transition-all duration-150
                {page.showFavoritesOnly
                  ? 'border-blueprint-blue/20 bg-blueprint-blue/8 text-blueprint-blue'
                  : 'border-border-light bg-surface-white text-text-secondary hover:bg-subtle-gray hover:text-text-primary'}"
                onclick={page.toggleFavoritesFilter}
                aria-pressed={page.showFavoritesOnly}
                aria-label={page.showFavoritesOnly
                  ? 'Voir toutes les missions'
                  : 'Filtrer les favoris'}
              >
                <Icon
                  name="star"
                  size={12}
                  class={page.showFavoritesOnly ? 'fill-blueprint-blue' : ''}
                />
                <span class="hidden @[20rem]:inline text-[10px] font-medium">Favoris</span>
                {#if page.favoriteCount > 0}
                  <span class="rounded-md bg-subtle-gray px-1 py-0.5 text-[9px] font-medium"
                    >{page.favoriteCount}</span
                  >
                {/if}
              </button>
            </Tooltip>
            <Tooltip
              label={page.showHidden ? 'Masquer les missions ignorées' : 'Voir les ignorées'}
              description={`Raccourci clavier : h. ${page.hiddenCount} mission${page.hiddenCount > 1 ? 's' : ''} ignorée${page.hiddenCount > 1 ? 's' : ''}.`}
            >
              <button
                class="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 transition-all duration-150
                {page.showHidden
                  ? 'border-blueprint-blue/20 bg-blueprint-blue/8 text-blueprint-blue'
                  : 'border-border-light bg-surface-white text-text-secondary hover:bg-subtle-gray hover:text-text-primary'}"
                onclick={page.toggleHiddenFilter}
                aria-pressed={page.showHidden}
                aria-label={page.showHidden ? 'Masquer les missions ignorées' : 'Voir les ignorées'}
              >
                <Icon name={page.showHidden ? 'eye' : 'eye-off'} size={12} />
                <span class="hidden @[20rem]:inline text-[10px] font-medium">Ignorées</span>
                {#if page.hiddenCount > 0}
                  <span class="rounded-md bg-subtle-gray px-1 py-0.5 text-[9px] font-medium"
                    >{page.hiddenCount}</span
                  >
                {/if}
              </button>
            </Tooltip>

            <div class="h-4 w-px shrink-0 bg-border-light"></div>

            <label class="sr-only" for="sort-select">Trier par</label>
            <select
              id="sort-select"
              class="h-7 min-w-0 cursor-pointer rounded-lg border border-border-light bg-surface-white px-2 text-[10px] text-text-secondary outline-none transition-colors focus:border-blueprint-blue/30"
              bind:value={page.sortBy}
            >
              <option value="score">Pertinence</option>
              <option value="date">Date</option>
              <option value="tjm">TJM</option>
            </select>
            <Tooltip
              label={page.showFilters ? 'Masquer les filtres' : 'Afficher les filtres'}
              description={page.filterActive
                ? 'Un filtre est actif sur le feed.'
                : 'Affinez par stack, source, remote ou seniorite.'}
            >
              <button
                class="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 text-[10px] font-medium transition-all duration-150
                {page.showFilters || page.filterActive
                  ? 'border-blueprint-blue/20 bg-blueprint-blue/8 text-blueprint-blue'
                  : 'border-border-light bg-surface-white text-text-secondary hover:bg-subtle-gray hover:text-text-primary'}"
                onclick={() => page.setShowFilters(!page.showFilters)}
                aria-expanded={page.showFilters}
                aria-controls="filter-panel"
                aria-label={page.showFilters ? 'Masquer les filtres' : 'Afficher les filtres'}
              >
                <Icon name="sliders-horizontal" size={12} />
                <span class="hidden @[20rem]:inline">Filtres</span>
                {#if page.filterActive}
                  <span class="h-1.5 w-1.5 rounded-full bg-blueprint-blue"></span>
                {/if}
              </button>
            </Tooltip>
            <Tooltip
              label="Raccourcis clavier"
              description="Ouvre la liste des commandes disponibles. Raccourci: ?."
            >
              <button
                class="soft-ring inline-flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center rounded-lg border border-border-light bg-surface-white px-1.5 font-mono text-[12px] font-semibold leading-none text-text-secondary transition-all duration-150 hover:bg-subtle-gray hover:text-text-primary"
                onclick={() => (page.showShortcutsHelp = true)}
                aria-label="Afficher l'aide des raccourcis clavier"
                title="Raccourcis clavier (?)"
              >
                ?
              </button>
            </Tooltip>
          </div>

          <div class="mt-2 flex justify-end">
            <button
              type="button"
              class="rounded-lg border border-border-light bg-surface-white px-2.5 py-1.5 text-[10px] font-medium text-text-secondary transition-colors hover:bg-subtle-gray hover:text-text-primary"
              onclick={() => {
                advancedControlsUserInteracted = true;
                advancedControlsUserOpened = showAdvancedControls ? false : true;
                showAdvancedControls = !showAdvancedControls;
              }}
              aria-expanded={showAdvancedControls}
              aria-label={showAdvancedControls
                ? 'Masquer les détails opérationnels'
                : 'Afficher les détails opérationnels'}
            >
              {showAdvancedControls ? 'Vue simple' : 'Détails opérationnels'}
            </button>
          </div>

          {#if showAdvancedControls}
            <div class="mt-2" aria-label="Presets métier du feed">
              <div class="mb-1 flex items-center justify-between gap-2">
                <p class="text-[10px] font-medium uppercase tracking-[0.14em] text-text-muted">
                  Presets métier
                </p>
                {#if page.decisionPreset}
                  <button
                    type="button"
                    class="text-[10px] font-medium text-blueprint-blue hover:text-blueprint-blue/80"
                    onclick={page.clearAllFilters}
                  >
                    Réinitialiser
                  </button>
                {/if}
              </div>
              <div class="flex gap-1.5 overflow-x-auto pb-1">
                {#each page.decisionPresets as preset}
                  <button
                    type="button"
                    class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 {preset.active
                      ? 'border-blueprint-blue/25 bg-blueprint-blue/8 text-blueprint-blue'
                      : 'border-border-light bg-surface-white text-text-secondary hover:bg-subtle-gray hover:text-text-primary'}"
                    onclick={() => page.applyDecisionPreset(preset.id)}
                    aria-pressed={preset.active}
                    disabled={preset.count === 0 && !preset.active}
                    title={preset.description}
                  >
                    <span>{preset.label}</span>
                    <span class="rounded-md bg-page-canvas px-1 py-0.5 text-[9px]">
                      {preset.count}
                    </span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          {#if page.showFilters && FilterBar}
            <div
              id="filter-panel"
              class="absolute left-5 right-5 top-[calc(100%-0.5rem)] z-30 max-h-80 overflow-y-auto rounded-2xl border border-border-light bg-surface-white p-2 shadow-subtle-3"
              role="group"
              aria-label="Options de filtrage"
              transition:slide={{ duration: 160 }}
            >
              <FilterBar
                availableStacks={page.availableStacks}
                selectedStacks={page.selectedStacks}
                selectedSource={page.selectedSource}
                selectedRemote={page.selectedRemote}
                selectedSeniority={page.selectedSeniority}
                savedViews={page.savedViews}
                activeSavedViewId={page.activeSavedViewId}
                canSaveCurrentView={page.canSaveCurrentView}
                savedViewLimitReached={page.savedViewLimitReached}
                onToggleStack={page.toggleStack}
                onSetSource={page.setSelectedSource}
                onSetRemote={page.setSelectedRemote}
                onSetSeniority={page.setSelectedSeniority}
                onClearAll={page.clearAllFilters}
                onSaveView={page.saveCurrentView}
                onApplyView={page.applySavedView}
                onDeleteView={page.deleteSavedView}
              />
            </div>
          {/if}
        </div>
      </section>

      {#if brokenConnectors.length > 0 && ConnectorAlertBar}
        <ConnectorAlertBar
          {brokenConnectors}
          onRecheck={(connectorId) => controller.recheckConnector(connectorId)}
          onEnableAndScan={(connectorId) => controller.recheckConnector(connectorId, true)}
        />
      {/if}

      {#if controller.hasPendingMissions}
        <section
          class="mt-4 rounded-xl border border-blueprint-blue/20 bg-blueprint-blue/6 px-4 py-3"
          data-testid="pending-missions-banner"
          aria-live="polite"
        >
          <div class="flex items-center gap-3">
            <span
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-white text-blueprint-blue"
              aria-hidden="true"
            >
              <Icon name="download" size={15} />
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-xs font-semibold text-text-primary">
                {pendingMissionLabel} prête{controller.pendingMissionCount > 1 ? 's' : ''} à afficher
              </p>
              <p class="mt-0.5 text-[10px] leading-4 text-text-subtle">
                Le feed reste stable pendant la collecte. Appliquez les résultats quand vous êtes
                prêt. Source: {pendingConnectorLabel}.
              </p>
            </div>
            <button
              type="button"
              class="shrink-0 rounded-lg border border-blueprint-blue/20 bg-surface-white px-3 py-2 text-[11px] font-semibold text-blueprint-blue transition-colors hover:bg-blueprint-blue/8 disabled:cursor-wait disabled:opacity-60"
              onclick={handleApplyPendingMissions}
              disabled={controller.isApplyingPendingMissions}
              aria-label={`Afficher ${pendingMissionLabel} dans le feed`}
            >
              {controller.isApplyingPendingMissions ? 'Application...' : 'Afficher'}
            </button>
          </div>
        </section>
      {/if}
    </div>
  </div>

  <!-- ── Mission feed ── -->
  <div
    bind:this={missionFeedSection}
    data-testid="mission-feed"
    class="px-4 pb-28 pt-4 focus:outline-none"
    tabindex="-1"
    aria-labelledby="mission-feed-title"
  >
    {#if hasVisibleFeedMissions && !page.heroCompact}
      <div
        data-testid="mission-feed-anchor"
        class="mb-3 flex items-end justify-between gap-3 border-t border-border-light pt-4"
      >
        <div class="min-w-0">
          <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Missions
          </p>
          <h2 id="mission-feed-title" class="mt-1 text-sm font-semibold text-text-primary">
            Missions à examiner
          </h2>
          <p class="mt-1 text-xs leading-5 text-text-subtle">
            {visibleFeedMissionLabel} visible{visibleFeedMissionCount > 1 ? 's' : ''} selon vos filtres
            actuels.
          </p>
        </div>
        <span
          class="shrink-0 rounded-lg border border-border-light bg-surface-white px-2 py-1 font-mono text-xs font-semibold tabular-nums text-text-primary"
          aria-label={`${visibleFeedMissionCount} missions dans la liste`}
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
          hidden={page.hidden}
          comparisonMissionIds={page.comparisonMissionIds}
          trackingByMissionId={tracking?.trackings ?? emptyTrackings}
          sortBy={page.sortBy}
          resetKey={missionFeedResetKey}
          filterActive={page.filterActive || showAlertOnly}
          onMissionSeen={page.handleMissionSeen}
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
          {#each Array(3) as _}
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
        class="mt-3 w-full rounded-xl border border-blueprint-blue/20 bg-blueprint-blue/6 py-2.5 text-[11px] font-medium text-blueprint-blue transition-all duration-200 hover:bg-blueprint-blue/10"
        onclick={() => (showAlertOnly = false)}
      >
        Afficher toutes les missions
      </button>
    {/if}
    {#if page.hiddenCount > 0 && !page.showFavoritesOnly}
      <button
        class="mt-3 w-full rounded-xl border border-border-light bg-surface-white py-2.5 text-[11px] text-text-secondary transition-all duration-200 hover:border-disabled-gray hover:bg-subtle-gray hover:text-text-primary"
        onclick={page.toggleHiddenFilter}
        aria-pressed={page.showHidden}
      >
        {page.showHidden
          ? 'Masquer les ignorées'
          : `Voir les ${page.hiddenCount} mission${page.hiddenCount > 1 ? 's' : ''} masquée${page.hiddenCount > 1 ? 's' : ''}`}
      </button>
    {/if}
  </div>
</div>

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
    onClose={() => (investigationMission = null)}
    onOpenLink={handleOpenExternalUrl}
    onToggleCompare={handleInvestigationToggleCompare}
    onHide={handleInvestigationHide}
    onSelectForTracking={handleInvestigationSelectForTracking}
  />
{/if}

{#if page.comparisonMissionIds.length > 0}
  <div
    class="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 flex items-center gap-3 rounded-2xl border border-blueprint-blue/20 bg-surface-white/95 backdrop-blur-sm px-4 py-2.5 shadow-xl"
  >
    <span class="text-xs text-text-secondary">
      {page.comparisonMissionIds.length}/3 sélectionnée{page.comparisonMissionIds.length > 1
        ? 's'
        : ''}
    </span>
    {#if page.comparisonMissions.length >= 2}
      <button
        class="rounded-lg bg-blueprint-blue/10 px-3 py-1.5 text-xs font-medium text-blueprint-blue hover:bg-blueprint-blue/15 transition-colors"
        onclick={openComparison}
      >
        Comparer
      </button>
    {/if}
    <button
      class="rounded-lg px-2 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
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
