<script lang="ts">
  import { createActor } from 'xstate';
  import { feedMachine } from '../../machines/feed.machine';
  import { filtersMachine } from '../../machines/filters.machine';
  import FeedLayout from '../templates/FeedLayout.svelte';
  import MissionFeed from '../organisms/MissionFeed.svelte';
  import ScanProgress from '../organisms/ScanProgress.svelte';
  import SearchInput from '../molecules/SearchInput.svelte';
  import FilterBar from '../molecules/FilterBar.svelte';
  import Button from '../atoms/Button.svelte';
  import Icon from '../atoms/Icon.svelte';
  import { sendMessage } from '$lib/messaging/bridge';

  const feedActor = createActor(feedMachine);
  const filtersActor = createActor(filtersMachine);
  feedActor.start();
  filtersActor.start();

  let feedSnapshot = $state(feedActor.getSnapshot());
  let filtersSnapshot = $state(filtersActor.getSnapshot());

  $effect(() => {
    const feedSub = feedActor.subscribe((s) => { feedSnapshot = s; });
    const filtersSub = filtersActor.subscribe((s) => { filtersSnapshot = s; });
    return () => { feedSub.unsubscribe(); filtersSub.unsubscribe(); };
  });

  let missions = $derived(feedSnapshot.context.filteredMissions);
  let isLoading = $derived(feedSnapshot.matches('loading'));
  let error = $derived(feedSnapshot.context.error);
  let searchQuery = $derived(feedSnapshot.context.searchQuery);
  let selectedStack = $derived(filtersSnapshot.context.stack);

  // Scan state (received via messaging)
  let isScanning = $state(false);
  let scanProgress = $state(0);
  let scanConnector = $state<string | null>(null);
  let scanMissionsFound = $state(0);

  // Available stack options (derived from missions)
  let stackOptions = $derived(
    [...new Set(feedSnapshot.context.missions.flatMap(m => m.stack))].slice(0, 10)
  );

  function handleSearch(query: string) {
    if (query) {
      feedActor.send({ type: 'SEARCH', query });
    } else {
      feedActor.send({ type: 'CLEAR_SEARCH' });
    }
  }

  function handleToggleStack(item: string) {
    filtersActor.send({ type: 'TOGGLE_STACK_ITEM', item });
  }

  function handleClearFilters() {
    filtersActor.send({ type: 'CLEAR_ALL' });
    feedActor.send({ type: 'CLEAR_FILTERS' });
  }

  async function startScan() {
    isScanning = true;
    scanProgress = 0;
    scanMissionsFound = 0;
    feedActor.send({ type: 'LOAD' });
    await sendMessage({ type: 'SCAN_START' });
  }

  // Load missions on mount
  $effect(() => {
    feedActor.send({ type: 'LOAD' });
  });
</script>

<FeedLayout feed={feedContent} header={headerContent} filters={filterContent}>
  {#snippet headerContent()}
    <div class="flex items-center justify-between p-3 border-b border-border">
      <h2 class="text-sm font-semibold text-text-primary">Missions</h2>
      <Button variant="secondary" onclick={startScan}>
        {#snippet children()}<Icon name="refresh-cw" size={14} /> Scanner{/snippet}
      </Button>
    </div>
    <ScanProgress
      {isScanning}
      progress={scanProgress}
      currentConnector={scanConnector}
      missionsFound={scanMissionsFound}
    />
  {/snippet}

  {#snippet filterContent()}
    <SearchInput value={searchQuery} onSearch={handleSearch} />
    <FilterBar
      {stackOptions}
      {selectedStack}
      onToggleStack={handleToggleStack}
      onClear={handleClearFilters}
    />
  {/snippet}

  {#snippet feedContent()}
    <MissionFeed {missions} {isLoading} {error} />
  {/snippet}
</FeedLayout>
