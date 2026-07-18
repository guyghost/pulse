<script lang="ts">
  import type { Mission } from '$lib/core/types/mission';
  import type { MissionDwellSignal } from '$lib/core/feed/mission-arrival-queue';
  import type { ApplicationStatus, MissionTracking } from '$lib/core/types/tracking';
  import { getLastTransitionTime } from '$lib/core/tracking';
  import MissionCard from '../molecules/MissionCard.svelte';
  import { Skeleton } from '@pulse/ui';
  import { Icon } from '@pulse/ui';
  import OperationalEmptyState from '../molecules/OperationalEmptyState.svelte';

  const BATCH_SIZE = 20;

  const {
    missions = [],
    isLoading = false,
    error = null,
    seenIds = [],
    favorites = {},
    favoritePendingIds = new Set<string>(),
    hidden = {},
    comparisonMissionIds = [],
    trackingByMissionId = new Map<string, MissionTracking>(),
    statusPendingMissionIds = new Set<string>(),
    sortBy = 'score',
    resetKey = '',
    filterActive = false,
    stableQueueActive = false,
    tourStep = null,
    onMissionSeen,
    onMissionReadSignal,
    onToggleFavorite,
    onHide,
    onToggleCompare,
    onStatusTransition,
    onCopyLink,
    onOpenLink,
    onInvestigateMission,
    onRetry,
    onStartScan,
    onClearFilters,
  }: {
    missions?: Mission[];
    isLoading?: boolean;
    error?: string | null;
    seenIds?: string[];
    favorites?: Record<string, number>;
    favoritePendingIds?: Set<string>;
    hidden?: Record<string, number>;
    comparisonMissionIds?: string[];
    trackingByMissionId?: Map<string, MissionTracking>;
    statusPendingMissionIds?: Set<string>;
    sortBy?: 'score' | 'date' | 'tjm';
    resetKey?: string;
    filterActive?: boolean;
    stableQueueActive?: boolean;
    tourStep?: 'score' | 'expand' | 'seen' | 'filters' | null;
    onMissionSeen?: (id: string) => void;
    onMissionReadSignal?: (id: string, signal: MissionDwellSignal) => void;
    onToggleFavorite?: (id: string) => void;
    onHide?: (id: string) => void;
    onToggleCompare?: (id: string) => void;
    onStatusTransition?: (id: string, status: ApplicationStatus) => void;
    onCopyLink?: (id: string) => void;
    onOpenLink?: (url: string) => void;
    onInvestigateMission?: (mission: Mission) => void;
    onRetry?: () => void;
    onStartScan?: () => void;
    onClearFilters?: () => void;
  } = $props();

  // Unwrap Svelte 5 $state proxy — proxied arrays aren't iterable in template context
  const seenArr = $derived(Array.isArray(seenIds) ? Array.from(seenIds) : []);
  const seenSet = $derived(new Set(seenArr));
  const comparedIds = $derived(
    new Set(Array.isArray(comparisonMissionIds) ? Array.from(comparisonMissionIds) : [])
  );
  const comparisonLimitReached = $derived(comparedIds.size >= 3);

  const sortedMissions = $derived.by(() => {
    if (!missions || !Array.isArray(missions) || missions.length === 0) {
      return [];
    }
    return missions;
  });

  // Lazy loading: show only visibleCount missions, expand on scroll or click
  let visibleCount = $state(BATCH_SIZE);
  let lastResetKey = $state<string | null>(null);

  $effect(() => {
    if (lastResetKey === null) {
      lastResetKey = resetKey;
      return;
    }

    if (resetKey === lastResetKey) {
      return;
    }
    lastResetKey = resetKey;
    visibleCount = BATCH_SIZE;
  });

  const visibleMissions = $derived(sortedMissions.slice(0, visibleCount));
  const hasMore = $derived(visibleCount < sortedMissions.length);
  const remainingCount = $derived(sortedMissions.length - visibleCount);

  function loadMore() {
    visibleCount = Math.min(visibleCount + BATCH_SIZE, sortedMissions.length);
  }

  // IntersectionObserver sentinel for auto-loading
  let sentinelEl: HTMLDivElement | undefined = $state(undefined);

  $effect(() => {
    if (!sentinelEl || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinelEl);
    return () => observer.disconnect();
  });

  if (import.meta.env.DEV) {
    $effect(() => {
      console.debug(
        '[VirtualMissionFeed] missions:',
        missions?.length ?? 0,
        'visible:',
        visibleMissions.length,
        'total:',
        sortedMissions.length
      );
    });
  }
</script>

<div class="flex flex-col gap-3">
  {#if isLoading && sortedMissions.length === 0}
    {#each Array(3) as _, i (i)}
      <div class="section-card rounded-2xl p-4 space-y-3">
        <Skeleton width="58%" height="1.15rem" />
        <Skeleton width="34%" height="0.8rem" />
        <div class="flex gap-2">
          <Skeleton width="3rem" height="1.25rem" variant="circle" />
          <Skeleton width="4rem" height="1.25rem" variant="circle" />
          <Skeleton width="3.5rem" height="1.25rem" variant="circle" />
        </div>
        <Skeleton width="100%" height="3rem" />
      </div>
    {/each}
  {:else if error && sortedMissions.length === 0}
    <OperationalEmptyState
      title="Impossible de récupérer les missions"
      description={error}
      severity="critical"
      statusLabel="Incident"
      icon="triangle-alert"
      proofLabel="Résultat affiché"
      proofValue="0 mission"
      primaryActionLabel="Réessayer le scan"
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
        description="Aucune mission ne correspond aux filtres actuels. Élargissez les critères avant de relancer un scan."
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
        description="Aucune mission n’est encore stockée. Lancez un scan pour récupérer les missions depuis vos sources connectées."
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
      <div class="section-card rounded-xl flex items-center gap-3 px-4 py-3">
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-status-red/10">
          <Icon name="x" size={14} class="text-status-red" />
        </div>
        <p class="text-xs leading-relaxed text-text-secondary">{error}</p>
      </div>
    {/if}

    <!-- Lazy-loaded list: renders only visibleCount missions, loads more on scroll -->
    <div class="flex flex-col gap-3">
      {#each visibleMissions as mission (mission.id)}
        {@const missionTracking = trackingByMissionId.get(mission.id)}
        <MissionCard
          {mission}
          isSeen={seenSet.has(mission.id)}
          isFavorite={mission.id in (favorites ?? {})}
          isFavoritePending={favoritePendingIds.has(mission.id)}
          isHidden={mission.id in (hidden ?? {})}
          isCompared={comparedIds.has(mission.id)}
          compareDisabled={comparisonLimitReached && !comparedIds.has(mission.id)}
          trackingStatus={missionTracking?.currentStatus ?? null}
          trackingUpdatedAt={missionTracking ? getLastTransitionTime(missionTracking) : null}
          isStatusTransitionPending={statusPendingMissionIds.has(mission.id)}
          tourHighlight={visibleMissions[0]?.id === mission.id ? tourStep : null}
          showSeenStatus={stableQueueActive}
          onReadSignal={(signal) => {
            if (onMissionReadSignal) {
              onMissionReadSignal(mission.id, signal);
            } else if (signal.type === 'elapsed') {
              onMissionSeen?.(mission.id);
            }
          }}
          onToggleFavorite={() => onToggleFavorite?.(mission.id)}
          onHide={() => onHide?.(mission.id)}
          onToggleCompare={() => onToggleCompare?.(mission.id)}
          onStatusTransition={(status) => onStatusTransition?.(mission.id, status)}
          onCopyLink={() => onCopyLink?.(mission.id)}
          onInvestigate={() => onInvestigateMission?.(mission)}
          {onOpenLink}
        />
      {/each}
    </div>

    <!-- Sentinel for IntersectionObserver auto-loading -->
    {#if hasMore}
      <div bind:this={sentinelEl} class="flex items-center justify-center py-4">
        <button
          class="rounded-full border border-border-light bg-surface-white px-4 py-2 text-xs text-text-secondary transition-all hover:bg-subtle-gray hover:text-text-primary"
          onclick={loadMore}
        >
          Voir {Math.min(BATCH_SIZE, remainingCount)} missions de plus ({remainingCount} restantes)
        </button>
      </div>
    {/if}

    <p class="py-2 text-center text-[11px] text-text-muted shrink-0">
      {visibleMissions.length}/{sortedMissions.length} mission{sortedMissions.length > 1 ? 's' : ''} triée{sortedMissions.length >
      1
        ? 's'
        : ''} par {sortBy === 'score' ? 'pertinence' : sortBy === 'date' ? 'date' : 'TJM'}
    </p>
  {/if}
</div>
