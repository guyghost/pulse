<script lang="ts">
  import type { Mission } from '$lib/core/types/mission';
  import MissionCard from '../molecules/MissionCard.svelte';
  import { Skeleton } from '@pulse/ui';
  import { Icon } from '@pulse/ui';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import OperationalEmptyState from '../molecules/OperationalEmptyState.svelte';

  const {
    missions = [],
    isLoading = false,
    error = null,
    seenIds = [],
    favorites = {},
    hidden = {},
    sortBy = 'score',
    filterActive = false,
    onMissionSeen,
    onToggleFavorite,
    onHide,
    onCopyLink,
    onOpenLink,
    onRetry,
    onStartScan,
    onClearFilters,
  }: {
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
    onOpenLink?: (url: string) => void;
    onRetry?: () => void;
    onStartScan?: () => void;
    onClearFilters?: () => void;
  } = $props();

  // Use $derived.by for explicit reactivity with defensive checks
  const sortedMissions = $derived.by(() => {
    // Defensive: handle undefined/null cases
    if (!missions || !Array.isArray(missions) || missions.length === 0) {
      return [];
    }
    // Create a new array to ensure reactivity tracking
    return [...missions].sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(b.scrapedAt).getTime() - new Date(a.scrapedAt).getTime();
      }
      if (sortBy === 'tjm') {
        return (b.tjm ?? 0) - (a.tjm ?? 0);
      }
      return (b.score ?? 0) - (a.score ?? 0);
    });
  });

  if (import.meta.env.DEV) {
    $effect(() => {
      console.debug(
        '[MissionFeed] missions prop:',
        missions?.length ?? 0,
        'sortedMissions:',
        sortedMissions.length
      );
    });
  }
</script>

<div class="flex flex-col gap-3 overflow-y-auto">
  {#if isLoading && sortedMissions.length === 0}
    {#each Array(3) as _, i (i)}
      <div class="section-card rounded-xl p-4 space-y-3">
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
    <OperationalEmptyState
      title="Le feed ne peut pas être synchronisé"
      description={error}
      severity="critical"
      statusLabel="Incident"
      icon="triangle-alert"
      proofLabel="Résultat affiché"
      proofValue="0 mission"
      primaryActionLabel="Réessayer"
      primaryActionIcon="refresh-cw"
      secondaryActionLabel={filterActive ? 'Réinitialiser les filtres' : null}
      secondaryActionIcon="filter-x"
      onPrimaryAction={onRetry}
      onSecondaryAction={onClearFilters}
    />
  {:else if sortedMissions.length === 0}
    {#if filterActive}
      <OperationalEmptyState
        title="Aucune mission ne correspond à cette décision"
        description="Le système n’a pas trouvé d’opportunité dans le périmètre courant. La prochaine action utile est d’élargir les critères avant de rescanner."
        severity="attention"
        statusLabel="Filtre trop strict"
        icon="filter-x"
        proofLabel="Résultat filtré"
        proofValue="0 mission"
        primaryActionLabel="Réinitialiser les filtres"
        primaryActionIcon="filter-x"
        secondaryActionLabel="Relancer le scan"
        secondaryActionIcon="refresh-cw"
        onPrimaryAction={onClearFilters}
        onSecondaryAction={onStartScan}
      />
    {:else}
      <OperationalEmptyState
        title="Lancez un premier scan pour voir vos missions"
        description="Aucune mission exploitable n’est stockée. Lancez un scan pour transformer les sources connectées en missions à examiner."
        severity="neutral"
        statusLabel="Aucune donnée"
        icon="radar"
        proofLabel="Feed actuel"
        proofValue="0 mission"
        primaryActionLabel="Lancer le scan"
        primaryActionIcon="play"
        onPrimaryAction={onStartScan}
      />
    {/if}
  {:else}
    {#if error}
      <div class="section-card rounded-lg flex items-center gap-3 px-4 py-3">
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-status-red/12">
          <Icon name="x" size={14} class="text-status-red" />
        </div>
        <p class="text-xs leading-relaxed text-text-secondary">{error}</p>
      </div>
    {/if}
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
          {onOpenLink}
        />
      </div>
    {/each}
    <p class="py-2 text-center text-[11px] text-text-muted">
      {sortedMissions.length} mission{sortedMissions.length > 1 ? 's' : ''} triée{sortedMissions.length >
      1
        ? 's'
        : ''} par {sortBy === 'score' ? 'pertinence' : sortBy === 'date' ? 'date' : 'TJM'}
    </p>
  {/if}
</div>
