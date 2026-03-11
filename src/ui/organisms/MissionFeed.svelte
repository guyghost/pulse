<script lang="ts">
  import type { Mission } from '$lib/core/types/mission';
  import MissionCard from '../molecules/MissionCard.svelte';
  import Skeleton from '../atoms/Skeleton.svelte';
  import Icon from '../atoms/Icon.svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  let {
    missions = [],
    isLoading = false,
    error = null,
    seenIds = [],
    favorites = {},
    hidden = {},
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
    onMissionSeen?: (id: string) => void;
    onToggleFavorite?: (id: string) => void;
    onHide?: (id: string) => void;
    onCopyLink?: (id: string) => void;
  } = $props();

  let sortedMissions = $derived(
    [...missions].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  );
</script>

<div class="flex flex-col gap-2 overflow-y-auto">
  {#if isLoading}
    {#each Array(3) as _}
      <div class="bg-white/[0.05] backdrop-blur-md border border-white/5 rounded-xl p-3 space-y-2">
        <Skeleton width="70%" height="1rem" />
        <Skeleton width="40%" height="0.75rem" />
        <div class="flex gap-1">
          <Skeleton width="3rem" height="1.25rem" rounded="full" />
          <Skeleton width="4rem" height="1.25rem" rounded="full" />
          <Skeleton width="3.5rem" height="1.25rem" rounded="full" />
        </div>
      </div>
    {/each}
  {:else if error}
    <div class="flex flex-col items-center justify-center py-12 text-center">
      <div class="w-10 h-10 rounded-full bg-accent-red/10 flex items-center justify-center mb-3">
        <Icon name="x" size={20} class="text-accent-red" />
      </div>
      <p class="text-sm text-text-primary font-medium">Erreur</p>
      <p class="text-xs text-text-secondary mt-1 max-w-[250px]">{error}</p>
    </div>
  {:else if sortedMissions.length === 0}
    <div class="flex flex-col items-center justify-center py-12 text-center">
      <div class="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-3">
        <Icon name="briefcase" size={20} class="text-text-muted" />
      </div>
      <p class="text-sm text-text-primary font-medium">Aucune mission</p>
      <p class="text-xs text-text-secondary mt-1">Lancez un scan pour trouver des missions</p>
    </div>
  {:else}
    {#each sortedMissions as mission, i (mission.id)}
      <div in:fly={{ y: 15, duration: 250, delay: Math.min(i * 50, 300), easing: cubicOut }}>
        <MissionCard
          {mission}
          isSeen={seenIds.includes(mission.id)}
          isFavorite={mission.id in favorites}
          isHidden={mission.id in hidden}
          onVisible={() => onMissionSeen?.(mission.id)}
          onToggleFavorite={() => onToggleFavorite?.(mission.id)}
          onHide={() => onHide?.(mission.id)}
          onCopyLink={() => onCopyLink?.(mission.id)}
        />
      </div>
    {/each}
    <p class="text-[10px] text-text-muted text-center py-2">
      {sortedMissions.length} mission{sortedMissions.length > 1 ? 's' : ''}
    </p>
  {/if}
</div>
