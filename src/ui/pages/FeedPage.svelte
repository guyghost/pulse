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
    <ScanProgress isScanning={isLoading} progress={isLoading ? 50 : 100} missionsFound={missions.length} />
    <div class="flex items-center justify-between px-3 pt-3 pb-2">
      <h2 class="text-sm font-semibold text-white">Missions</h2>
      <div class="flex items-center gap-1">
        <button
          class="p-1.5 rounded-lg transition-all duration-200
            {showFavoritesOnly ? 'text-accent-amber' : 'text-text-muted hover:text-white hover:bg-white/5'}"
          onclick={toggleFavoritesFilter}
          title={showFavoritesOnly ? 'Voir toutes' : 'Voir favoris'}
        >
          <Icon name="star" size={14} class={showFavoritesOnly ? 'fill-accent-amber' : ''} />
        </button>
        <button
          class="p-1.5 rounded-lg transition-all duration-200
            {isLoading ? 'text-accent-blue' : 'text-text-muted hover:text-white hover:bg-white/5'}"
          onclick={startScan}
          title="Rafraichir"
        >
          <Icon name="refresh-cw" size={14} class="{isLoading ? 'animate-spin' : ''}" />
        </button>
      </div>
    </div>
    <div class="px-3 pb-2">
      <SearchInput value={searchQuery} onSearch={handleSearch} />
    </div>
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
    {#if Object.keys(hidden).length > 0 && !showFavoritesOnly}
      <button
        class="text-[10px] text-text-muted hover:text-text-secondary text-center py-1 w-full transition-colors"
        onclick={toggleHiddenFilter}
      >
        {showHidden ? 'Masquer les ignorees' : `Voir les ${Object.keys(hidden).length} masquee${Object.keys(hidden).length > 1 ? 's' : ''}`}
      </button>
    {/if}
  {/snippet}
</FeedLayout>
