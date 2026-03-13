<script lang="ts">
  import { createActor } from 'xstate';
  import { feedMachine } from '../../machines/feed.machine';
  import FeedLayout from '../templates/FeedLayout.svelte';
  import MissionFeed from '../organisms/MissionFeed.svelte';
  import ScanProgress from '../organisms/ScanProgress.svelte';
  import SearchInput from '../molecules/SearchInput.svelte';
  import Icon from '../atoms/Icon.svelte';
  import FilterBar from '../organisms/FilterBar.svelte';
  import type { MissionSource, RemoteType } from '$lib/core/types/mission';
  import { runScan } from '$lib/shell/scan/scanner';
  import { getSeenIds, saveSeenIds } from '$lib/shell/storage/seen-missions';
  import { markAsSeen } from '$lib/core/seen/mark-seen';
  import { getFavorites, saveFavorites, getHidden, saveHidden } from '$lib/shell/storage/favorites';
  import { getProfile } from '$lib/shell/storage/db';
  import { toggleFavorite, toggleHidden, filterHidden, filterFavoritesOnly } from '$lib/core/favorites/favorites';

  const feedActor = createActor(feedMachine);
  feedActor.start();

  let feedSnapshot = $state(feedActor.getSnapshot());

  $effect(() => {
    const sub = feedActor.subscribe((s) => { feedSnapshot = s; });
    return () => sub.unsubscribe();
  });

  let missions = $derived(feedSnapshot.context.filteredMissions);
  let isLoading = $derived(feedSnapshot.matches('loading'));
  let error = $derived(feedSnapshot.context.error);
  let searchQuery = $derived(feedSnapshot.context.searchQuery);
  let totalMissions = $derived(missions.length);

  let displayMissions = $derived.by(() => {
    let result = missions;
    if (showFavoritesOnly) {
      result = filterFavoritesOnly(result, favorites);
    }
    if (!showHidden) {
      result = filterHidden(result, hidden);
    }
    if (selectedSource) {
      result = result.filter(m => m.source === selectedSource);
    }
    if (selectedRemote) {
      result = result.filter(m => m.remote === selectedRemote);
    }
    if (selectedStacks.length > 0) {
      result = result.filter(m => selectedStacks.some(s => m.stack.includes(s)));
    }
    return result;
  });

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
  let favoriteCount = $derived(Object.keys(favorites).length);
  let hiddenCount = $derived(Object.keys(hidden).length);
  let visibleCount = $derived(displayMissions.length);
  let filterActive = $derived(selectedSource !== null || selectedRemote !== null || selectedStacks.length > 0);
  let availableStacks = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const m of missions) {
      for (const s of m.stack) {
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  });
  let firstName = $state('');
  let scanController: AbortController | null = null;

  $effect(() => {
    getSeenIds().then(ids => { seenIds = ids; }).catch(() => {});
  });

  $effect(() => {
    getFavorites().then(f => { favorites = f; }).catch(() => {});
    getHidden().then(h => { hidden = h; }).catch(() => {});
  });

  $effect(() => {
    getProfile().then(p => { if (p?.firstName) firstName = p.firstName; }).catch(() => {});
  });

  $effect(() => {
    try {
      chrome.action.setBadgeText({ text: '' });
    } catch {
      // Outside extension context
    }
  });

  function handleMissionSeen(missionId: string) {
    if (seenIds.includes(missionId)) return;
    seenIds = markAsSeen(seenIds, [missionId]);
    saveSeenIds(seenIds).catch(() => {});
  }

  function handleToggleFavorite(id: string) {
    favorites = toggleFavorite(favorites, id);
    saveFavorites(favorites).catch(() => {});
  }

  function handleHide(id: string) {
    hidden = toggleHidden(hidden, id);
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
      feedActor.send({ type: 'SEARCH', query });
    } else {
      feedActor.send({ type: 'CLEAR_SEARCH' });
    }
  }

  async function startScan() {
    if (isLoading) return;
    scanController = new AbortController();
    feedActor.send({ type: 'LOAD' });
    try {
      const result = await runScan(scanController.signal);
      if (scanController.signal.aborted) return;
      feedActor.send({ type: 'MISSIONS_LOADED', missions: result.missions });
      if (result.errors.length > 0 && result.missions.length === 0) {
        const errorMsg = result.errors.map(e => `${e.connectorId}: ${e.message}`).join('\n');
        feedActor.send({ type: 'LOAD_ERROR', error: errorMsg });
      }
    } catch (err) {
      if (scanController.signal.aborted) return;
      const msg = err instanceof Error ? err.message : 'Erreur de scan';
      feedActor.send({ type: 'LOAD_ERROR', error: msg });
    } finally {
      scanController = null;
    }
  }

  function stopScan() {
    if (scanController) {
      scanController.abort();
      scanController = null;
      feedActor.send({ type: 'MISSIONS_LOADED', missions: feedSnapshot.context.missions });
    }
  }

  // Auto-scan on mount
  startScan();

  if (import.meta.env.DEV) {
    $effect(() => {
      function handleMissions(e: Event) {
        const missions = (e as CustomEvent).detail;
        feedActor.send({ type: 'MISSIONS_LOADED', missions });
      }
      function handleState(e: Event) {
        const state = (e as CustomEvent).detail as string;
        if (state === 'empty') {
          feedActor.send({ type: 'MISSIONS_LOADED', missions: [] });
        } else if (state === 'loading') {
          feedActor.send({ type: 'LOAD' });
        } else if (state === 'error') {
          feedActor.send({ type: 'LOAD_ERROR', error: '[Dev] Simulated error' });
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
</script>

<FeedLayout feed={feedContent} header={headerContent} onRefresh={startScan}>
  {#snippet headerContent()}
    <section class="section-card-strong relative overflow-hidden rounded-[1.75rem] px-4 py-4">
      <div class="pointer-events-none absolute -right-8 top-0 h-28 w-28 rounded-full bg-accent-blue/14 blur-3xl"></div>
      <div class="pointer-events-none absolute bottom-0 left-10 h-20 w-20 rounded-full bg-accent-emerald/10 blur-2xl"></div>
      <div class="relative">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="eyebrow text-accent-blue/80">MissionPulse</p>
            <h2 class="mt-2 text-[1.65rem] font-semibold leading-none text-white">
              {firstName ? `Bonjour, ${firstName}` : 'Radar freelance'}
            </h2>
            <p class="mt-3 max-w-[20rem] text-sm leading-relaxed text-text-secondary">
              Surveille les pistes utiles, filtre le bruit et garde les meilleures missions a portee de main.
            </p>
          </div>
          <div class="flex items-center gap-2">
            {#if isLoading}
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
                {isLoading
                  ? 'border-accent-blue/30 bg-accent-blue/10'
                  : 'border-white/10 bg-white/[0.06] text-white hover:bg-white/[0.1]'}"
              onclick={startScan}
              disabled={isLoading}
              title={isLoading ? 'Scan en cours...' : 'Lancer le scan'}
            >
              {#if isLoading}
                <span class="absolute inset-0 flex items-center justify-center">
                  <span class="radar-ping absolute h-8 w-8 rounded-full border border-accent-blue/40"></span>
                  <span class="radar-ping animation-delay-500 absolute h-5 w-5 rounded-full border border-accent-blue/60"></span>
                  <span class="h-2 w-2 rounded-full bg-accent-blue"></span>
                </span>
              {:else}
                <Icon name="play" size={14} class="ml-0.5" />
              {/if}
            </button>
          </div>
        </div>

        <ScanProgress isScanning={isLoading} progress={isLoading ? 50 : 100} missionsFound={totalMissions} />

        <div class="mt-4 grid grid-cols-3 gap-2">
          <div class="rounded-[1.25rem] border border-white/8 bg-white/[0.05] px-3 py-3">
            <p class="text-[11px] uppercase tracking-[0.18em] text-text-muted">Visibles</p>
            <p class="mt-2 text-xl font-semibold text-white">{visibleCount}</p>
          </div>
          <div class="rounded-[1.25rem] border border-white/8 bg-white/[0.04] px-3 py-3">
            <p class="text-[11px] uppercase tracking-[0.18em] text-text-muted">Favoris</p>
            <p class="mt-2 text-xl font-semibold text-accent-amber">{favoriteCount}</p>
          </div>
          <div class="rounded-[1.25rem] border border-white/8 bg-white/[0.04] px-3 py-3">
            <p class="text-[11px] uppercase tracking-[0.18em] text-text-muted">Masquees</p>
            <p class="mt-2 text-xl font-semibold text-text-primary">{hiddenCount}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section-card mt-4 rounded-[1.6rem] p-3">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-white">Missions triees</p>
          <p class="mt-1 text-xs text-text-secondary">
            {isLoading ? 'Scraping en cours...' : `${visibleCount} mission${visibleCount > 1 ? 's' : ''} dans le radar`}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-all duration-200
              {showFavoritesOnly
                ? 'border-accent-amber/30 bg-accent-amber/12 text-accent-amber'
                : 'border-white/8 bg-white/[0.03] text-text-secondary hover:bg-white/[0.07] hover:text-white'}"
            onclick={toggleFavoritesFilter}
            title={showFavoritesOnly ? 'Voir toutes' : 'Voir favoris'}
          >
            <Icon name="star" size={14} class={showFavoritesOnly ? 'fill-accent-amber' : ''} />
            Favoris
          </button>
          <button
            class="inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-all duration-200
              {showHidden
                ? 'border-accent-blue/30 bg-accent-blue/12 text-accent-blue'
                : 'border-white/8 bg-white/[0.03] text-text-secondary hover:bg-white/[0.07] hover:text-white'}"
            onclick={toggleHiddenFilter}
            title={showHidden ? 'Masquer les ignorees' : 'Voir ignorees'}
          >
            <Icon name={showHidden ? 'eye' : 'eye-off'} size={14} />
            Ignorees
          </button>
          <select
            class="rounded-full border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-text-secondary focus:outline-none"
            bind:value={sortBy}
          >
            <option value="score">Pertinence</option>
            <option value="date">Date</option>
            <option value="tjm">TJM</option>
          </select>
          <button
            class="inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-all duration-200
              {showFilters
                ? 'border-accent-blue/30 bg-accent-blue/12 text-accent-blue'
                : 'border-white/8 bg-white/[0.03] text-text-secondary hover:bg-white/[0.07] hover:text-white'}"
            onclick={() => showFilters = !showFilters}
            title={showFilters ? 'Masquer les filtres' : 'Afficher les filtres'}
          >
            <Icon name="sliders-horizontal" size={14} />
          </button>
        </div>
      </div>

      <div class="mt-3">
        <SearchInput value={searchQuery} onSearch={handleSearch} />
      </div>

      {#if showFilters}
        <div class="mt-3">
          <FilterBar
            {availableStacks}
            {selectedStacks}
            {selectedSource}
            {selectedRemote}
            onToggleStack={(stack) => {
              if (selectedStacks.includes(stack)) {
                selectedStacks = selectedStacks.filter(s => s !== stack);
              } else {
                selectedStacks = [...selectedStacks, stack];
              }
            }}
            onSetSource={(source) => { selectedSource = source; }}
            onSetRemote={(remote) => { selectedRemote = remote; }}
            onClearAll={() => {
              selectedStacks = [];
              selectedSource = null;
              selectedRemote = null;
            }}
          />
        </div>
      {/if}
    </section>
  {/snippet}

  {#snippet feedContent()}
    <MissionFeed
      missions={displayMissions}
      {isLoading}
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
        class="mt-3 w-full rounded-full border border-white/8 bg-white/[0.03] py-2 text-[11px] text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-white"
        onclick={toggleHiddenFilter}
      >
        {showHidden ? 'Masquer les ignorees' : `Voir les ${hiddenCount} mission${hiddenCount > 1 ? 's' : ''} masquee${hiddenCount > 1 ? 's' : ''}`}
      </button>
    {/if}
  {/snippet}
</FeedLayout>
