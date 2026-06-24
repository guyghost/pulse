<script lang="ts">
  import { createFeedStore } from '$lib/state/feed.svelte';
  import {
    createFeedController,
    type SourceStatus,
  } from '$lib/shell/facades/feed-controller.svelte';
  import { createFeedPageState } from '$lib/state/feed-page.svelte';
  import { createTrackingStore } from '$lib/state/tracking.svelte';
  import {
    STATUS_LABELS,
    type ApplicationStatus,
    type MissionTracking,
  } from '$lib/core/types/tracking';
  import VirtualMissionFeed from '../organisms/VirtualMissionFeed.svelte';
  import { pullToRefresh } from '../actions/pull-to-refresh';
  import { tick } from 'svelte';
  import { slide } from 'svelte/transition';
  import ScanProgress from '../organisms/ScanProgress.svelte';
  import ConnectorStatusList from '../molecules/ConnectorStatusList.svelte';
  import SearchInput from '../molecules/SearchInput.svelte';
  import { Icon, type IconName } from '@pulse/ui';
  import FilterBar from '../organisms/FilterBar.svelte';
  import FeedActionDashboard from '../organisms/FeedActionDashboard.svelte';
  import SourceHealthPanel from '../organisms/SourceHealthPanel.svelte';
  import LastScanInfo from '../molecules/LastScanInfo.svelte';
  import KeyboardShortcutsHelp from '../molecules/KeyboardShortcutsHelp.svelte';
  import type { MissionSource } from '$lib/core/types/mission';
  import MissionComparison from '../organisms/MissionComparison.svelte';
  import MissionInvestigationDrawer from '../organisms/MissionInvestigationDrawer.svelte';
  import ProfileRefinementBanner from '../molecules/ProfileRefinementBanner.svelte';
  import ConnectorAlertBar from '../molecules/ConnectorAlertBar.svelte';
  import FeedTourOverlay, { type FeedTourStep } from '../molecules/FeedTourOverlay.svelte';
  import OperationalStoryCard, {
    type OperationalEvidence,
  } from '../molecules/OperationalStoryCard.svelte';
  import Tooltip from '../atoms/Tooltip.svelte';
  import {
    getFirstScanDone,
    getProfileBannerDismissed,
    setFeedTourSeen,
  } from '$lib/shell/facades/app-flags.facade';
  import { openExternalUrl } from '$lib/shell/facades/feed-data.facade';
  import { getProfile } from '$lib/shell/facades/settings.facade';
  import { deriveHealthStatus } from '$lib/core/health/derive-health-status';
  import { getLastTransitionTime } from '$lib/core/tracking';
  import { DEFAULT_CONNECTED_ALERT_PREFERENCES } from '$lib/core/types/alert-preferences';
  import type { ConnectedAlertPreferences } from '$lib/core/types/alert-preferences';
  import { getAlertPreferences } from '$lib/shell/facades/alert-preferences.facade';
  import { showToastAction } from '$lib/shell/notifications/toast-service';

  const { onNavigateToOnboarding }: { onNavigateToOnboarding?: () => void } = $props();

  type FeedActionQueueTone = 'critical' | 'attention' | 'success' | 'neutral';

  type FeedActionQueueItem = {
    id: string;
    title: string;
    description: string;
    icon: IconName;
    endIcon: IconName;
    tone: FeedActionQueueTone;
    action: () => void;
    disabled?: boolean;
  };

  // ============================================================
  // Initialization
  // ============================================================
  const feed = createFeedStore();
  const controller = createFeedController(feed);
  const page = createFeedPageState(feed, controller);
  const tracking = createTrackingStore();
  page.setup();

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
  let investigationMission = $state<(typeof page.displayMissions)[number] | null>(null);
  let scrollStopTimeout: ReturnType<typeof setTimeout> | null = null;

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
  const visibleFeedMissionLabel = $derived(formatMissionCount(visibleFeedMissionCount));
  const showMissionScrollCue = $derived(
    feedChromeCompact &&
      hasVisibleFeedMissions &&
      !missionFeedReached &&
      !(controller.isScanning || page.isLoading)
  );

  const alertMatchCount = $derived.by(() => {
    if (!alertPreferences.enabled) {
      return 0;
    }
    return alertMissions.length;
  });

  const feedActionQueue = $derived.by((): FeedActionQueueItem[] => {
    const actions: FeedActionQueueItem[] = [];
    const firstBroken = brokenConnectors[0];
    const newCount = page.dashboardSummary.newCount;
    const highScoreCount = page.dashboardSummary.highScoreCount;
    const visibleCount = page.dashboardSummary.visibleCount;

    if (firstBroken) {
      actions.push({
        id: 'source-diagnostic',
        title: `Corriger ${firstBroken.connectorName}`,
        description: 'Relance le diagnostic avant de faire confiance au radar.',
        icon: 'circle-alert',
        endIcon: 'refresh-cw',
        tone: 'critical',
        action: recheckFirstBrokenConnector,
      });
    }

    if (alertMatchCount > 0) {
      actions.push({
        id: 'alert-priority',
        title: `Traiter ${formatMissionCount(alertMatchCount)} en alerte`,
        description: `Seuil ${alertPreferences.scoreThreshold}+ franchi selon vos critères.`,
        icon: 'target',
        endIcon: 'chevron-down',
        tone: 'success',
        action: showPriorityMissions,
      });
    } else if (highScoreCount > 0) {
      actions.push({
        id: 'high-score',
        title: `Isoler ${formatMissionCount(highScoreCount)} 80+`,
        description: 'Filtre les missions les plus fortes avant les insights secondaires.',
        icon: 'target',
        endIcon: 'chevron-down',
        tone: 'success',
        action: showPriorityMissions,
      });
    }

    if (newCount > 0) {
      actions.push({
        id: 'new-missions',
        title: `Qualifier ${formatMissionCount(newCount)}`,
        description: 'Affiche uniquement les missions non vues à traiter maintenant.',
        icon: 'sparkles',
        endIcon: 'chevron-down',
        tone: 'attention',
        action: showNewMissions,
      });
    }

    if (page.comparisonMissions.length >= 2) {
      actions.push({
        id: 'compare',
        title: 'Comparer la sélection',
        description: 'Départage les missions retenues avant de postuler.',
        icon: 'git-compare-arrows',
        endIcon: 'git-compare-arrows',
        tone: 'neutral',
        action: openComparison,
      });
    }

    if (actions.length < 3) {
      if (visibleCount > 0) {
        actions.push({
          id: 'mission-list',
          title: 'Passer à la liste',
          description: `${formatMissionCount(visibleCount)} visibles selon les filtres courants.`,
          icon: 'chevron-down',
          endIcon: 'chevron-down',
          tone: 'neutral',
          action: scrollToMissionFeedAction,
        });
      } else {
        actions.push({
          id: 'scan',
          title: 'Lancer le scan',
          description: 'Alimente le radar avec les sources connectées.',
          icon: 'scan-line',
          endIcon: 'play',
          tone: 'neutral',
          action: startFeedScanFromQueue,
          disabled: page.isOffline || controller.isScanning || page.isLoading,
        });
      }
    }

    return actions.slice(0, 3);
  });

  const feedStory = $derived.by(() => {
    const brokenCount = brokenConnectors.length;
    const highScoreCount = alertMatchCount;
    const newCount = page.dashboardSummary.newCount;
    const visibleCount = page.dashboardSummary.visibleCount;

    const evidence: OperationalEvidence[] = [
      {
        label: 'Nouvelles',
        value: newCount,
        icon: 'sparkles',
        severity: newCount > 0 ? 'attention' : 'neutral',
      },
      {
        label: `Alerte ${alertPreferences.scoreThreshold}+`,
        value: highScoreCount,
        icon: 'target',
        severity: highScoreCount > 0 ? 'success' : 'neutral',
      },
      {
        label: 'Sources',
        value: brokenCount,
        icon: brokenCount > 0 ? 'triangle-alert' : 'shield-check',
        severity: brokenCount > 0 ? 'critical' : 'success',
      },
    ];

    if (page.isOffline) {
      return {
        severity: 'incident' as const,
        statusLabel: 'Hors ligne',
        title: 'Pulse affiche les données en cache',
        description:
          'Le scan est suspendu. Vous pouvez encore qualifier, filtrer et ouvrir les missions déjà stockées.',
        evidence,
        primaryActionLabel:
          visibleCount > 0 ? `Voir les ${formatMissionCount(visibleCount)} en cache` : 'Hors ligne',
        primaryActionIcon: visibleCount > 0 ? 'chevron-down' : 'database',
      };
    }

    if (brokenCount > 0) {
      const firstBroken = brokenConnectors[0];
      return {
        severity: 'critical' as const,
        statusLabel: 'Action requise',
        title: `${brokenCount} source${brokenCount > 1 ? 's' : ''} à corriger avant de faire confiance au radar`,
        description: `${firstBroken?.connectorName ?? 'Une source'} ne remonte plus correctement. Le feed peut manquer des opportunités.`,
        evidence,
        primaryActionLabel: 'Relancer le diagnostic',
        primaryActionIcon: 'refresh-cw',
      };
    }

    if (newCount > 0) {
      return {
        severity: 'attention' as const,
        statusLabel: 'À traiter',
        title: `${newCount} nouvelle${newCount > 1 ? 's' : ''} mission${newCount > 1 ? 's' : ''} depuis le dernier passage`,
        description:
          highScoreCount > 0
            ? `${highScoreCount} opportunité${highScoreCount > 1 ? 's' : ''} dépasse le seuil prioritaire. Commencez par celles-ci.`
            : 'Aucune urgence détectée, mais les nouvelles missions méritent une qualification rapide.',
        evidence,
        primaryActionLabel: `Voir les ${formatMissionCount(newCount)} proposée${newCount > 1 ? 's' : ''}`,
        primaryActionIcon: 'chevron-down',
      };
    }

    if (alertPreferences.enabled && highScoreCount > 0) {
      return {
        severity: 'success' as const,
        statusLabel: 'Radar sain',
        title: `${highScoreCount} opportunité${highScoreCount > 1 ? 's' : ''} prioritaire${highScoreCount > 1 ? 's' : ''} prête${highScoreCount > 1 ? 's' : ''}`,
        description: `Le bruit est filtré selon votre alerte ${alertPreferences.scoreThreshold}+. La prochaine action utile est de comparer ces missions et d’en mettre une en suivi.`,
        evidence,
        primaryActionLabel:
          alertPreferences.scoreThreshold >= 80
            ? `Voir les ${formatMissionCount(highScoreCount)} prioritaire${highScoreCount > 1 ? 's' : ''}`
            : `Voir les ${formatMissionCount(highScoreCount)} en alerte`,
        primaryActionIcon: 'chevron-down',
      };
    }

    if (visibleCount === 0) {
      return {
        severity: 'neutral' as const,
        statusLabel: 'Aucune donnée',
        title: 'Le radar attend un premier scan',
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
      title: `${visibleCount} mission${visibleCount > 1 ? 's' : ''} disponible${visibleCount > 1 ? 's' : ''}, aucune alerte critique`,
      description:
        'Le système est stable. Continuez par les favoris ou relancez un scan si la veille doit être rafraîchie.',
      evidence,
      primaryActionLabel: `Voir les ${formatMissionCount(visibleCount)} proposée${visibleCount > 1 ? 's' : ''}`,
      primaryActionIcon: 'chevron-down',
    };
  });

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

  function recheckFirstBrokenConnector(): void {
    const firstBroken = brokenConnectors[0];
    if (!firstBroken) {
      return;
    }
    controller.recheckConnector(firstBroken.connectorId);
  }

  function showPriorityMissions(): void {
    if (alertMatchCount > 0) {
      showAlertOnly = true;
    } else if (page.selectedScoreBucket !== 'strong') {
      page.setSelectedScoreBucket('strong');
    }
    void scrollToMissionFeed();
  }

  function showNewMissions(): void {
    if (!page.showNewOnly) {
      page.toggleNewOnly();
    }
    void scrollToMissionFeed();
  }

  function scrollToMissionFeedAction(): void {
    void scrollToMissionFeed();
  }

  function startFeedScanFromQueue(): void {
    if (page.isOffline || controller.isScanning || page.isLoading) {
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
    const record = tracking.getTrackingForMission(missionId);
    return record ? getLastTransitionTime(record) : null;
  }

  async function handleTrackingTransition(
    missionId: string,
    status: ApplicationStatus
  ): Promise<void> {
    const previousTracking = cloneTrackingSnapshot(tracking.getTrackingForMission(missionId));
    await tracking.transitionStatus(missionId, status);
    showToastAction(`Statut: ${STATUS_LABELS[status]}`, 'success', {
      label: 'Annuler',
      onClick: () => {
        void tracking.restoreTracking(missionId, previousTracking);
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

  function feedActionToneClass(tone: FeedActionQueueTone): string {
    if (tone === 'critical') {
      return 'border-status-red/25 bg-status-red/6 text-status-red hover:bg-status-red/10';
    }
    if (tone === 'attention') {
      return 'border-status-orange/25 bg-status-orange/6 text-status-orange hover:bg-status-orange/10';
    }
    if (tone === 'success') {
      return 'border-blueprint-blue/20 bg-blueprint-blue/6 text-blueprint-blue hover:bg-blueprint-blue/10';
    }
    return 'border-border-light bg-surface-white text-text-primary hover:bg-subtle-gray';
  }

  (async () => {
    const [firstScanDone, bannerDismissed, profile, storedAlertPreferences] = await Promise.all([
      getFirstScanDone(),
      getProfileBannerDismissed(),
      getProfile(),
      getAlertPreferences(),
    ]);
    showRefinementBanner = firstScanDone && !bannerDismissed && !profile;
    alertPreferences = storedAlertPreferences;
    await tracking.loadTrackings();
  })().catch(() => {});

  $effect(() => {
    function handleOpenTour() {
      tourStepIndex = 0;
      showTour = true;
    }

    function handleProfileUpdated() {
      showRefinementBanner = false;
    }

    window.addEventListener('feed-tour:open', handleOpenTour);
    window.addEventListener('profile-updated', handleProfileUpdated);
    return () => {
      window.removeEventListener('feed-tour:open', handleOpenTour);
      window.removeEventListener('profile-updated', handleProfileUpdated);
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

{#snippet feedActionQueueBlock(compact: boolean)}
  <div
    class={compact
      ? 'mt-2 border-t border-border-light pt-2'
      : 'mt-3 border-t border-border-light pt-3'}
  >
    <div class="mb-2 flex items-center justify-between gap-3">
      <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
        File d’actions
      </p>
      <p class="text-[10px] text-text-muted">
        {feedActionQueue.length} priorité{feedActionQueue.length > 1 ? 's' : ''}
      </p>
    </div>
    <div
      class="grid gap-2"
      data-testid="feed-action-queue"
      aria-label="Actions prioritaires du feed"
    >
      {#each feedActionQueue as item (item.id)}
        <button
          type="button"
          class="group flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-55 {feedActionToneClass(
            item.tone
          )}"
          onclick={item.action}
          disabled={item.disabled}
          aria-label={`Action prioritaire: ${item.title}. ${item.description}`}
        >
          <span
            class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-white/80"
            aria-hidden="true"
          >
            <Icon name={item.icon} size={14} />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-xs font-semibold text-text-primary">{item.title}</span>
            <span class="mt-0.5 block text-[10px] leading-4 text-text-subtle">
              {item.description}
            </span>
          </span>
          <Icon
            name={item.endIcon}
            size={13}
            class="shrink-0 opacity-55 transition-opacity group-hover:opacity-100"
          />
        </button>
      {/each}
    </div>
  </div>
{/snippet}

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
        aria-label={`Faire défiler vers ${visibleFeedMissionLabel} proposée${visibleFeedMissionCount > 1 ? 's' : ''}`}
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
        <div class="px-5 {page.heroCompact ? 'pt-3 pb-2' : 'pt-4 pb-0'}">
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
                    disabled={controller.isScanning || page.isLoading || page.isOffline}
                    aria-label="Lancer le scan des missions"
                  >
                    <Icon name="play" size={12} class="ml-0.5" />
                  </button>
                </Tooltip>
              </div>
            </div>
            <SourceHealthPanel
              sources={controller.sourceStatuses as SourceStatus[]}
              isChecking={controller.isCheckingSources}
              compact={true}
              scanResultCounts={page.sourceMissionCounts}
              activeSourceFilter={page.selectedSource}
              enabledConnectors={controller.enabledConnectorIds}
              healthSnapshots={controller.healthSnapshots}
              onRefresh={() => controller.checkSourceSessions()}
              onFilterBySource={(id) => {
                page.setSelectedSource(id as MissionSource | null);
              }}
              onToggleConnector={(id) => controller.handleToggleConnector(id)}
              onRecheckConnector={(id, enable) => controller.recheckConnector(id, enable)}
              onReconnect={handleOpenExternalUrl}
            />
            <div class="mt-3">
              <OperationalStoryCard
                eyebrow="Situation"
                title={feedStory.title}
                description={feedStory.description}
                severity={feedStory.severity}
                statusLabel={feedStory.statusLabel}
                evidence={feedStory.evidence}
                compact={true}
                primaryActionLabel={feedStory.primaryActionLabel}
                primaryActionIcon={feedStory.primaryActionIcon}
                onPrimaryAction={handleFeedStoryPrimaryAction}
              />
            </div>
            {@render feedActionQueueBlock(true)}
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
                {#if controller.isScanning || page.isLoading}
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
                  label={controller.isScanning || page.isLoading
                    ? 'Scan en cours'
                    : page.isOffline
                      ? 'Scan indisponible hors ligne'
                      : 'Lancer le scan'}
                  description={controller.isScanning || page.isLoading
                    ? 'Pulse interroge les sources connectées.'
                    : page.isOffline
                      ? 'Les données en cache restent disponibles.'
                      : 'Raccourci clavier: r. Relance la détection des missions.'}
                >
                  <button
                    class="soft-ring relative inline-flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-200
                    {controller.isScanning || page.isLoading
                      ? 'border-blueprint-blue/20 bg-blueprint-blue/8'
                      : page.isOffline
                        ? 'border-border-light bg-subtle-gray text-text-muted cursor-not-allowed'
                        : 'border-border-light bg-surface-white text-text-primary hover:bg-subtle-gray'}"
                    onclick={() => controller.startScan()}
                    disabled={controller.isScanning || page.isLoading || page.isOffline}
                    aria-label={controller.isScanning || page.isLoading
                      ? 'Scan en cours'
                      : page.isOffline
                        ? 'Scan indisponible hors ligne'
                        : 'Lancer le scan des missions'}
                  >
                    {#if controller.isScanning || page.isLoading}
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
              isScanning={controller.isScanning || page.isLoading}
              progress={controller.scanProgress.percent}
              missionsFound={page.totalMissions}
              connectorName={controller.scanProgress.connectorName}
              current={controller.scanProgress.current}
              total={controller.scanProgress.total}
              statuses={controller.connectorStatuses}
            />

            <div class="mt-3">
              <OperationalStoryCard
                eyebrow="Situation"
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
            {@render feedActionQueueBlock(false)}

            <ConnectorStatusList
              statuses={controller.connectorStatuses}
              persistedStatuses={controller.persistedStatuses}
              isScanning={controller.isScanning || page.isLoading}
            />

            {#if !(controller.isScanning || page.isLoading)}
              <SourceHealthPanel
                sources={controller.sourceStatuses as SourceStatus[]}
                isChecking={controller.isCheckingSources}
                compact={true}
                scanResultCounts={page.sourceMissionCounts}
                activeSourceFilter={page.selectedSource}
                enabledConnectors={controller.enabledConnectorIds}
                healthSnapshots={controller.healthSnapshots}
                onRefresh={() => controller.checkSourceSessions()}
                onFilterBySource={(id) => {
                  page.setSelectedSource(id as MissionSource | null);
                }}
                onToggleConnector={(id) => controller.handleToggleConnector(id)}
                onRecheckConnector={(id, enable) => controller.recheckConnector(id, enable)}
                onReconnect={handleOpenExternalUrl}
              />
              {#if page.totalMissions > 0}
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

            {#if !(controller.isScanning || page.isLoading) && controller.lastScanAt}
              <div class="mt-2">
                <LastScanInfo
                  lastScanAt={controller.lastScanAt}
                  missionCount={controller.lastScanMissionCount}
                />
              </div>
            {/if}

            {#if page.isOffline}
              <div
                class="mt-3 flex items-center gap-2 rounded-xl border border-blueprint-blue/20 bg-blueprint-blue/5 px-3 py-2 text-xs text-blueprint-blue"
              >
                <Icon name="database" size={14} />
                <span>Mode hors ligne — Données en cache</span>
              </div>
            {/if}

            <div class="mt-6 grid grid-cols-3 gap-3">
              <div
                class="rounded-xl border border-border-light bg-page-canvas px-3 py-2.5"
                aria-label={`${page.visibleCount} missions visibles`}
              >
                <p class="text-[11px] uppercase tracking-[0.18em] text-text-muted">Visibles</p>
                <p class="mt-2 text-xl font-semibold text-text-primary">{page.visibleCount}</p>
              </div>
              <div class="rounded-xl border border-border-light bg-page-canvas px-3 py-2.5">
                <p class="text-[11px] uppercase tracking-[0.18em] text-text-muted">Favoris</p>
                <p class="mt-2 text-xl font-semibold text-text-primary">{page.favoriteCount}</p>
              </div>
              <div class="rounded-xl border border-border-light bg-page-canvas px-3 py-2.5">
                <p class="text-[11px] uppercase tracking-[0.18em] text-text-muted">Masquées</p>
                <p class="mt-2 text-xl font-semibold text-text-primary">{page.hiddenCount}</p>
              </div>
            </div>
            {#if page.aiStatus === 'after-download'}
              <p class="mt-2 text-center text-[11px] text-text-muted">
                Scoring IA en téléchargement...
              </p>
            {:else if page.aiStatus === 'no'}
              <p class="mt-2 text-center text-[11px] text-text-muted">Scoring IA indisponible</p>
            {/if}
          {/if}
        </div>

        <!-- ── Search + Filter toolbar ── -->
        <div class="border-t border-border-light px-5 py-3">
          <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {#if controller.isScanning || page.isLoading}Chargement des missions en cours{/if}
          </div>

          {#if showRefinementBanner && !controller.isScanning}
            <ProfileRefinementBanner
              onSetupProfile={() => {
                showRefinementBanner = false;
                onNavigateToOnboarding?.();
              }}
            />
          {/if}

          <!-- Row 1: title + search -->
          {#if controller.isScanning || page.isLoading}
            <div class="flex items-center gap-2 text-xs text-text-muted">
              <span
                class="h-3 w-3 animate-spin rounded-full border-2 border-blueprint-blue/20 border-t-blueprint-blue"
              ></span>
              Scraping...
            </div>
          {/if}

          <div class={controller.isScanning || page.isLoading ? 'mt-2' : ''}>
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
              label={page.showHidden ? 'Masquer les missions ignorees' : 'Voir les ignorees'}
              description={`Raccourci clavier: h. ${page.hiddenCount} mission${page.hiddenCount > 1 ? 's' : ''} ignoree${page.hiddenCount > 1 ? 's' : ''}.`}
            >
              <button
                class="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 transition-all duration-150
                {page.showHidden
                  ? 'border-blueprint-blue/20 bg-blueprint-blue/8 text-blueprint-blue'
                  : 'border-border-light bg-surface-white text-text-secondary hover:bg-subtle-gray hover:text-text-primary'}"
                onclick={page.toggleHiddenFilter}
                aria-pressed={page.showHidden}
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
                class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-light bg-surface-white text-text-secondary transition-all duration-150 hover:bg-subtle-gray hover:text-text-primary"
                onclick={() => (page.showShortcutsHelp = true)}
                aria-label="Afficher l'aide des raccourcis clavier"
              >
                <Icon name="help-circle" size={12} />
              </button>
            </Tooltip>
          </div>

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

          {#if page.showFilters}
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

      {#if brokenConnectors.length > 0}
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
    class="px-4 pb-28 pt-4 focus:outline-none"
    tabindex="-1"
    aria-labelledby="mission-feed-title"
  >
    {#if hasVisibleFeedMissions}
      <div
        data-testid="mission-feed-anchor"
        class="mb-3 flex items-end justify-between gap-3 border-t border-border-light pt-4"
      >
        <div class="min-w-0">
          <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Investigation
          </p>
          <h2 id="mission-feed-title" class="mt-1 text-sm font-semibold text-text-primary">
            Missions proposées
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
      <h2 id="mission-feed-title" class="sr-only">Missions proposées</h2>
    {/if}
    <div
      class="rounded-xl transition-all duration-200 {activeTourStep?.id === 'expand' ||
      activeTourStep?.id === 'seen'
        ? 'ring-2 ring-blueprint-blue/40 ring-offset-2 ring-offset-page-canvas'
        : ''}"
    >
      <VirtualMissionFeed
        missions={visibleFeedMissions}
        isLoading={controller.isScanning || page.isLoading}
        error={page.error}
        seenIds={page.seenIds}
        favorites={page.favorites}
        hidden={page.hidden}
        comparisonMissionIds={page.comparisonMissionIds}
        trackingByMissionId={tracking.trackings}
        sortBy={page.sortBy}
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

<KeyboardShortcutsHelp bind:isOpen={page.showShortcutsHelp} />

{#if activeTourStep}
  <FeedTourOverlay
    step={activeTourStep}
    stepIndex={tourStepIndex}
    totalSteps={tourSteps.length}
    onNext={advanceTour}
    onSkip={closeTour}
  />
{/if}

{#if investigationMission}
  <MissionInvestigationDrawer
    mission={investigationMission}
    isCompared={page.comparisonMissionIds.includes(investigationMission.id)}
    compareDisabled={page.comparisonMissionIds.length >= 3 &&
      !page.comparisonMissionIds.includes(investigationMission.id)}
    isHidden={investigationMission.id in page.hidden}
    trackingStatus={tracking.getTrackingForMission(investigationMission.id)?.currentStatus ?? null}
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

{#if showComparison && page.comparisonMissions.length >= 2}
  {#key page.comparisonMissionIds.join(',')}
    <MissionComparison missions={page.comparisonMissions} onClose={closeComparison} />
  {/key}
{/if}
