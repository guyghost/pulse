<script lang="ts">
  import type { Mission } from '$lib/core/types/mission';
  import MissionCard from '../molecules/MissionCard.svelte';
  import Skeleton from '../atoms/Skeleton.svelte';
  import Icon from '../atoms/Icon.svelte';

  let { missions = [], isLoading = false, error = null }: {
    missions?: Mission[];
    isLoading?: boolean;
    error?: string | null;
  } = $props();

  let sortedMissions = $derived(
    [...missions].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  );
</script>

<div class="flex flex-col gap-2 overflow-y-auto">
  {#if isLoading}
    {#each Array(3) as _}
      <div class="p-3 bg-surface rounded-lg space-y-2">
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
    <div class="flex flex-col items-center justify-center py-8 text-center">
      <Icon name="x" size={24} class="text-accent-red mb-2" />
      <p class="text-sm text-text-primary font-medium">Erreur</p>
      <p class="text-xs text-text-secondary mt-1">{error}</p>
    </div>
  {:else if sortedMissions.length === 0}
    <div class="flex flex-col items-center justify-center py-8 text-center">
      <Icon name="briefcase" size={24} class="text-text-muted mb-2" />
      <p class="text-sm text-text-primary font-medium">Aucune mission</p>
      <p class="text-xs text-text-secondary mt-1">Lancez un scan pour trouver des missions</p>
    </div>
  {:else}
    {#each sortedMissions as mission (mission.id)}
      <MissionCard {mission} />
    {/each}
    <p class="text-[10px] text-text-muted text-center py-2">
      {sortedMissions.length} mission{sortedMissions.length > 1 ? 's' : ''}
    </p>
  {/if}
</div>
