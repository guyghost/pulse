<script lang="ts">
  import { createFeedStore } from '$lib/state/feed.svelte';
  import {
    createFeedController,
    type SourceStatus,
  } from '$lib/shell/facades/feed-controller.svelte';
  import { createFeedPageState } from '$lib/state/feed-page.svelte';
  import VirtualMissionFeed from '../organisms/VirtualMissionFeed.svelte';
  import { pullToRefresh } from '../actions/pull-to-refresh';
  import ScanProgress from '../organisms/ScanProgress.svelte';
  import ConnectorStatusList from '../molecules/ConnectorStatusList.svelte';
  import SearchInput from '../molecules/SearchInput.svelte';
  import { Icon } from '@pulse/ui';
  import FilterBar from '../organisms/FilterBar.svelte';
  import SourceHealthPanel from '../organisms/SourceHealthPanel.svelte';
  import LastScanInfo from '../molecules/LastScanInfo.svelte';
  import KeyboardShortcutsHelp from '../molecules/KeyboardShortcutsHelp.svelte';
  import type { MissionSource } from '$lib/core/types/mission';
  import MissionComparison from '../organisms/MissionComparison.svelte';
  import ProfileRefinementBanner from '../molecules/ProfileRefinementBanner.svelte';
  import ConnectorAlertBar from '../molecules/ConnectorAlertBar.svelte';
  import FeedTourOverlay, { type FeedTourStep } from '../molecules/FeedTourOverlay.svelte';
  import {
    getFeedTourSeen,
    getFirstScanDone,
    getProfileBannerDismissed,
    setFeedTourSeen,
  } from '$lib/shell/storage/first-scan';
  import { getProfile } from '$lib/shell/facades/settings.facade';
  import { deriveHealthStatus } from '$lib/core/health/derive-health-status';

  const { onNavigateToOnboarding }: { onNavigateToOnboarding?: () => void } = $props();

  // ============================================================
  // Initialization
  // ============================================================
  const feed = createFeedStore();
  const controller = createFeedController(feed);
  const page = createFeedPageState(feed, controller);
  page.setup();

  // Refinement banner: shown only on zero-config first scan (no profile yet)
  let showRefinementBanner = $state(false);
  let shouldAutoOpenTour = $state(false);
  let showTour = $state(false);
  let tourStepIndex = $state(0);
  let missionScrollTop = $state(0);
  let hideMissionPulseCard = $state(false);
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

  (async () => {
    const [firstScanDone, bannerDismissed, profile, feedTourSeen] = await Promise.all([
      getFirstScanDone(),
      getProfileBannerDismissed(),
      getProfile(),
      getFeedTourSeen(),
    ]);
    showRefinementBanner = firstScanDone && !bannerDismissed && !profile;
    shouldAutoOpenTour = firstScanDone && !feedTourSeen;
  })().catch(() => {});

  $effect(() => {
    if (
      shouldAutoOpenTour &&
      !showTour &&
      !controller.isScanning &&
      page.displayMissions.length > 0
    ) {
      shouldAutoOpenTour = false;
      tourStepIndex = 0;
      showTour = true;
    }
  });

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

    if (scrollingDown && nextScrollTop > 12) {
      hideMissionPulseCard = true;
      emitFeedScrollState(true, nextScrollTop);
    }

    if (scrollStopTimeout) {
      clearTimeout(scrollStopTimeout);
    }

    scrollStopTimeout = setTimeout(() => {
      hideMissionPulseCard = false;
      emitFeedScrollState(false, missionScrollTop);
    }, 260);
  }
</script>

<div class="relative flex h-full flex-col">
  <div
    class="shrink-0 grid transition-[grid-template-rows,opacity,transform,padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] {hideMissionPulseCard
      ? 'grid-rows-[0fr] px-4 pt-0 opacity-0 -translate-y-2 pointer-events-none'
      : 'grid-rows-[1fr] px-4 pt-4 opacity-100 translate-y-0'}"
  >
    <div class="min-h-0 overflow-hidden">
      <!-- ═══════════════════════════════════════════
           Hero card — greeting + filters unified
           ═══════════════════════════════════════════ -->
      <section
        class="section-card-strong relative overflow-hidden rounded-2xl transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] {hideMissionPulseCard
          ? 'scale-[0.985] opacity-0'
          : 'scale-100 opacity-100'}"
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
                  <div class="mt-1 flex items-baseline gap-3">
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
                <button
                  class="soft-ring relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-border-light bg-surface-white text-text-primary transition-all duration-200 hover:bg-subtle-gray"
                  onclick={() => controller.startScan()}
                  disabled={controller.isScanning || page.isLoading || page.isOffline}
                  title="Lancer le scan (r)"
                >
                  <Icon name="play" size={12} class="ml-0.5" />
                </button>
              </div>
            </div>
            <SourceHealthPanel
              sources={controller.sourceStatuses as SourceStatus[]}
              isChecking={controller.isCheckingSources}
              compact={true}
              scanResultCounts={controller.scanResultCounts}
              activeSourceFilter={page.selectedSource}
              enabledConnectors={controller.enabledConnectorIds}
              healthSnapshots={controller.healthSnapshots}
              onRefresh={() => controller.checkSourceSessions()}
              onFilterBySource={(id) => {
                page.setSelectedSource(id as MissionSource | null);
              }}
              onToggleConnector={(id) => controller.handleToggleConnector(id)}
              onRecheckConnector={(id, enable) => controller.recheckConnector(id, enable)}
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
                  <button
                    class="soft-ring inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 text-red-400 transition-all duration-200 hover:bg-red-500/20 hover:text-red-300"
                    onclick={() => controller.stopScan()}
                    title="Stopper le scan"
                  >
                    <Icon name="square" size={14} />
                  </button>
                {/if}
                <button
                  class="soft-ring relative inline-flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-200
                    {controller.isScanning || page.isLoading
                    ? 'border-blueprint-blue/20 bg-blueprint-blue/8'
                    : page.isOffline
                      ? 'border-border-light bg-subtle-gray text-text-muted cursor-not-allowed'
                      : 'border-border-light bg-surface-white text-text-primary hover:bg-subtle-gray'}"
                  onclick={() => controller.startScan()}
                  disabled={controller.isScanning || page.isLoading || page.isOffline}
                  title={controller.isScanning || page.isLoading
                    ? 'Scan en cours...'
                    : page.isOffline
                      ? 'Scan indisponible hors ligne'
                      : 'Lancer le scan (r)'}
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
              </div>
            </div>

            <ScanProgress
              isScanning={controller.isScanning || page.isLoading}
              progress={controller.scanProgress.percent}
              missionsFound={page.totalMissions}
              connectorName={controller.scanProgress.connectorName}
              current={controller.scanProgress.current}
              total={controller.scanProgress.total}
            />

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
                scanResultCounts={controller.scanResultCounts}
                activeSourceFilter={page.selectedSource}
                enabledConnectors={controller.enabledConnectorIds}
                healthSnapshots={controller.healthSnapshots}
                onRefresh={() => controller.checkSourceSessions()}
                onFilterBySource={(id) => {
                  page.setSelectedSource(id as MissionSource | null);
                }}
                onToggleConnector={(id) => controller.handleToggleConnector(id)}
                onRecheckConnector={(id, enable) => controller.recheckConnector(id, enable)}
              />
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
              <div class="rounded-xl border border-border-light bg-page-canvas px-3 py-2.5">
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
            <button
              class="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 transition-all duration-150
              {page.showFavoritesOnly
                ? 'border-blueprint-blue/20 bg-blueprint-blue/8 text-blueprint-blue'
                : 'border-border-light bg-surface-white text-text-secondary hover:bg-subtle-gray hover:text-text-primary'}"
              onclick={page.toggleFavoritesFilter}
              aria-pressed={page.showFavoritesOnly}
              title={page.showFavoritesOnly ? 'Voir toutes (f)' : `Favoris (${page.favoriteCount})`}
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
            <button
              class="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 transition-all duration-150
              {page.showHidden
                ? 'border-blueprint-blue/20 bg-blueprint-blue/8 text-blueprint-blue'
                : 'border-border-light bg-surface-white text-text-secondary hover:bg-subtle-gray hover:text-text-primary'}"
              onclick={page.toggleHiddenFilter}
              aria-pressed={page.showHidden}
              title={page.showHidden
                ? 'Masquer les ignorées (h)'
                : `Ignorées (${page.hiddenCount})`}
            >
              <Icon name={page.showHidden ? 'eye' : 'eye-off'} size={12} />
              <span class="hidden @[20rem]:inline text-[10px] font-medium">Ignorées</span>
              {#if page.hiddenCount > 0}
                <span class="rounded-md bg-subtle-gray px-1 py-0.5 text-[9px] font-medium"
                  >{page.hiddenCount}</span
                >
              {/if}
            </button>

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
            <button
              class="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 text-[10px] font-medium transition-all duration-150
              {page.showFilters || page.filterActive
                ? 'border-blueprint-blue/20 bg-blueprint-blue/8 text-blueprint-blue'
                : 'border-border-light bg-surface-white text-text-secondary hover:bg-subtle-gray hover:text-text-primary'}"
              onclick={() => page.setShowFilters(!page.showFilters)}
              aria-expanded={page.showFilters}
              aria-controls="filter-panel"
              title={page.showFilters ? 'Masquer les filtres' : 'Afficher les filtres'}
            >
              <Icon name="sliders-horizontal" size={12} />
              <span class="hidden @[20rem]:inline">Filtres</span>
              {#if page.filterActive}
                <span class="h-1.5 w-1.5 rounded-full bg-blueprint-blue"></span>
              {/if}
            </button>
            <button
              class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-light bg-surface-white text-text-secondary transition-all duration-150 hover:bg-subtle-gray hover:text-text-primary"
              onclick={() => (page.showShortcutsHelp = true)}
              title="Raccourcis clavier (?)"
              aria-label="Afficher l'aide des raccourcis clavier"
            >
              <Icon name="help-circle" size={12} />
            </button>
          </div>

          {#if page.showFilters}
            <div
              id="filter-panel"
              class="mt-3 border-t border-border-light pt-3"
              role="group"
              aria-label="Options de filtrage"
            >
              <FilterBar
                availableStacks={page.availableStacks}
                selectedStacks={page.selectedStacks}
                selectedSource={page.selectedSource}
                selectedRemote={page.selectedRemote}
                selectedSeniority={page.selectedSeniority}
                onToggleStack={page.toggleStack}
                onSetSource={page.setSelectedSource}
                onSetRemote={page.setSelectedRemote}
                onSetSeniority={page.setSelectedSeniority}
                onClearAll={page.clearAllFilters}
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
    class="flex-1 overflow-y-auto px-4 pb-5 transition-[padding,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] {hideMissionPulseCard
      ? 'pt-2'
      : 'pt-4'}"
    use:pullToRefresh={{ onRefresh: () => controller.startScan(), threshold: 60 }}
    onscroll={handleMissionScroll}
  >
    <div
      class="rounded-xl transition-all duration-200 {activeTourStep?.id === 'expand' ||
      activeTourStep?.id === 'seen'
        ? 'ring-2 ring-blueprint-blue/40 ring-offset-2 ring-offset-page-canvas'
        : ''}"
    >
      <VirtualMissionFeed
        missions={page.displayMissions}
        isLoading={controller.isScanning || page.isLoading}
        error={page.error}
        seenIds={page.seenIds}
        favorites={page.favorites}
        hidden={page.hidden}
        sortBy={page.sortBy}
        filterActive={page.filterActive}
        onMissionSeen={page.handleMissionSeen}
        onToggleFavorite={page.handleToggleFavorite}
        onHide={page.handleHide}
        onCopyLink={page.handleCopyLink}
        tourStep={activeTourStep?.id ?? null}
      />
    </div>
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
        onclick={() => {}}
      >
        Comparer
      </button>
    {/if}
    <button
      class="rounded-lg px-2 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
      onclick={page.clearComparison}
    >
      Annuler
    </button>
  </div>
{/if}

{#if page.comparisonMissions.length >= 2}
  {#key page.comparisonMissionIds.join(',')}
    <MissionComparison missions={page.comparisonMissions} onClose={page.clearComparison} />
  {/key}
{/if}
