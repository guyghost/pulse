<script lang="ts">
  import { tick } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { Icon, type IconName } from '@pulse/ui';
  import type { MissionSource } from '$lib/core/types/mission';
  import type { FeedDecisionPresetId, FeedScoreBucket } from '$lib/core/types/feed-view';
  import type {
    FeedFilterDraft,
    FeedFilterSheetDismissReason,
    FeedFilterSheetEvent,
  } from '../../models/feed-filter-sheet.model';

  type FilterEvent = Exclude<FeedFilterSheetEvent, { type: 'OPEN' | 'DISMISS' | 'DISPOSE' }>;

  type SourceOption = {
    value: MissionSource;
    label: string;
    shortLabel: string;
    icon: string;
    count: number;
  };
  type QuickFilter = {
    id: 'priority' | 'remote' | 'new';
    label: string;
    icon: IconName;
    active: boolean;
    onSelect: () => void;
  };

  const {
    draft,
    visibleCount,
    sources = [],
    tjmTarget = null,
    onEdit,
    onDismiss,
  }: {
    draft: FeedFilterDraft;
    visibleCount: number;
    sources?: SourceOption[];
    tjmTarget?: number | null;
    onEdit: (event: FilterEvent) => void;
    onDismiss: (reason: FeedFilterSheetDismissReason) => void;
  } = $props();

  let panel = $state<HTMLElement | null>(null);
  const failedSourceIcons = $state<Record<string, boolean>>({});
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motionDuration = prefersReducedMotion ? 0 : 320;
  const scrimDuration = prefersReducedMotion ? 0 : 180;

  const tjmOptions = $derived.by(() => {
    const target = tjmTarget && tjmTarget > 0 ? Math.round(tjmTarget / 50) * 50 : 500;
    return [
      ...new Set([500, Math.max(300, target - 100), target, target + 100, target + 200]),
    ].sort((left, right) => left - right);
  });
  const quickFilters = $derived.by<QuickFilter[]>(() => [
    {
      id: 'priority',
      label: 'Prioritaires',
      icon: 'star',
      active: draft.decisionPreset === 'priority',
      onSelect: () => togglePreset('priority'),
    },
    {
      id: 'remote',
      label: 'Remote',
      icon: 'wifi',
      active: draft.decisionPreset === 'remote-compatible',
      onSelect: () => togglePreset('remote-compatible'),
    },
    {
      id: 'new',
      label: 'Nouvelles',
      icon: 'sparkles',
      active: draft.decisionPreset === 'new',
      onSelect: () => togglePreset('new'),
    },
  ]);
  const coverageSources = $derived.by(() =>
    [...sources]
      .filter((source) => source.count > 0)
      .sort((left, right) => right.count - left.count)
      .slice(0, 4)
  );
  const zeroSourceCount = $derived(sources.filter((source) => source.count === 0).length);
  const maxSourceCount = $derived(Math.max(1, ...coverageSources.map((source) => source.count)));
  const contributingSourceCount = $derived(
    draft.selectedSource === null
      ? sources.filter((source) => source.count > 0).length
      : sources.some((source) => source.value === draft.selectedSource && source.count > 0)
        ? 1
        : 0
  );

  $effect(() => {
    void tick().then(() => panel?.focus());
  });

  function togglePreset(preset: FeedDecisionPresetId): void {
    onEdit({ type: 'TOGGLE_PRESET', preset });
  }

  function handleScoreChange(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    const bucket: FeedScoreBucket | null =
      value === 'strong' || value === 'good' || value === 'weak' ? value : null;
    onEdit({ type: 'SET_SCORE_BUCKET', bucket });
  }

  function handleTjmChange(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    onEdit({ type: 'SET_TJM_MIN', tjmMin: value ? Number(value) : null });
  }

  function handleSourceSelect(source: MissionSource): void {
    onEdit({
      type: 'SET_SOURCE',
      source: draft.selectedSource === source ? null : source,
    });
  }

  function isSourceIncluded(source: SourceOption): boolean {
    if (draft.selectedSource !== null) {
      return draft.selectedSource === source.value;
    }
    return source.count > 0;
  }

  function markSourceIconFailed(source: MissionSource): void {
    failedSourceIcons[source] = true;
  }
</script>

<div class="pointer-events-none absolute inset-0 z-50" data-testid="feed-filter-sheet-layer">
  <button
    type="button"
    class="pointer-events-auto absolute inset-0 cursor-default bg-text-primary/24 backdrop-blur-[1px]"
    aria-label="Fermer les filtres"
    onclick={() => onDismiss('scrim')}
    transition:fade={{ duration: scrimDuration }}
  ></button>

  <div
    bind:this={panel}
    id="filter-panel"
    class="bottom-sheet pointer-events-auto absolute inset-x-0 bottom-0 flex h-[70%] max-h-[calc(100%-5rem)] flex-col overflow-visible rounded-t-[1.75rem] border-x border-t border-border-light bg-surface-white/98 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1.5 outline-none shadow-[0_-24px_64px_rgba(28,25,23,0.20)] backdrop-blur-2xl"
    role="dialog"
    aria-modal="true"
    aria-labelledby="filter-sheet-title"
    tabindex="-1"
    transition:fly={{ y: 76, opacity: 0.82, duration: motionDuration, easing: cubicOut }}
  >
    <button
      type="button"
      class="soft-ring absolute -top-[3.75rem] left-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/75 bg-surface-white/96 text-text-secondary shadow-[0_10px_28px_rgba(28,25,23,0.18)] backdrop-blur-xl transition-[background-color,color,transform] duration-200 hover:bg-subtle-gray hover:text-text-primary active:scale-95"
      aria-label="Fermer les filtres et revenir au feed"
      onclick={() => onDismiss('button')}
    >
      <Icon name="x" size={20} />
    </button>

    <div
      class="flex h-6 shrink-0 items-center justify-center text-disabled-gray"
      aria-hidden="true"
    >
      <Icon name="minus" size={42} />
    </div>

    <div class="shrink-0 px-5 pb-1.5 pt-1">
      <h2 id="filter-sheet-title" class="text-[1rem] font-semibold text-text-primary">
        Filtrer les missions
      </h2>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">
      <div class="mt-3 grid grid-cols-3 gap-2" aria-label="Filtres rapides">
        {#each quickFilters as filter (filter.id)}
          <button
            type="button"
            class="flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-full border px-1 py-2 text-center outline-none transition-[background-color,border-color,color,transform] duration-200 focus-visible:ring-2 focus-visible:ring-blueprint-blue/35 focus-visible:ring-offset-2 active:scale-[0.97] {filter.active
              ? 'border-blueprint-blue/45 bg-blueprint-blue/[0.08] text-blueprint-blue shadow-[inset_0_0_0_1px_rgba(11,100,233,0.08)]'
              : 'border-border-light bg-surface-white text-text-secondary hover:border-disabled-gray hover:bg-subtle-gray'}"
            aria-pressed={filter.active}
            onclick={filter.onSelect}
          >
            <Icon name={filter.icon} size={15} class={filter.active ? 'text-blueprint-blue' : ''} />
            <span
              class="max-w-full truncate text-[0.6875rem] font-medium tracking-[-0.015em] min-[400px]:text-xs"
              >{filter.label}</span
            >
          </button>
        {/each}
      </div>

      <div class="mt-4 divide-y divide-border-light border-y border-border-light">
        <label class="grid min-h-14 grid-cols-[1.75rem_1fr_7.25rem] items-center gap-2 py-2">
          <Icon name="star" size={20} class="text-text-subtle" />
          <span class="text-caption font-medium text-text-primary">Note minimale</span>
          <span class="relative min-w-0">
            <select
              class="soft-ring h-10 w-full appearance-none rounded-xl border border-border-light bg-surface-white px-3 pr-8 text-caption text-text-primary"
              aria-label="Note minimale"
              value={draft.selectedScoreBucket ?? ''}
              onchange={handleScoreChange}
            >
              <option value="">Toutes</option>
              <option value="strong">A</option>
              <option value="good">B</option>
              <option value="weak">C</option>
            </select>
            <Icon
              name="chevron-down"
              size={15}
              class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-subtle"
            />
          </span>
        </label>

        <label class="grid min-h-14 grid-cols-[1.75rem_1fr_7.25rem] items-center gap-2 py-2">
          <Icon name="badge-euro" size={20} class="text-text-subtle" />
          <span class="text-caption font-medium text-text-primary">TJM minimum</span>
          <span class="relative min-w-0">
            <select
              class="soft-ring h-10 w-full appearance-none rounded-xl border border-border-light bg-surface-white px-3 pr-8 text-caption text-text-primary"
              aria-label="TJM minimum"
              value={draft.selectedTjmMin?.toString() ?? ''}
              onchange={handleTjmChange}
            >
              <option value="">Tous</option>
              {#each tjmOptions as amount (amount)}
                <option value={String(amount)}>{amount} € / j</option>
              {/each}
            </select>
            <Icon
              name="chevron-down"
              size={15}
              class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-subtle"
            />
          </span>
        </label>
      </div>

      <section class="pb-3 pt-4" aria-labelledby="filter-sources-title">
        <div class="flex items-center justify-between gap-3">
          <h3 id="filter-sources-title" class="text-caption font-semibold text-text-primary">
            Sources
          </h3>
          <span class="flex items-center gap-1 text-micro font-medium text-text-subtle">
            {draft.selectedSource === null
              ? 'Toutes'
              : (sources.find((source) => source.value === draft.selectedSource)?.label ??
                'Toutes')}
            <Icon name="chevron-up" size={14} />
          </span>
        </div>

        <div class="mt-3 grid grid-cols-6 gap-1" role="group" aria-label="Sélectionner une source">
          {#each sources as source (source.value)}
            <button
              type="button"
              class="soft-ring group flex min-w-0 flex-col items-center gap-1 rounded-xl py-1.5 text-center transition-colors hover:bg-subtle-gray/70"
              aria-pressed={draft.selectedSource === source.value}
              aria-label={draft.selectedSource === source.value
                ? `Retirer le filtre ${source.label}`
                : `Filtrer sur ${source.label}, ${source.count} missions`}
              onclick={() => handleSourceSelect(source.value)}
            >
              <span
                class="relative flex h-11 w-11 items-center justify-center rounded-xl border bg-surface-white transition-[border-color,box-shadow] {isSourceIncluded(
                  source
                )
                  ? 'border-blueprint-blue/35 shadow-[0_3px_12px_rgba(11,100,233,0.10)]'
                  : 'border-border-light'}"
              >
                {#if !failedSourceIcons[source.value]}
                  <img
                    src={source.icon}
                    alt=""
                    width="30"
                    height="30"
                    class="max-h-[1.875rem] max-w-[1.875rem] rounded-md object-contain"
                    onerror={() => markSourceIconFailed(source.value)}
                  />
                {:else}
                  <span class="text-micro font-bold text-text-secondary">
                    {source.label.slice(0, 2).toUpperCase()}
                  </span>
                {/if}
                {#if isSourceIncluded(source)}
                  <span
                    class="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-surface-white bg-blueprint-blue text-white"
                    aria-hidden="true"
                  >
                    <Icon name="check" size={9} />
                  </span>
                {/if}
              </span>
              <span
                class="w-full truncate text-[0.5625rem] font-medium text-text-secondary min-[400px]:text-micro"
              >
                {source.shortLabel}
              </span>
            </button>
          {/each}
        </div>

        <div class="mt-3 border-t border-border-light pt-3">
          <h4 class="text-caption font-semibold text-text-primary">Couverture des sources</h4>
          <div class="mt-2 space-y-1.5">
            {#each coverageSources as source (source.value)}
              <div
                class="grid grid-cols-[1.1rem_minmax(5.5rem,1fr)_1.75rem_2.6fr] items-center gap-2"
              >
                {#if !failedSourceIcons[source.value]}
                  <img
                    src={source.icon}
                    alt=""
                    width="14"
                    height="14"
                    class="max-h-3.5 max-w-3.5 rounded-sm object-contain"
                    onerror={() => markSourceIconFailed(source.value)}
                  />
                {:else}
                  <span class="text-[0.4375rem] font-bold text-text-secondary">
                    {source.label.slice(0, 2).toUpperCase()}
                  </span>
                {/if}
                <span class="truncate text-micro font-medium text-text-secondary">
                  {source.label}
                </span>
                <span class="text-right text-micro tabular-nums text-text-subtle">
                  {source.count}
                </span>
                <progress
                  class="source-progress h-1.5 w-full overflow-hidden rounded-full"
                  max={maxSourceCount}
                  value={source.count}
                  aria-label={`${source.label} : ${source.count} missions`}
                ></progress>
              </div>
            {/each}
            {#if zeroSourceCount > 0}
              <div class="flex items-center gap-2 pt-0.5 text-micro text-text-muted">
                <Icon name="database" size={13} />
                <span>
                  {zeroSourceCount} connecteur{zeroSourceCount > 1 ? 's' : ''} sans mission
                </span>
              </div>
            {/if}
          </div>
        </div>

        <div
          class="mt-3 flex items-center gap-2 rounded-xl bg-blueprint-blue/[0.05] px-3 py-2 text-micro text-text-secondary"
        >
          <Icon name="info" size={14} class="shrink-0 text-blueprint-blue" />
          <span>
            {visibleCount} mission{visibleCount > 1 ? 's' : ''} issue{visibleCount > 1 ? 's' : ''}
            de
            <strong class="font-semibold text-blueprint-blue"
              >{contributingSourceCount} source{contributingSourceCount > 1 ? 's' : ''}</strong
            >
          </span>
        </div>
      </section>
    </div>

    <footer
      class="flex shrink-0 items-center justify-between gap-2 border-t border-border-light px-5 pt-3"
    >
      <button
        type="button"
        class="inline-flex items-center gap-1.5 text-micro font-medium text-text-subtle transition-colors hover:text-text-primary"
        onclick={() => onEdit({ type: 'RESET_FILTERS' })}
      >
        <Icon name="refresh-cw" size={15} />
        Réinitialiser
      </button>
      <span
        class="flex min-w-0 items-center justify-center gap-1.5 truncate text-micro text-text-subtle"
        aria-live="polite"
        aria-atomic="true"
      >
        <span class="h-2 w-2 shrink-0 rounded-full bg-accent-green" aria-hidden="true"></span>
        {visibleCount} mission{visibleCount > 1 ? 's' : ''}
      </span>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 text-micro font-semibold text-blueprint-blue transition-colors hover:text-blueprint-blue/80"
        onclick={() => onDismiss('button')}
      >
        <Icon name="check-circle" size={15} />
        Terminer
      </button>
    </footer>
  </div>
</div>

<style>
  .bottom-sheet:focus,
  .bottom-sheet:focus-visible {
    outline: none !important;
  }

  .source-progress {
    appearance: none;
    border: 0;
    background: var(--color-subtle-gray);
  }

  .source-progress::-webkit-progress-bar {
    border-radius: 9999px;
    background: var(--color-subtle-gray);
  }

  .source-progress::-webkit-progress-value {
    border-radius: 9999px;
    background: var(--color-blueprint-blue);
  }

  .source-progress::-moz-progress-bar {
    border-radius: 9999px;
    background: var(--color-blueprint-blue);
  }

  @media (prefers-reduced-motion: reduce) {
    .bottom-sheet {
      transform: none !important;
    }
  }
</style>
