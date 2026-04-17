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
  import Icon from '../atoms/Icon.svelte';
  import FilterBar from '../organisms/FilterBar.svelte';
  import SourceHealthPanel from '../organisms/SourceHealthPanel.svelte';
  import LastScanInfo from '../molecules/LastScanInfo.svelte';
  import KeyboardShortcutsHelp from '../molecules/KeyboardShortcutsHelp.svelte';
  import type { MissionSource } from '$lib/core/types/mission';
  import MissionComparison from '../organisms/MissionComparison.svelte';
  import ProfileRefinementBanner from '../molecules/ProfileRefinementBanner.svelte';
  import FeedTourOverlay, { type FeedTourStep } from '../molecules/FeedTourOverlay.svelte';
  import {
    getFeedTourSeen,
    getFirstScanDone,
    getProfileBannerDismissed,
    setFeedTourSeen,
  } from '$lib/shell/storage/first-scan';
  import { getProfile } from '$lib/shell/facades/settings.facade';

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

    window.addEventListener('feed-tour:open', handleOpenTour);
    return () => window.removeEventListener('feed-tour:open', handleOpenTour);
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
</script>

<div class="relative flex h-full flex-col">
  <div class="shrink-0 px-4 pt-4">
    <section
      class="section-card-strong relative overflow-hidden rounded-[1.75rem] px-4 transition-all duration-300"
      class:py-4={!page.heroCompact}
      class:py-3={page.heroCompact}
    >
      <div
        class="pointer-events-none absolute -right-8 top-0 h-28 w-28 rounded-full bg-accent-blue/14 blur-3xl"
      ></div>
      {#if !page.heroCompact}
        <div
          class="pointer-events-none absolute bottom-0 left-10 h-20 w-20 rounded-full bg-accent-emerald/10 blur-2xl"
        ></div>
      {/if}
      <div class="relative">
        {#if page.heroCompact}
          <!-- Compact: single row with stats and scan button -->
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <div>
                <p
                  class="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-blue/80"
                >
                  MissionPulse
                </p>
                <div class="mt-1 flex items-baseline gap-3">
                  <span class="text-lg font-semibold text-white">{page.visibleCount}</span>
                  <span class="text-[10px] text-text-muted">missions</span>
                  {#if page.favoriteCount > 0}
                    <span class="flex items-center gap-1 text-[10px] text-accent-amber">
                      <Icon name="star" size={10} class="fill-accent-amber" />
                      {page.favoriteCount}
                    </span>
                  {/if}
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2" class:flex-row-reverse={page.panelSide === 'left'}>
              {#if page.isOffline}
                <span class="text-[10px] text-accent-amber">
                  <Icon name="database" size={12} />
                </span>
              {/if}
              <button
                class="soft-ring relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white transition-all duration-200 hover:bg-white/10"
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
            onRefresh={() => controller.checkSourceSessions()}
            onFilterBySource={(id) => {
              page.setSelectedSource(id as MissionSource | null);
            }}
            onToggleConnector={(id) => controller.handleToggleConnector(id)}
          />
        {:else}
          <!-- Full: hero with description, progress, stats -->
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="eyebrow text-accent-blue/80">MissionPulse</p>
              <h2 class="mt-2 text-[1.65rem] font-semibold leading-none text-white">
                {page.firstName ? `Bonjour, ${page.firstName}` : 'Radar freelance'}
              </h2>
              <p class="mt-3 max-w-80 text-sm leading-relaxed text-text-secondary">
                Surveille les pistes utiles, filtre le bruit et garde les meilleures missions a
                portee de main.
              </p>
            </div>
            <div class="flex items-center gap-2" class:flex-row-reverse={page.panelSide === 'left'}>
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
                  ? 'border-accent-blue/30 bg-accent-blue/10'
                  : page.isOffline
                    ? 'border-white/5 bg-white/3 text-text-muted cursor-not-allowed'
                    : 'border-white/10 bg-white/6 text-white hover:bg-white/10'}"
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
                      class="radar-ping absolute h-8 w-8 rounded-full border border-accent-blue/40"
                    ></span>
                    <span
                      class="radar-ping animation-delay-500 absolute h-5 w-5 rounded-full border border-accent-blue/60"
                    ></span>
                    <span class="h-2 w-2 rounded-full bg-accent-blue"></span>
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
              compact={controller.scanCompleted}
              scanResultCounts={controller.scanResultCounts}
              activeSourceFilter={page.selectedSource}
              enabledConnectors={controller.enabledConnectorIds}
              onRefresh={() => controller.checkSourceSessions()}
              onFilterBySource={(id) => {
                page.setSelectedSource(id as MissionSource | null);
              }}
              onToggleConnector={(id) => controller.handleToggleConnector(id)}
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
              class="mt-3 flex items-center gap-2 rounded-xl border border-accent-amber/20 bg-accent-amber/5 px-3 py-2 text-xs text-accent-amber"
            >
              <Icon name="database" size={14} />
              <span>Mode hors ligne — Données en cache</span>
            </div>
          {/if}

          <div class="mt-4 grid grid-cols-3 gap-2">
            <div class="rounded-[1.25rem] border border-white/8 bg-white/5 px-3 py-3">
              <p class="text-[11px] uppercase tracking-[0.18em] text-text-muted">Visibles</p>
              <p class="mt-2 text-xl font-semibold text-white">
                {page.visibleCount}
              </p>
            </div>
            <div class="rounded-[1.25rem] border border-white/8 bg-white/4 px-3 py-3">
              <p class="text-[11px] uppercase tracking-[0.18em] text-text-muted">Favoris</p>
              <p class="mt-2 text-xl font-semibold text-accent-amber">
                {page.favoriteCount}
              </p>
            </div>
            <div class="rounded-[1.25rem] border border-white/8 bg-white/4 px-3 py-3">
              <p class="text-[11px] uppercase tracking-[0.18em] text-text-muted">Masquées</p>
              <p class="mt-2 text-xl font-semibold text-text-primary">
                {page.hiddenCount}
              </p>
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
    </section>

    <section
      class="section-card relative overflow-hidden mt-4 rounded-[1.4rem] p-3 @container"
      aria-label="Missions triées"
    >
      <div
        class="pointer-events-none absolute -left-4 top-0 h-24 w-24 rounded-full bg-accent-emerald/8 blur-2xl"
      ></div>

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

      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <h3 class="text-sm font-semibold tracking-tight text-white">Missions triées</h3>
          {#if !(controller.isScanning || page.isLoading)}
            <span
              class="inline-flex items-center gap-1.5 rounded-full border border-accent-emerald/15 bg-accent-emerald/8 px-2 py-0.5 text-[10px] font-medium text-accent-emerald/90 {activeTourStep?.id ===
              'score'
                ? 'ring-2 ring-accent-blue/50 ring-offset-2 ring-offset-navy-900'
                : ''}"
              aria-label="{page.visibleCount} missions visibles"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-accent-emerald"></span>
              {page.visibleCount}
            </span>
          {/if}
        </div>
        {#if controller.isScanning || page.isLoading}
          <span class="flex items-center gap-2 text-xs text-text-muted" aria-hidden="true">
            <span
              class="h-3 w-3 animate-spin rounded-full border-2 border-accent-blue/30 border-t-accent-blue"
            ></span>
            Scraping...
          </span>
        {/if}
      </div>

      <div class="mt-2">
        <SearchInput
          value={page.searchQuery}
          onSearch={page.handleSearch}
          bind:inputRef={page.searchInputRef}
        />
      </div>

      <div
        class="mt-2 flex items-center gap-1.5 rounded-[1.1rem] transition-all duration-200 {activeTourStep?.id ===
        'filters'
          ? 'ring-2 ring-accent-blue/45 ring-offset-2 ring-offset-navy-900 px-1 py-1'
          : ''}"
      >
        <button
          class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2 @[20rem]:px-3 transition-all duration-200
                        {page.showFavoritesOnly
            ? 'border-accent-amber/35 bg-accent-amber/15 text-accent-amber shadow-glow-amber'
            : 'border-white/8 bg-white/4 text-text-secondary hover:bg-white/8 hover:text-white'}"
          onclick={page.toggleFavoritesFilter}
          aria-pressed={page.showFavoritesOnly}
          title={page.showFavoritesOnly ? 'Voir toutes (f)' : `Favoris (${page.favoriteCount})`}
        >
          <Icon name="star" size={14} class={page.showFavoritesOnly ? 'fill-accent-amber' : ''} />
          <span class="hidden @[20rem]:inline text-[11px] font-medium">Favoris</span>
          {#if page.favoriteCount > 0}
            <span class="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-medium"
              >{page.favoriteCount}</span
            >
          {/if}
        </button>
        <button
          class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2 @[20rem]:px-3 transition-all duration-200
                        {page.showHidden
            ? 'border-accent-blue/35 bg-accent-blue/15 text-accent-blue shadow-glow-blue'
            : 'border-white/8 bg-white/4 text-text-secondary hover:bg-white/8 hover:text-white'}"
          onclick={page.toggleHiddenFilter}
          aria-pressed={page.showHidden}
          title={page.showHidden ? 'Masquer les ignorées (h)' : `Ignorées (${page.hiddenCount})`}
        >
          <Icon name={page.showHidden ? 'eye' : 'eye-off'} size={14} />
          <span class="hidden @[20rem]:inline text-[11px] font-medium">Ignorées</span>
          {#if page.hiddenCount > 0}
            <span class="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-medium"
              >{page.hiddenCount}</span
            >
          {/if}
        </button>

        <div
          class="h-5 w-px shrink-0 bg-linear-to-b from-transparent via-white/15 to-transparent"
        ></div>

        <label class="sr-only" for="sort-select">Trier par</label>
        <select
          id="sort-select"
          class="h-8 min-w-0 cursor-pointer rounded-full border border-white/8 bg-white/4 px-2.5 text-[11px] text-text-secondary outline-none transition-colors focus:border-accent-blue/40 focus:bg-white/6"
          bind:value={page.sortBy}
        >
          <option value="score">Pertinence</option>
          <option value="date">Date</option>
          <option value="tjm">TJM</option>
        </select>
        <button
          class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2 @[20rem]:px-2.5 text-[11px] font-medium transition-all duration-200
                        {page.showFilters || page.filterActive
            ? 'border-accent-blue/35 bg-accent-blue/15 text-accent-blue shadow-glow-blue'
            : 'border-white/8 bg-white/4 text-text-secondary hover:bg-white/8 hover:text-white'}"
          onclick={() => page.setShowFilters(!page.showFilters)}
          aria-expanded={page.showFilters}
          aria-controls="filter-panel"
          title={page.showFilters ? 'Masquer les filtres' : 'Afficher les filtres'}
        >
          <Icon name="sliders-horizontal" size={13} />
          <span class="hidden @[20rem]:inline">Filtres</span>
          {#if page.filterActive}
            <span class="h-1.5 w-1.5 rounded-full bg-accent-blue shadow-glow-blue"></span>
          {/if}
        </button>
        <button
          class="soft-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/4 text-text-secondary transition-all duration-200 hover:bg-white/8 hover:text-white"
          onclick={() => (page.showShortcutsHelp = true)}
          title="Raccourcis clavier (?)"
          aria-label="Afficher l'aide des raccourcis clavier"
        >
          <Icon name="help-circle" size={14} />
        </button>
      </div>

      {#if page.showFilters}
        <div
          id="filter-panel"
          class="mt-3 border-t border-white/8 pt-3"
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
    </section>
  </div>

  <div
    class="flex-1 overflow-y-auto px-4 pb-5 pt-4"
    use:pullToRefresh={{ onRefresh: () => controller.startScan(), threshold: 60 }}
  >
    <div
      class="rounded-[1.5rem] transition-all duration-200 {activeTourStep?.id === 'expand' ||
      activeTourStep?.id === 'seen'
        ? 'ring-2 ring-accent-blue/45 ring-offset-2 ring-offset-navy-900'
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
        class="mt-3 w-full rounded-full border border-white/8 bg-white/4 py-3 text-xs text-text-secondary transition-all duration-200 hover:border-white/12 hover:bg-white/8 hover:text-white"
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
  <!-- Floating comparison bar -->
  <div
    class="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 flex items-center gap-3 rounded-2xl border border-accent-blue/30 bg-navy-800/95 backdrop-blur-sm px-4 py-2.5 shadow-xl"
  >
    <span class="text-xs text-text-secondary">
      {page.comparisonMissionIds.length}/3 sélectionnée{page.comparisonMissionIds.length > 1
        ? 's'
        : ''}
    </span>
    {#if page.comparisonMissions.length >= 2}
      <button
        class="rounded-lg bg-accent-blue/20 px-3 py-1.5 text-xs font-medium text-accent-blue hover:bg-accent-blue/30 transition-colors"
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
