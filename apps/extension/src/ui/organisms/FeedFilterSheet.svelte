<script lang="ts">
  import { tick } from 'svelte';
  import { fade } from 'svelte/transition';
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

  type SourceOption = { value: MissionSource; label: string };
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
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motionDuration = prefersReducedMotion ? 0 : 360;
  const scrimDuration = prefersReducedMotion ? 0 : 150;

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

  $effect(() => {
    void tick().then(() => panel?.focus());
  });

  function genie(
    _node: Element,
    { duration = motionDuration }: { duration?: number } = {}
  ): {
    duration: number;
    easing: typeof cubicOut;
    css: (t: number, u: number) => string;
  } {
    return {
      duration,
      easing: cubicOut,
      css: (t, u) => {
        const scaleX = 0.18 + 0.82 * t;
        const scaleY = 0.06 + 0.94 * t;
        const translateY = u * 54;
        const translateX = u * -8;
        const blur = u * 1.2;
        return `opacity:${Math.min(1, t * 1.35)};transform:translate3d(${translateX}px,${translateY}px,0) scale(${scaleX},${scaleY});filter:blur(${blur}px);`;
      },
    };
  }

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

  function handleSourceChange(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    const source = sources.find((option) => option.value === value)?.value ?? null;
    onEdit({ type: 'SET_SOURCE', source });
  }
</script>

<div class="pointer-events-none absolute inset-0 z-50" data-testid="feed-filter-sheet-layer">
  <button
    type="button"
    class="pointer-events-auto absolute inset-x-0 bottom-[5.75rem] top-0 cursor-default bg-text-primary/16 backdrop-blur-[1px]"
    aria-label="Fermer les filtres"
    onclick={() => onDismiss('scrim')}
    transition:fade={{ duration: scrimDuration }}
  ></button>

  <section
    bind:this={panel}
    id="filter-panel"
    class="genie-panel pointer-events-auto absolute inset-x-9 bottom-[6.75rem] flex max-h-[calc(100%-8rem)] origin-[2.3rem_calc(100%+5rem)] flex-col overflow-visible rounded-[1.5rem] border border-border-light bg-surface-white/98 px-5 pb-4 pt-4 outline-none shadow-[0_22px_58px_rgba(28,25,23,0.24)] backdrop-blur-xl"
    role="group"
    aria-label="Options de filtrage en direct"
    aria-labelledby="filter-sheet-title"
    tabindex="-1"
    transition:genie={{ duration: motionDuration }}
  >
    <span class="genie-tail" aria-hidden="true"></span>

    <div class="relative z-10 flex items-center justify-between gap-3">
      <h2 id="filter-sheet-title" class="text-[1rem] font-semibold text-text-primary">
        Filtrer les missions
      </h2>
      <button
        type="button"
        class="soft-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-subtle transition-colors hover:bg-subtle-gray hover:text-text-primary"
        aria-label="Fermer les filtres"
        onclick={() => onDismiss('button')}
      >
        <Icon name="x" size={20} />
      </button>
    </div>

    <div class="relative z-10 mt-3 grid grid-cols-3 gap-2" aria-label="Filtres rapides">
      {#each quickFilters as filter (filter.id)}
        <button
          type="button"
          class="flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-full border px-1 py-2 text-center outline-none transition-[background-color,border-color,color,transform] duration-200 focus-visible:ring-2 focus-visible:ring-blueprint-blue/35 focus-visible:ring-offset-2 active:scale-[0.97] {filter.active
            ? 'border-blueprint-blue/45 bg-blueprint-blue/[0.08] text-blueprint-blue shadow-[inset_0_0_0_1px_rgba(11,100,233,0.08)]'
            : 'border-border-light bg-page-canvas/65 text-text-secondary hover:border-disabled-gray hover:bg-subtle-gray'}"
          aria-pressed={filter.active}
          onclick={filter.onSelect}
        >
          <Icon name={filter.icon} size={15} class={filter.active ? 'text-blueprint-blue' : ''} />
          <span
            class="max-w-full truncate text-[0.5625rem] font-medium tracking-[-0.015em] min-[400px]:text-[0.625rem]"
            >{filter.label}</span
          >
        </button>
      {/each}
    </div>

    <div class="relative z-10 mt-4 divide-y divide-border-light border-y border-border-light">
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

      <label class="grid min-h-14 grid-cols-[1.75rem_1fr_7.25rem] items-center gap-2 py-2">
        <Icon name="database" size={20} class="text-text-subtle" />
        <span class="text-caption font-medium text-text-primary">Sources</span>
        <span class="relative min-w-0">
          <select
            class="soft-ring h-10 w-full appearance-none rounded-xl border border-border-light bg-surface-white px-3 pr-8 text-caption text-text-primary"
            aria-label="Sources"
            value={draft.selectedSource ?? ''}
            onchange={handleSourceChange}
          >
            <option value="">Toutes</option>
            {#each sources as source (source.value)}
              <option value={source.value}>{source.label}</option>
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

    <footer class="relative z-10 mt-3 flex items-center justify-between gap-3">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 text-caption font-medium text-text-subtle transition-colors hover:text-text-primary"
        onclick={() => onEdit({ type: 'RESET_FILTERS' })}
      >
        <Icon name="refresh-cw" size={16} />
        Réinitialiser
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 text-caption font-semibold text-blueprint-blue transition-colors hover:text-blueprint-blue/80"
        onclick={() => onDismiss('button')}
      >
        <Icon name="check-circle" size={15} />
        Terminer
      </button>
    </footer>

    <span
      class="relative z-10 mt-3 flex min-w-0 items-center justify-center gap-2 truncate text-caption text-text-subtle"
      aria-live="polite"
      aria-atomic="true"
    >
      <span class="h-2 w-2 shrink-0 rounded-full bg-accent-green" aria-hidden="true"></span>
      {visibleCount} mission{visibleCount > 1 ? 's' : ''} affichée{visibleCount > 1 ? 's' : ''}
    </span>
  </section>
</div>

<style>
  .genie-panel {
    transform-origin: 2.3rem calc(100% + 5rem);
    isolation: isolate;
  }

  .genie-panel:focus,
  .genie-panel:focus-visible {
    outline: none !important;
  }

  .genie-tail {
    position: absolute;
    bottom: -3.45rem;
    left: 0.75rem;
    z-index: -1;
    width: 2.35rem;
    height: 4.1rem;
    border-radius: 0 0 0 100%;
    background: rgba(255, 255, 255, 0.94);
    clip-path: polygon(0 0, 62% 0, 27% 78%, 0 100%);
    filter: drop-shadow(-2px 6px 6px rgba(28, 25, 23, 0.035));
  }

  @media (prefers-reduced-motion: reduce) {
    .genie-panel {
      transform: none !important;
      filter: none !important;
    }
  }
</style>
