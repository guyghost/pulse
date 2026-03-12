<script lang="ts">
  import { createActor } from 'xstate';
  import { feedMachine } from '../../machines/feed.machine';
  import FeedLayout from '../templates/FeedLayout.svelte';
  import MissionFeed from '../organisms/MissionFeed.svelte';
  import ScanProgress from '../organisms/ScanProgress.svelte';
  import SearchInput from '../molecules/SearchInput.svelte';
  import Icon from '../atoms/Icon.svelte';
  import { sendMessage } from '$lib/shell/messaging/bridge';
  import { getSeenIds, saveSeenIds } from '$lib/shell/storage/seen-missions';
  import { markAsSeen } from '$lib/core/seen/mark-seen';
  import { getFavorites, saveFavorites, getHidden, saveHidden } from '$lib/shell/storage/favorites';
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
    return result;
  });

  let seenIds = $state<string[]>([]);
  let favorites = $state<Record<string, number>>({});
  let hidden = $state<Record<string, number>>({});
  let showFavoritesOnly = $state(false);
  let showHidden = $state(false);
  let favoriteCount = $derived(Object.keys(favorites).length);
  let hiddenCount = $derived(Object.keys(hidden).length);
  let visibleCount = $derived(displayMissions.length);

  $effect(() => {
    getSeenIds().then(ids => { seenIds = ids; }).catch(() => {});
  });

  $effect(() => {
    getFavorites().then(f => { favorites = f; }).catch(() => {});
    getHidden().then(h => { hidden = h; }).catch(() => {});
  });

  function handleMissionSeen(missionId: string) {
    if (seenIds.includes(missionId)) return;
    seenIds = markAsSeen(seenIds, [missionId]);
    saveSeenIds(seenIds).catch(() => {});
    sendMessage({ type: 'MISSIONS_SEEN', payload: seenIds }).catch(() => {});
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

  function startScan() {
    if (isLoading) return;
    feedActor.send({ type: 'LOAD' });
    sendMessage({ type: 'SCAN_START' }).catch(() => {});
  }

  // Auto-scan on mount
  $effect(() => {
    startScan();
  });

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
            <h2 class="mt-2 text-[1.65rem] font-semibold leading-none text-white">Radar freelance</h2>
            <p class="mt-3 max-w-[20rem] text-sm leading-relaxed text-text-secondary">
              Surveille les pistes utiles, filtre le bruit et garde les meilleures missions a portee de main.
            </p>
          </div>
          <button
            class="soft-ring inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-white transition-all duration-200 hover:bg-white/[0.1]"
            onclick={startScan}
            title="Rafraichir"
          >
            <Icon name="refresh-cw" size={16} class={isLoading ? 'animate-spin text-accent-blue' : ''} />
          </button>
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
        </div>
      </div>

      <div class="mt-3">
        <SearchInput value={searchQuery} onSearch={handleSearch} />
      </div>
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
