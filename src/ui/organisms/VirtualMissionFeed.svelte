<script lang="ts">
  import type { Mission } from '$lib/core/types/mission';
  import MissionCard from '../molecules/MissionCard.svelte';
  import Skeleton from '../atoms/Skeleton.svelte';
  import Icon from '../atoms/Icon.svelte';

  let props: {
    missions?: Mission[];
    isLoading?: boolean;
    error?: string | null;
    seenIds?: string[];
    favorites?: Record<string, number>;
    hidden?: Record<string, number>;
    sortBy?: 'score' | 'date' | 'tjm';
    filterActive?: boolean;
    onMissionSeen?: (id: string) => void;
    onToggleFavorite?: (id: string) => void;
    onHide?: (id: string) => void;
    onCopyLink?: (id: string) => void;
  } = $props();

  let sortedMissions = $derived(
    [...(props.missions ?? [])].sort((a, b) => {
      if (props.sortBy === 'date') return new Date(b.scrapedAt).getTime() - new Date(a.scrapedAt).getTime();
      if (props.sortBy === 'tjm') return (b.tjm ?? 0) - (a.tjm ?? 0);
      return (b.score ?? 0) - (a.score ?? 0);
    })
  );
</script>

<div class="flex flex-col gap-3">
  {#if props.isLoading && sortedMissions.length === 0}
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
  {:else if props.error && sortedMissions.length === 0}
    <div class="section-card rounded-[1.75rem] flex flex-col items-center justify-center py-12 text-center">
      <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-red/12">
        <Icon name="x" size={20} class="text-accent-red" />
      </div>
      <p class="text-sm font-semibold text-text-primary">Erreur de synchronisation</p>
      <p class="mt-2 max-w-[250px] text-xs leading-relaxed text-text-secondary">{props.error}</p>
    </div>
  {:else if sortedMissions.length === 0}
    <div class="section-card rounded-[1.75rem] flex flex-col items-center justify-center py-12 text-center">
      {#if props.filterActive}
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
    {#if props.error}
      <div class="section-card rounded-[1.25rem] flex items-center gap-3 px-4 py-3">
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-red/12">
          <Icon name="x" size={14} class="text-accent-red" />
        </div>
        <p class="text-xs leading-relaxed text-text-secondary">{props.error}</p>
      </div>
    {/if}
    
    <!-- Rendu simple (non-virtualisé) : flow normal sans absolute positioning -->
    <div class="flex flex-col gap-3">
      {#each sortedMissions as mission (mission.id)}
        <MissionCard
          {mission}
          isSeen={(props.seenIds ?? []).includes(mission.id)}
          isFavorite={mission.id in (props.favorites ?? {})}
          isHidden={mission.id in (props.hidden ?? {})}
          onVisible={() => props.onMissionSeen?.(mission.id)}
          onToggleFavorite={() => props.onToggleFavorite?.(mission.id)}
          onHide={() => props.onHide?.(mission.id)}
          onCopyLink={() => props.onCopyLink?.(mission.id)}
        />
      {/each}
    </div>
    
    <p class="py-2 text-center text-[11px] text-text-muted shrink-0">
      {sortedMissions.length} mission{sortedMissions.length > 1 ? 's' : ''} triee{sortedMissions.length > 1 ? 's' : ''} par {props.sortBy === 'score' ? 'pertinence' : props.sortBy === 'date' ? 'date' : 'TJM'}
    </p>
  {/if}
</div>
