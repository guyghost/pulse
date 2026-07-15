<script lang="ts">
  import { tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import { quartOut } from 'svelte/easing';
  import { Icon } from '@pulse/ui';
  import type { Mission } from '$lib/core/types/mission';

  type ArrivalStackState = 'empty' | 'collapsed' | 'open' | 'refreshing' | 'refresh-error';

  const {
    count,
    missions = [],
    state: stackState = 'collapsed',
    errorMessage = null,
    onOpen,
    onClose,
    onRefresh,
  }: {
    count: number;
    missions?: Mission[];
    state?: ArrivalStackState;
    errorMessage?: string | null;
    onOpen?: () => void;
    onClose?: () => void;
    onRefresh?: () => void;
  } = $props();

  let triggerElement: HTMLButtonElement | undefined = $state();
  let drawerHeading: HTMLHeadingElement | undefined = $state();
  let wasExpanded = false;

  const boundedCount = $derived(Math.max(0, count));
  const layerIndexes = $derived(Array.from({ length: Math.min(3, boundedCount) }));
  const previews = $derived(missions.slice(0, 3));
  const isExpanded = $derived(
    stackState === 'open' || stackState === 'refreshing' || stackState === 'refresh-error'
  );
  const isRefreshing = $derived(stackState === 'refreshing');
  const countLabel = $derived(
    boundedCount === 1
      ? '1 nouvelle mission arrivée'
      : `${boundedCount} nouvelles missions arrivées`
  );
  const refreshLabel = $derived(
    boundedCount === 1
      ? 'Actualiser la file avec la mission'
      : `Actualiser la file avec les ${boundedCount} missions`
  );

  $effect(() => {
    if (isExpanded && !wasExpanded) {
      drawerHeading?.focus();
    } else if (!isExpanded && wasExpanded) {
      void tick().then(() => triggerElement?.focus());
    }
    wasExpanded = isExpanded;
  });

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !isExpanded || isRefreshing) {
      return;
    }
    event.preventDefault();
    onClose?.();
  }

  function remoteLabel(remote: Mission['remote']): string {
    if (remote === 'full') {
      return 'Remote';
    }
    if (remote === 'hybrid') {
      return 'Hybride';
    }
    if (remote === 'onsite') {
      return 'Sur site';
    }
    return 'Mode non précisé';
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<aside
  class="mission-arrival-stack fixed inset-x-4 bottom-4 z-40 mx-auto max-w-lg"
  data-testid="mission-arrival-stack"
  aria-label="Nouvelles missions en attente"
>
  {#if isExpanded}
    <section
      class="overflow-hidden rounded-xl border border-border-light bg-surface-white shadow-lg"
      aria-labelledby="arrival-drawer-title"
      transition:fly={{ y: 6, duration: 180, easing: quartOut }}
    >
      <div class="flex items-start justify-between gap-4 border-b border-border-light px-4 py-3">
        <div class="min-w-0">
          <p class="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-blueprint-blue">
            En attente
          </p>
          <h2
            id="arrival-drawer-title"
            class="text-sm font-semibold text-text-primary outline-none"
            data-testid="arrival-drawer-heading"
            tabindex="-1"
            bind:this={drawerHeading}
          >
            {countLabel}
          </h2>
          <p class="mt-1 text-xs leading-5 text-text-subtle">
            Votre lecture reste en place jusqu’à l’actualisation.
          </p>
        </div>

        <button
          type="button"
          class="grid size-9 shrink-0 place-items-center rounded-lg text-text-subtle transition-colors hover:bg-subtle-gray hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blueprint-blue disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-text-subtle"
          aria-label="Fermer les nouvelles arrivées"
          disabled={isRefreshing}
          onclick={() => onClose?.()}
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      <div class="max-h-[min(48vh,20rem)] overflow-y-auto px-4 py-2">
        {#if previews.length > 0}
          <ul class="divide-y divide-border-light" aria-label="Aperçu des nouvelles missions">
            {#each previews as mission (mission.id)}
              <li class="py-3" data-testid="arrival-preview">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-text-primary">{mission.title}</p>
                    <p class="mt-1 truncate text-xs text-text-subtle">
                      {mission.client ?? mission.source} · {remoteLabel(mission.remote)}
                    </p>
                  </div>
                  {#if mission.tjm !== null}
                    <span class="shrink-0 text-xs font-semibold tabular-nums text-text-secondary">
                      {mission.tjm} €/j
                    </span>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="py-4 text-xs leading-5 text-text-subtle">
            Les aperçus seront disponibles à la fin de la collecte.
          </p>
        {/if}
      </div>

      {#if stackState === 'refresh-error'}
        <p
          class="mx-4 mb-3 rounded-lg bg-status-red/10 px-3 py-2 text-xs text-status-red"
          role="alert"
        >
          {errorMessage ?? 'Impossible d’actualiser la file. Réessayer.'}
        </p>
      {/if}

      <div class="border-t border-border-light p-3">
        <button
          type="button"
          class="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blueprint-blue px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blueprint-blue/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blueprint-blue disabled:cursor-wait disabled:opacity-60"
          aria-label={isRefreshing ? 'Actualisation de la file en cours' : refreshLabel}
          disabled={isRefreshing}
          onclick={() => onRefresh?.()}
        >
          <Icon
            name={isRefreshing ? 'loader-2' : 'refresh-cw'}
            size={15}
            class={isRefreshing ? 'animate-spin' : ''}
          />
          {isRefreshing ? 'Actualisation…' : refreshLabel}
        </button>
      </div>
    </section>
  {:else}
    <div class="relative h-[4.75rem]">
      {#each layerIndexes as _, index (index)}
        <div
          class="absolute inset-x-0 h-14 rounded-xl border border-border-light bg-surface-white"
          class:top-0={index === 0}
          class:top-1.5={index === 1}
          class:top-3={index === 2}
          style={`z-index: ${layerIndexes.length - index}`}
          aria-hidden="true"
          data-testid="arrival-stack-layer"
        ></div>
      {/each}

      <button
        type="button"
        class="absolute inset-x-0 top-3 z-10 flex min-h-14 items-center gap-3 rounded-xl border border-border-light bg-surface-white px-4 text-left shadow-md transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blueprint-blue"
        aria-label={boundedCount === 1
          ? 'Ouvrir 1 nouvelle mission arrivée'
          : `Ouvrir les ${countLabel}`}
        onclick={() => onOpen?.()}
        bind:this={triggerElement}
      >
        <span
          class="grid size-9 shrink-0 place-items-center rounded-lg bg-blueprint-blue/10 text-blueprint-blue"
        >
          <Icon name="layers" size={17} />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-xs font-semibold text-text-primary">Nouvelles arrivées</span>
          <span class="mt-0.5 block truncate text-[11px] text-text-subtle">
            Prêtes à rejoindre votre file
          </span>
        </span>
        <span
          class="rounded-md bg-blueprint-blue px-2 py-1 text-xs font-semibold tabular-nums text-white"
          aria-hidden="true"
        >
          +{boundedCount}
        </span>
        <Icon name="chevron-up" size={15} class="text-text-subtle" />
      </button>
    </div>
  {/if}
</aside>

<style>
  @media (prefers-reduced-motion: reduce) {
    .mission-arrival-stack,
    .mission-arrival-stack * {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
