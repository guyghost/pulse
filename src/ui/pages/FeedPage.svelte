<script lang="ts">
  import { createActor } from 'xstate';
  import { feedMachine } from '../../machines/feed.machine';
  import FeedLayout from '../templates/FeedLayout.svelte';
  import MissionFeed from '../organisms/MissionFeed.svelte';
  import ScanProgress from '../organisms/ScanProgress.svelte';
  import SearchInput from '../molecules/SearchInput.svelte';
  import Icon from '../atoms/Icon.svelte';
  import { sendMessage } from '$lib/shell/messaging/bridge';

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

  let isScanning = $state(false);
  let scanProgress = $state(0);

  function handleSearch(query: string) {
    if (query) {
      feedActor.send({ type: 'SEARCH', query });
    } else {
      feedActor.send({ type: 'CLEAR_SEARCH' });
    }
  }

  async function startScan() {
    isScanning = true;
    scanProgress = 0;
    feedActor.send({ type: 'LOAD' });
    await sendMessage({ type: 'SCAN_START' });
  }

  // Auto-scan on mount
  $effect(() => {
    startScan();
  });

  if (import.meta.env.DEV) {
    $effect(() => {
      function handleMissions(e: Event) {
        const missions = (e as CustomEvent).detail;
        isScanning = false;
        scanProgress = 100;
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

<FeedLayout feed={feedContent} header={headerContent}>
  {#snippet headerContent()}
    <ScanProgress {isScanning} progress={scanProgress} />
    <div class="flex items-center justify-between px-3 pt-3 pb-2">
      <h2 class="text-sm font-semibold text-white">Missions</h2>
      <button
        class="p-1.5 rounded-lg text-text-muted hover:text-white hover:bg-white/5 transition-all duration-200"
        onclick={startScan}
        title="Rafraîchir"
      >
        <Icon name="refresh-cw" size={14} />
      </button>
    </div>
    <div class="px-3 pb-2">
      <SearchInput value={searchQuery} onSearch={handleSearch} />
    </div>
  {/snippet}

  {#snippet feedContent()}
    <MissionFeed {missions} {isLoading} {error} />
  {/snippet}
</FeedLayout>
