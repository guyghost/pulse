<script lang="ts">
  import type { Mission } from '$lib/core/types/mission';
  import { calculateVirtualItems, type VirtualListState } from '$lib/core/virtualization/virtual-list';
  import MissionCard from '../molecules/MissionCard.svelte';
  import Skeleton from '../atoms/Skeleton.svelte';
  import Icon from '../atoms/Icon.svelte';
  import { virtualScroll } from '../actions/virtual-scroll';

  let {
    missions = [],
    isLoading = false,
    error = null,
    seenIds = [],
    favorites = {},
    hidden = {},
    sortBy = 'score',
    filterActive = false,
    virtualizeThreshold = 50,
    itemHeight = 180,
    overscan = 3,
    onMissionSeen,
    onToggleFavorite,
    onHide,
    onCopyLink,
  }: {
    missions?: Mission[];
    isLoading?: boolean;
    error?: string | null;
    seenIds?: string[];
    favorites?: Record<string, number>;
    hidden?: Record<string, number>;
    sortBy?: 'score' | 'date' | 'tjm';
    filterActive?: boolean;
    virtualizeThreshold?: number;
    itemHeight?: number;
    overscan?: number;
    onMissionSeen?: (id: string) => void;
    onToggleFavorite?: (id: string) => void;
    onHide?: (id: string) => void;
    onCopyLink?: (id: string) => void;
  } = $props();

  // Tri des missions (même logique que MissionFeed)
  let sortedMissions = $derived(
    [...missions].sort((a, b) => {
      if (sortBy === 'date') return new Date(b.scrapedAt).getTime() - new Date(a.scrapedAt).getTime();
      if (sortBy === 'tjm') return (b.tjm ?? 0) - (a.tjm ?? 0);
      return (b.score ?? 0) - (a.score ?? 0);
    })
  );

  // État de la virtualisation
  let scrollTop = $state(0);
  let containerHeight = $state(0);
  let containerRef: HTMLDivElement | null = $state(null);

  // Calcul de l'état virtuel
  let virtualState: VirtualListState<Mission> = $derived.by(() => {
    if (sortedMissions.length <= virtualizeThreshold) {
      // Pas de virtualisation sous le seuil
      return {
        virtualItems: sortedMissions.map((mission, index) => ({
          index,
          data: mission,
          style: {
            position: 'absolute' as const,
            top: index * itemHeight,
            height: itemHeight,
          },
        })),
        totalHeight: sortedMissions.length * itemHeight,
        startIndex: 0,
        endIndex: sortedMissions.length - 1,
      };
    }

    return calculateVirtualItems(
      sortedMissions,
      scrollTop,
      containerHeight,
      {
        itemHeight,
        overscan,
        totalItems: sortedMissions.length,
      }
    );
  });

  // Détermine si on utilise la virtualisation
  let isVirtualized = $derived(sortedMissions.length > virtualizeThreshold);

  // Gestion du scroll
  function handleScroll(newScrollTop: number, newContainerHeight: number) {
    scrollTop = newScrollTop;
    containerHeight = newContainerHeight;
  }

  // Style pour le container des items
  function getContainerStyle(totalHeight: number): string {
    return `position: relative; height: ${totalHeight}px;`;
  }

  // Style pour un item virtuel
  function getItemStyle(top: number, height: number): string {
    return `position: absolute; top: ${top}px; height: ${height}px; left: 0; right: 0;`;
  }
</script>

<div 
  class="flex flex-col gap-3 overflow-y-auto relative"
  style="contain: layout style paint;"
  use:virtualScroll={{ onScroll: handleScroll, throttleMs: 16 }}
  bind:this={containerRef}
>
  {#if isLoading && sortedMissions.length === 0}
    {#each Array(3) as _}
      <div class="section-card rounded-[1.5rem] p-4 space-y-3">
        <Skeleton width="58%" height="1.15rem" />
        <Skeleton width="34%" height="0.8rem" />
        <div class="flex gap-2">
          <Skeleton width="3rem" height="1.25rem" rounded="full" />
          <Skeleton width="4rem" height="1.25rem" rounded="full" />
          <Skeleton width="3.5rem" height="1.25rem" rounded="full" />
        </div>
        <Skeleton width="100%" height="3rem" />
      </div>
    {/each}
  {:else if error && sortedMissions.length === 0}
    <div class="section-card rounded-[1.75rem] flex flex-col items-center justify-center py-12 text-center">
      <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-red/12">
        <Icon name="x" size={20} class="text-accent-red" />
      </div>
      <p class="text-sm font-semibold text-text-primary">Erreur de synchronisation</p>
      <p class="mt-2 max-w-[250px] text-xs leading-relaxed text-text-secondary">{error}</p>
    </div>
  {:else if sortedMissions.length === 0}
    <div class="section-card rounded-[1.75rem] flex flex-col items-center justify-center py-12 text-center">
      {#if filterActive}
        <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.05]">
          <Icon name="filter-x" size={20} class="text-text-muted" />
        </div>
        <p class="text-sm font-semibold text-text-primary">Aucun resultat</p>
        <p class="mt-2 max-w-[250px] text-xs leading-relaxed text-text-secondary">Essayez d'elargir vos filtres ou de modifier vos criteres de recherche.</p>
      {:else}
        <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.05]">
          <Icon name="briefcase" size={20} class="text-text-muted" />
        </div>
        <p class="text-sm font-semibold text-text-primary">Aucune mission pour l'instant</p>
        <p class="mt-2 text-xs text-text-secondary">Lancez un scan pour alimenter le radar.</p>
      {/if}
    </div>
  {:else}
    {#if error}
      <div class="section-card rounded-[1.25rem] flex items-center gap-3 px-4 py-3">
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-red/12">
          <Icon name="x" size={14} class="text-accent-red" />
        </div>
        <p class="text-xs leading-relaxed text-text-secondary">{error}</p>
      </div>
    {/if}
    
    <!-- Container avec hauteur totale pour le scroll -->
    <div style={getContainerStyle(virtualState.totalHeight)}>
      {#each virtualState.virtualItems as virtualItem (virtualItem.data.id)}
        <div 
          style={getItemStyle(virtualItem.style.top, virtualItem.style.height)}
          class="px-1"
        >
          <MissionCard
            mission={virtualItem.data}
            isSeen={seenIds.includes(virtualItem.data.id)}
            isFavorite={virtualItem.data.id in favorites}
            isHidden={virtualItem.data.id in hidden}
            isVirtualized={isVirtualized}
            onVisible={() => onMissionSeen?.(virtualItem.data.id)}
            onToggleFavorite={() => onToggleFavorite?.(virtualItem.data.id)}
            onHide={() => onHide?.(virtualItem.data.id)}
            onCopyLink={() => onCopyLink?.(virtualItem.data.id)}
          />
        </div>
      {/each}
    </div>
    
    <p class="py-2 text-center text-[11px] text-text-muted shrink-0">
      {sortedMissions.length} mission{sortedMissions.length > 1 ? 's' : ''} triee{sortedMissions.length > 1 ? 's' : ''} par {sortBy === 'score' ? 'pertinence' : sortBy === 'date' ? 'date' : 'TJM'}
      {#if isVirtualized}
        <span class="text-text-muted/60">(virtualisé)</span>
      {/if}
    </p>
  {/if}
</div>
