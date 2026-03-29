<script lang="ts">
  import { createFeedStore } from '$lib/state/feed.svelte';
  import {
    createFeedController,
    type SourceStatus,
  } from '$lib/shell/facades/feed-controller.svelte';
  import VirtualMissionFeed from '../organisms/VirtualMissionFeed.svelte';
  import { pullToRefresh } from '../actions/pull-to-refresh';
  import ScanProgress from '../organisms/ScanProgress.svelte';
  import ConnectorStatusList from '../molecules/ConnectorStatusList.svelte';
  import SearchInput from '../molecules/SearchInput.svelte';
  import Icon from '../atoms/Icon.svelte';
  import FilterBar from '../organisms/FilterBar.svelte';
  import KeyboardShortcutsHelp from '../molecules/KeyboardShortcutsHelp.svelte';
  import type { MissionSource, RemoteType } from '$lib/core/types/mission';
  import {
    getSeenIds,
    saveSeenIds,
    getFavorites,
    saveFavorites,
    getHidden,
    saveHidden,
    markAsSeen,
    toggleFavorite,
    toggleHidden,
    filterHidden,
    filterFavoritesOnly,
    getProfile,
    resetNewMissionCount,
  } from '$lib/shell/facades/feed-data.facade';
  import { getPanelSide, type PanelSide } from '$lib/shell/ui/panel-layout';
  import { isPromptApiAvailable, type AiAvailability } from '$lib/shell/ai/capabilities';
  import {
    registerShortcuts,
    FeedShortcuts,
    type ShortcutConfig,
  } from '$lib/shell/utils/keyboard-shortcuts';
  import { subscribeToConnection, type ConnectionInfo } from '$lib/shell/utils/connection-monitor';

  // ============================================================
  // Feed store and controller
  // ============================================================
  const feed = createFeedStore();
  const controller = createFeedController(feed);

  // ============================================================
  // Derived state from feed store
  // ============================================================
  let missions = $derived(feed.filteredMissions);
  let isLoading = $derived(feed.state === 'loading');
  let error = $derived(feed.error);
  let searchQuery = $derived(feed.searchQuery);
  let totalMissions = $derived(missions.length);

  // ============================================================
  // UI-only state
  // ============================================================
  let seenIds = $state<string[]>([]);
  let favorites = $state<Record<string, number>>({});
  let hidden = $state<Record<string, number>>({});
  let sortBy = $state<'score' | 'date' | 'tjm'>('score');
  let showFavoritesOnly = $state(false);
  let showHidden = $state(false);
  let showFilters = $state(false);
  let selectedStacks = $state<string[]>([]);
  let selectedSource = $state<MissionSource | null>(null);
  let selectedRemote = $state<RemoteType | null>(null);
  let firstName = $state('');
  let panelSide = $state<PanelSide>('right');
  let aiStatus = $state<AiAvailability>('no');
  let showShortcutsHelp = $state(false);
  let searchInputRef = $state<HTMLInputElement | null>(null);
  let connectionStatus = $state<ConnectionInfo['status']>('unknown');

  // ============================================================
  // Derived UI state
  // ============================================================
  let favoriteCount = $derived(Object.keys(favorites).length);
  let hiddenCount = $derived(Object.keys(hidden).length);
  let isOffline = $derived(connectionStatus === 'offline');
  let heroCompact = $derived(totalMissions > 0 && !isLoading);

  let filterActive = $derived(
    selectedSource !== null || selectedRemote !== null || selectedStacks.length > 0
  );

  let availableStacks = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const m of missions) {
      for (const s of m.stack) {
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  });

  // displayMissions combines controller state with UI filters
  let displayMissions = $derived.by(() => {
    let result = missions ?? [];
    // Hide missions from disabled connectors
    if (controller.enabledConnectorIds.size > 0) {
      result = result.filter((m) => controller.enabledConnectorIds.has(m.source));
    }
    if (showFavoritesOnly) {
      result = filterFavoritesOnly(result, favorites);
    }
    if (!showHidden) {
      result = filterHidden(result, hidden);
    }
    if (selectedSource) {
      result = result.filter((m) => m.source === selectedSource);
    }
    if (selectedRemote) {
      result = result.filter((m) => m.remote === selectedRemote);
    }
    if (selectedStacks.length > 0) {
      result = result.filter((m) => selectedStacks.some((s) => m.stack.includes(s)));
    }
    return result;
  });

  let visibleCount = $derived(displayMissions.length);

  // Dev logging
  if (import.meta.env.DEV) {
    $effect(() => {
      console.log(
        '[FeedPage] state:',
        feed.state,
        'missions:',
        missions?.length ?? 0,
        'displayMissions:',
        displayMissions.length,
        'visibleCount:',
        visibleCount
      );
    });
  }

  // ============================================================
  // Effects: Load UI-only data on mount
  // ============================================================
  $effect(() => {
    getSeenIds()
      .then((ids) => {
        seenIds = ids;
      })
      .catch(() => {});
  });

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

  $effect(() => {
    getProfile()
      .then((p) => {
        if (p?.firstName) firstName = p.firstName;
      })
      .catch(() => {});
  });

  $effect(() => {
    getPanelSide().then((side) => {
      panelSide = side;
    });
  });

  $effect(() => {
    isPromptApiAvailable()
      .then((status) => {
        aiStatus = status;
      })
      .catch(() => {});
  });

  $effect(() => {
    try {
      chrome.action.setBadgeText({ text: '' });
      resetNewMissionCount();
    } catch {
      // Outside extension context
    }
  });

  // Connection status subscription
  $effect(() => {
    const unsubscribe = subscribeToConnection((info) => {
      connectionStatus = info.status;
    });
    return unsubscribe;
  });

  // ============================================================
  // Keyboard shortcuts
  // ============================================================
  $effect(() => {
    const shortcuts: Array<{ config: ShortcutConfig; handler: () => void }> = [
      {
        config: FeedShortcuts.REFRESH,
        handler: () => {
          if (!controller.isScanning && !isLoading && !isOffline) {
            controller.startScan();
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
    return unsubscribe;
  });

  // Dev event handlers
  if (import.meta.env.DEV) {
    $effect(() => {
      function handleMissions(e: Event) {
        const missions = (e as CustomEvent).detail;
        feed.setMissions(missions);
      }
      function handleState(e: Event) {
        const devState = (e as CustomEvent).detail as string;
        if (devState === 'empty') {
          feed.setMissions([]);
        } else if (devState === 'loading') {
          feed.load();
        } else if (devState === 'error') {
          feed.setError('[Dev] Simulated error');
        }
      }
      window.addEventListener('dev:missions', handleMissions);
      window.addEventListener('dev:feed-state', handleState);
      return () => {
        window.removeEventListener('dev:missions', handleMissions);
        window.removeEventListener('dev:feed-state', handleState);
      };
    });
  }

  // Cleanup controller on unmount
  $effect(() => {
    return () => controller.dispose();
  });

  // ============================================================
  // Event handlers (UI-specific)
  // ============================================================
  function handleMissionSeen(missionId: string) {
    const ids = Array.from(seenIds);
    if (ids.includes(missionId)) return;
    seenIds = markAsSeen(ids, [missionId]);
    saveSeenIds(Array.from(seenIds)).catch(() => {});
  }

  function handleToggleFavorite(id: string) {
    favorites = toggleFavorite(favorites, id, Date.now());
    saveFavorites(favorites).catch(() => {});
  }

  function handleHide(id: string) {
    hidden = toggleHidden(hidden, id, Date.now());
    saveHidden(hidden).catch(() => {});
  }

  function handleCopyLink(_id: string) {
    // Copy handled in MissionCard, callback for future analytics
  }

  function toggleFavoritesFilter() {
    showFavoritesOnly = !showFavoritesOnly;
  }

  function toggleHiddenFilter() {
    showHidden = !showHidden;
  }

  function handleSearch(query: string) {
    if (query) {
      feed.search(query);
    } else {
      feed.clearSearch();
    }
  }

  // Shorthand for template
  function startScan() {
    return controller.startScan();
  }

  function stopScan() {
    controller.stopScan();
  }
</script>

<div class="relative flex h-full flex-col">
  <div class="shrink-0 px-4 pt-4">
    <section
      class="section-card-strong relative overflow-hidden rounded-[1.75rem] px-4 transition-all duration-300"
      class:py-4={!heroCompact}
      class:py-3={heroCompact}
    >
      <div
        class="pointer-events-none absolute -right-8 top-0 h-28 w-28 rounded-full bg-accent-blue/14 blur-3xl"
      ></div>
      {#if !heroCompact}
        <div
          class="pointer-events-none absolute bottom-0 left-10 h-20 w-20 rounded-full bg-accent-emerald/10 blur-2xl"
        ></div>
      {/if}
      <div class="relative">
        {#if heroCompact}
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
                  <span class="text-lg font-semibold text-white">{visibleCount}</span>
                  <span class="text-[10px] text-text-muted">missions</span>
                  {#if favoriteCount > 0}
                    <span class="flex items-center gap-1 text-[10px] text-accent-amber">
                      <Icon name="star" size={10} class="fill-accent-amber" />
                      {favoriteCount}
                    </span>
                  {/if}
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2" class:flex-row-reverse={panelSide === 'left'}>
              {#if isOffline}
                <span class="text-[10px] text-accent-amber">
                  <Icon name="database" size={12} />
                </span>
              {/if}
              <button
                class="soft-ring relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white transition-all duration-200 hover:bg-white/10"
                onclick={startScan}
                disabled={controller.isScanning || isLoading || isOffline}
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
            activeSourceFilter={selectedSource}
            enabledConnectors={controller.enabledConnectorIds}
            onRefresh={() => controller.checkSourceSessions()}
            onFilterBySource={(id) => {
              selectedSource = id as MissionSource | null;
            }}
            onToggleConnector={(id) => controller.handleToggleConnector(id)}
          />
        {:else}
          <!-- Full: hero with description, progress, stats -->
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="eyebrow text-accent-blue/80">MissionPulse</p>
              <h2 class="mt-2 text-[1.65rem] font-semibold leading-none text-white">
                {firstName ? `Bonjour, ${firstName}` : 'Radar freelance'}
              </h2>
              <p class="mt-3 max-w-80 text-sm leading-relaxed text-text-secondary">
                Surveille les pistes utiles, filtre le bruit et garde les meilleures missions a
                portee de main.
              </p>
            </div>
            <div class="flex items-center gap-2" class:flex-row-reverse={panelSide === 'left'}>
              {#if controller.isScanning || isLoading}
                <button
                  class="soft-ring inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 text-red-400 transition-all duration-200 hover:bg-red-500/20 hover:text-red-300"
                  onclick={stopScan}
                  title="Stopper le scan"
                >
                  <Icon name="square" size={14} />
                </button>
              {/if}
              <button
                class="soft-ring relative inline-flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-200
                    {controller.isScanning || isLoading
                  ? 'border-accent-blue/30 bg-accent-blue/10'
                  : isOffline
                    ? 'border-white/5 bg-white/3 text-text-muted cursor-not-allowed'
                    : 'border-white/10 bg-white/6 text-white hover:bg-white/10'}"
                onclick={startScan}
                disabled={controller.isScanning || isLoading || isOffline}
                title={controller.isScanning || isLoading
                  ? 'Scan en cours...'
                  : isOffline
                    ? 'Scan indisponible hors ligne'
                    : 'Lancer le scan (r)'}
              >
                {#if controller.isScanning || isLoading}
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
            isScanning={controller.isScanning || isLoading}
            progress={controller.scanProgress.percent}
            missionsFound={totalMissions}
            connectorName={controller.scanProgress.connectorName}
            current={controller.scanProgress.current}
            total={controller.scanProgress.total}
          />

          <ConnectorStatusList
            statuses={controller.connectorStatuses}
            persistedStatuses={controller.persistedStatuses}
            isScanning={controller.isScanning || isLoading}
          />

          {#if !(controller.isScanning || isLoading)}
            <SourceHealthPanel
              sources={controller.sourceStatuses as SourceStatus[]}
              isChecking={controller.isCheckingSources}
              compact={controller.scanCompleted}
              scanResultCounts={controller.scanResultCounts}
              activeSourceFilter={selectedSource}
              enabledConnectors={controller.enabledConnectorIds}
              onRefresh={() => controller.checkSourceSessions()}
              onFilterBySource={(id) => {
                selectedSource = id as MissionSource | null;
              }}
              onToggleConnector={(id) => controller.handleToggleConnector(id)}
            />
          {/if}

          {#if isOffline}
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
                {visibleCount}
              </p>
            </div>
            <div class="rounded-[1.25rem] border border-white/8 bg-white/4 px-3 py-3">
              <p class="text-[11px] uppercase tracking-[0.18em] text-text-muted">Favoris</p>
              <p class="mt-2 text-xl font-semibold text-accent-amber">
                {favoriteCount}
              </p>
            </div>
            <div class="rounded-[1.25rem] border border-white/8 bg-white/4 px-3 py-3">
              <p class="text-[11px] uppercase tracking-[0.18em] text-text-muted">Masquees</p>
              <p class="mt-2 text-xl font-semibold text-text-primary">
                {hiddenCount}
              </p>
            </div>
          </div>
          {#if aiStatus === 'after-download'}
            <p class="mt-2 text-center text-[11px] text-text-muted">
              Scoring IA en telechargement...
            </p>
          {:else if aiStatus === 'no'}
            <p class="mt-2 text-center text-[11px] text-text-muted">Scoring IA indisponible</p>
          {/if}
        {/if}
      </div>
    </section>

    <section
      class="section-card relative overflow-hidden mt-4 rounded-[1.4rem] p-3 @container"
      aria-label="Missions triees"
    >
      <div
        class="pointer-events-none absolute -left-4 top-0 h-24 w-24 rounded-full bg-accent-emerald/8 blur-2xl"
      ></div>

      <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {#if controller.isScanning || isLoading}Chargement des missions en cours{/if}
      </div>

      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <h3 class="text-sm font-semibold tracking-tight text-white">Missions triees</h3>
          {#if !(controller.isScanning || isLoading)}
            <span
              class="inline-flex items-center gap-1.5 rounded-full border border-accent-emerald/15 bg-accent-emerald/8 px-2 py-0.5 text-[10px] font-medium text-accent-emerald/90"
              aria-label="{visibleCount} missions visibles"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-accent-emerald"></span>
              {visibleCount}
            </span>
          {/if}
        </div>
        {#if controller.isScanning || isLoading}
          <span class="flex items-center gap-2 text-xs text-text-muted" aria-hidden="true">
            <span
              class="h-3 w-3 animate-spin rounded-full border-2 border-accent-blue/30 border-t-accent-blue"
            ></span>
            Scraping...
          </span>
        {/if}
      </div>

      <div class="mt-2">
        <SearchInput value={searchQuery} onSearch={handleSearch} bind:inputRef={searchInputRef} />
      </div>

      <div class="mt-2 flex items-center gap-1.5">
        <button
          class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2 @[20rem]:px-3 transition-all duration-200
                        {showFavoritesOnly
            ? 'border-accent-amber/35 bg-accent-amber/15 text-accent-amber shadow-glow-amber'
            : 'border-white/8 bg-white/4 text-text-secondary hover:bg-white/8 hover:text-white'}"
          onclick={toggleFavoritesFilter}
          aria-pressed={showFavoritesOnly}
          title={showFavoritesOnly ? 'Voir toutes (f)' : `Favoris (${favoriteCount})`}
        >
          <Icon name="star" size={14} class={showFavoritesOnly ? 'fill-accent-amber' : ''} />
          <span class="hidden @[20rem]:inline text-[11px] font-medium">Favoris</span>
          {#if favoriteCount > 0}
            <span class="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-medium"
              >{favoriteCount}</span
            >
          {/if}
        </button>
        <button
          class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2 @[20rem]:px-3 transition-all duration-200
                        {showHidden
            ? 'border-accent-blue/35 bg-accent-blue/15 text-accent-blue shadow-glow-blue'
            : 'border-white/8 bg-white/4 text-text-secondary hover:bg-white/8 hover:text-white'}"
          onclick={toggleHiddenFilter}
          aria-pressed={showHidden}
          title={showHidden ? 'Masquer les ignorees (h)' : `Ignorees (${hiddenCount})`}
        >
          <Icon name={showHidden ? 'eye' : 'eye-off'} size={14} />
          <span class="hidden @[20rem]:inline text-[11px] font-medium">Ignorees</span>
          {#if hiddenCount > 0}
            <span class="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-medium"
              >{hiddenCount}</span
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
          bind:value={sortBy}
        >
          <option value="score">Pertinence</option>
          <option value="date">Date</option>
          <option value="tjm">TJM</option>
        </select>
        <button
          class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2 @[20rem]:px-2.5 text-[11px] font-medium transition-all duration-200
                        {showFilters || filterActive
            ? 'border-accent-blue/35 bg-accent-blue/15 text-accent-blue shadow-glow-blue'
            : 'border-white/8 bg-white/4 text-text-secondary hover:bg-white/8 hover:text-white'}"
          onclick={() => (showFilters = !showFilters)}
          aria-expanded={showFilters}
          aria-controls="filter-panel"
          title={showFilters ? 'Masquer les filtres' : 'Afficher les filtres'}
        >
          <Icon name="sliders-horizontal" size={13} />
          <span class="hidden @[20rem]:inline">Filtres</span>
          {#if filterActive}
            <span class="h-1.5 w-1.5 rounded-full bg-accent-blue shadow-glow-blue"></span>
          {/if}
        </button>
        <button
          class="soft-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/4 text-text-secondary transition-all duration-200 hover:bg-white/8 hover:text-white"
          onclick={() => (showShortcutsHelp = true)}
          title="Raccourcis clavier (?)"
          aria-label="Afficher l'aide des raccourcis clavier"
        >
          <Icon name="help-circle" size={14} />
        </button>
      </div>

      {#if showFilters}
        <div
          id="filter-panel"
          class="mt-3 border-t border-white/8 pt-3"
          role="group"
          aria-label="Options de filtrage"
        >
          <FilterBar
            {availableStacks}
            {selectedStacks}
            {selectedSource}
            {selectedRemote}
            onToggleStack={(stack) => {
              if (selectedStacks.includes(stack)) {
                selectedStacks = selectedStacks.filter((s) => s !== stack);
              } else {
                selectedStacks = [...selectedStacks, stack];
              }
            }}
            onSetSource={(source) => {
              selectedSource = source;
            }}
            onSetRemote={(remote) => {
              selectedRemote = remote;
            }}
            onClearAll={() => {
              selectedStacks = [];
              selectedSource = null;
              selectedRemote = null;
            }}
          />
        </div>
      {/if}
    </section>
  </div>

  <div
    class="flex-1 overflow-y-auto px-4 pb-5 pt-4"
    use:pullToRefresh={{ onRefresh: () => controller.startScan(), threshold: 60 }}
  >
    <VirtualMissionFeed
      missions={displayMissions}
      isLoading={controller.isScanning || isLoading}
      {error}
      {seenIds}
      {favorites}
      {hidden}
      {sortBy}
      {filterActive}
      onMissionSeen={handleMissionSeen}
      onToggleFavorite={handleToggleFavorite}
      onHide={handleHide}
      onCopyLink={handleCopyLink}
    />
    {#if hiddenCount > 0 && !showFavoritesOnly}
      <button
        class="mt-3 w-full rounded-full border border-white/8 bg-white/4 py-3 text-xs text-text-secondary transition-all duration-200 hover:border-white/12 hover:bg-white/8 hover:text-white"
        onclick={toggleHiddenFilter}
        aria-pressed={showHidden}
      >
        {showHidden
          ? 'Masquer les ignorees'
          : `Voir les ${hiddenCount} mission${hiddenCount > 1 ? 's' : ''} masquee${hiddenCount > 1 ? 's' : ''}`}
      </button>
    {/if}
  </div>
</div>

<KeyboardShortcutsHelp bind:isOpen={showShortcutsHelp} />
