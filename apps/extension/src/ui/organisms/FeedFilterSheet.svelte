<script lang="ts">
  import { tick } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { Icon, type IconName } from '@pulse/ui';
  import type { MissionSource, RemoteType } from '$lib/core/types/mission';
  import type { SeniorityLevel } from '$lib/core/types/profile';
  import type { FeedDecisionPresetId, FeedScoreBucket } from '$lib/core/types/feed-view';
  import type {
    FeedFilterDraft,
    FeedFilterSheetDismissReason,
    FeedFilterSheetEvent,
  } from '../../models/feed-filter-sheet.model';

  type DraftEvent = Exclude<
    FeedFilterSheetEvent,
    { type: 'OPEN' | 'DISMISS' | 'APPLY' | 'DISPOSE' }
  >;

  type SourceOption = { value: MissionSource; label: string };
  type PresetOption = {
    value: FeedDecisionPresetId;
    label: string;
    icon: IconName;
  };

  const presets: PresetOption[] = [
    { value: 'priority', label: 'Prioritaires', icon: 'target' },
    { value: 'remote-compatible', label: 'Remote', icon: 'wifi' },
    { value: 'new', label: 'Nouvelles', icon: 'sparkles' },
  ];

  const scoreOptions: { value: FeedScoreBucket | null; label: string }[] = [
    { value: null, label: 'Toutes' },
    { value: 'strong', label: 'A' },
    { value: 'good', label: 'B' },
    { value: 'weak', label: 'C' },
  ];

  const remoteOptions: { value: RemoteType | null; label: string }[] = [
    { value: null, label: 'Tous' },
    { value: 'full', label: 'Remote' },
    { value: 'hybrid', label: 'Hybride' },
    { value: 'onsite', label: 'Sur site' },
  ];

  const seniorityOptions: { value: SeniorityLevel | null; label: string }[] = [
    { value: null, label: 'Tous' },
    { value: 'junior', label: 'Junior' },
    { value: 'confirmed', label: 'Confirmé' },
    { value: 'senior', label: 'Senior' },
  ];

  const {
    draft,
    visibleCount,
    availableStacks = [],
    sources = [],
    onEdit,
    onDismiss,
    onApply,
  }: {
    draft: FeedFilterDraft;
    visibleCount: number;
    availableStacks?: string[];
    sources?: SourceOption[];
    onEdit: (event: DraftEvent) => void;
    onDismiss: (reason: FeedFilterSheetDismissReason) => void;
    onApply: () => void;
  } = $props();

  let closeButton = $state<HTMLButtonElement | null>(null);
  let expandedSection = $state<'score' | 'source' | 'advanced' | null>(null);
  const visibleStacks = $derived.by(() => {
    const pinned = draft.selectedStacks.filter((stack) => availableStacks.includes(stack));
    return [...new Set([...pinned, ...availableStacks])].slice(0, 8);
  });
  const scoreLabel = $derived(
    draft.selectedScoreBucket === 'strong'
      ? '80 % et plus'
      : draft.selectedScoreBucket === 'good'
        ? '60 % et plus'
        : draft.selectedScoreBucket === 'weak'
          ? 'Toutes les notes'
          : 'Toutes'
  );
  const sourceLabel = $derived(
    sources.find((source) => source.value === draft.selectedSource)?.label ?? 'Toutes'
  );
  const advancedCount = $derived(
    Number(draft.selectedRemote !== null) +
      Number(draft.selectedSeniority !== null) +
      draft.selectedStacks.length
  );

  $effect(() => {
    void tick().then(() => closeButton?.focus());
  });

  function togglePreset(preset: FeedDecisionPresetId): void {
    onEdit({ type: 'TOGGLE_PRESET', preset });
  }

  function setScoreBucket(bucket: FeedScoreBucket | null): void {
    onEdit({ type: 'SET_SCORE_BUCKET', bucket });
  }

  function setRemote(remote: RemoteType | null): void {
    onEdit({ type: 'SET_REMOTE', remote });
  }

  function setSource(source: MissionSource | null): void {
    onEdit({ type: 'SET_SOURCE', source });
  }

  function setSeniority(seniority: SeniorityLevel | null): void {
    onEdit({ type: 'SET_SENIORITY', seniority });
  }

  function toggleSection(section: 'score' | 'source' | 'advanced'): void {
    expandedSection = expandedSection === section ? null : section;
  }
</script>

<div class="absolute inset-0 z-50" data-testid="feed-filter-sheet-layer">
  <button
    type="button"
    class="absolute inset-0 cursor-default bg-text-primary/18 backdrop-blur-[1px]"
    aria-label="Fermer les filtres sans appliquer"
    onclick={() => onDismiss('scrim')}
    transition:fade={{ duration: 150 }}
  ></button>

  <section
    id="filter-panel"
    class="absolute inset-x-0 bottom-0 flex max-h-[35%] flex-col overflow-hidden rounded-t-[1.5rem] border border-border-light bg-surface-white shadow-2xl"
    role="group"
    aria-label="Options de filtrage"
    aria-labelledby="filter-sheet-title"
    transition:fly={{ y: 28, duration: 190, easing: cubicOut }}
  >
    <div class="shrink-0 px-4 pb-1.5 pt-1.5">
      <div class="mx-auto h-1 w-9 rounded-full bg-disabled-gray" aria-hidden="true"></div>
      <div class="mt-1 flex items-center justify-between gap-3">
        <h2 id="filter-sheet-title" class="text-heading font-semibold text-text-primary">
          Filtrer les missions
        </h2>
        <button
          bind:this={closeButton}
          type="button"
          class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-light bg-surface-white text-text-subtle transition-colors hover:bg-subtle-gray hover:text-text-primary"
          aria-label="Masquer les filtres"
          onclick={() => onDismiss('button')}
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      <div class="mt-1.5 grid grid-cols-3 gap-2" aria-label="Filtres rapides">
        {#each presets as preset (preset.value)}
          <button
            type="button"
            class="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-xl border px-2 text-caption font-medium transition-colors {draft.decisionPreset ===
            preset.value
              ? 'border-blueprint-blue/25 bg-blueprint-blue/8 text-blueprint-blue'
              : 'border-border-light bg-page-canvas text-text-secondary hover:bg-subtle-gray'}"
            aria-pressed={draft.decisionPreset === preset.value}
            onclick={() => togglePreset(preset.value)}
          >
            <Icon name={preset.icon} size={13} />
            <span class="truncate">{preset.label}</span>
          </button>
        {/each}
      </div>
    </div>

    <div
      class="min-h-0 flex-1 overflow-y-auto border-t border-border-light bg-page-canvas/55 px-4 py-1"
    >
      <div class="overflow-hidden rounded-2xl border border-border-light bg-surface-white">
        <button
          type="button"
          class="flex min-h-10 w-full items-center justify-between gap-3 px-3 py-2 text-left text-body font-medium text-text-secondary transition-colors hover:bg-subtle-gray/60"
          aria-expanded={expandedSection === 'score'}
          onclick={() => toggleSection('score')}
        >
          <span class="flex items-center gap-2">
            <Icon name="star" size={14} />
            Note minimale
          </span>
          <span class="flex items-center gap-2 text-text-muted">
            {scoreLabel}
            <Icon
              name="chevron-down"
              size={13}
              class={expandedSection === 'score' ? 'rotate-180' : ''}
            />
          </span>
        </button>

        {#if expandedSection === 'score'}
          <fieldset class="border-t border-border-light bg-page-canvas/60 px-3 py-2.5">
            <legend class="sr-only">Filtrer par note</legend>
            <div class="flex flex-wrap gap-1.5">
              {#each scoreOptions as option (option.label)}
                <button
                  type="button"
                  class="min-w-12 rounded-lg border px-2.5 py-1.5 text-caption font-medium transition-colors {draft.selectedScoreBucket ===
                  option.value
                    ? 'border-blueprint-blue/25 bg-blueprint-blue/8 text-blueprint-blue'
                    : 'border-border-light bg-page-canvas text-text-subtle hover:text-text-primary'}"
                  aria-pressed={draft.selectedScoreBucket === option.value}
                  onclick={() => setScoreBucket(option.value)}>{option.label}</button
                >
              {/each}
            </div>
          </fieldset>
        {/if}

        <div class="h-px bg-border-light"></div>
        <button
          type="button"
          class="flex min-h-10 w-full items-center justify-between gap-3 px-3 py-2 text-left text-body font-medium text-text-secondary transition-colors hover:bg-subtle-gray/60"
          aria-pressed={draft.decisionPreset === 'tjm-negotiation'}
          onclick={() => togglePreset('tjm-negotiation')}
        >
          <span class="flex items-center gap-2">
            <Icon name="badge-euro" size={14} />
            TJM minimum
          </span>
          <span class="flex items-center gap-2 text-text-muted">
            {draft.decisionPreset === 'tjm-negotiation' ? 'À négocier' : 'Tous'}
            <Icon name="chevron-down" size={13} />
          </span>
        </button>

        <div class="h-px bg-border-light"></div>
        <button
          type="button"
          class="flex min-h-10 w-full items-center justify-between gap-3 px-3 py-2 text-left text-body font-medium text-text-secondary transition-colors hover:bg-subtle-gray/60"
          aria-expanded={expandedSection === 'source'}
          onclick={() => toggleSection('source')}
        >
          <span class="flex items-center gap-2">
            <Icon name="database" size={14} />
            Sources
          </span>
          <span class="flex items-center gap-2 text-text-muted">
            {sourceLabel}
            <Icon
              name="chevron-down"
              size={13}
              class={expandedSection === 'source' ? 'rotate-180' : ''}
            />
          </span>
        </button>

        {#if expandedSection === 'source'}
          <fieldset class="border-t border-border-light bg-page-canvas/60 px-3 py-2.5">
            <legend class="sr-only">Choisir les sources</legend>
            <div class="flex flex-wrap gap-1.5">
              <button
                type="button"
                class="rounded-lg border px-2.5 py-1.5 text-caption font-medium transition-colors {draft.selectedSource ===
                null
                  ? 'border-blueprint-blue/25 bg-blueprint-blue/8 text-blueprint-blue'
                  : 'border-border-light bg-page-canvas text-text-subtle hover:text-text-primary'}"
                aria-pressed={draft.selectedSource === null}
                onclick={() => setSource(null)}>Toutes</button
              >
              {#each sources as source (source.value)}
                <button
                  type="button"
                  class="rounded-lg border px-2.5 py-1.5 text-caption font-medium transition-colors {draft.selectedSource ===
                  source.value
                    ? 'border-blueprint-blue/25 bg-blueprint-blue/8 text-blueprint-blue'
                    : 'border-border-light bg-page-canvas text-text-subtle hover:text-text-primary'}"
                  aria-pressed={draft.selectedSource === source.value}
                  onclick={() => setSource(source.value)}>{source.label}</button
                >
              {/each}
            </div>
          </fieldset>
        {/if}

        {#if expandedSection === 'advanced'}
          <div class="space-y-3 border-t border-border-light bg-page-canvas/60 px-3 py-3">
            <fieldset>
              <legend class="mb-2 text-caption font-medium text-text-secondary"
                >Mode de travail</legend
              >
              <div class="flex flex-wrap gap-1.5">
                {#each remoteOptions as option (option.label)}
                  <button
                    type="button"
                    class="rounded-lg border px-2.5 py-1.5 text-caption font-medium transition-colors {draft.selectedRemote ===
                    option.value
                      ? 'border-blueprint-blue/25 bg-blueprint-blue/8 text-blueprint-blue'
                      : 'border-border-light bg-page-canvas text-text-subtle hover:text-text-primary'}"
                    aria-pressed={draft.selectedRemote === option.value}
                    onclick={() => setRemote(option.value)}>{option.label}</button
                  >
                {/each}
              </div>
            </fieldset>

            <fieldset>
              <legend class="mb-2 text-caption font-medium text-text-secondary">Séniorité</legend>
              <div class="flex flex-wrap gap-1.5">
                {#each seniorityOptions as option (option.label)}
                  <button
                    type="button"
                    class="rounded-lg border px-2.5 py-1.5 text-caption font-medium transition-colors {draft.selectedSeniority ===
                    option.value
                      ? 'border-blueprint-blue/25 bg-blueprint-blue/8 text-blueprint-blue'
                      : 'border-border-light bg-page-canvas text-text-subtle hover:text-text-primary'}"
                    aria-pressed={draft.selectedSeniority === option.value}
                    onclick={() => setSeniority(option.value)}>{option.label}</button
                  >
                {/each}
              </div>
            </fieldset>

            {#if visibleStacks.length > 0}
              <fieldset>
                <legend class="mb-2 text-caption font-medium text-text-secondary"
                  >Technologies</legend
                >
                <div class="flex flex-wrap gap-1.5">
                  {#each visibleStacks as stack (stack)}
                    <button
                      type="button"
                      class="rounded-lg border px-2.5 py-1.5 text-caption font-medium transition-colors {draft.selectedStacks.includes(
                        stack
                      )
                        ? 'border-blueprint-blue/25 bg-blueprint-blue/8 text-blueprint-blue'
                        : 'border-border-light bg-page-canvas text-text-subtle hover:text-text-primary'}"
                      aria-pressed={draft.selectedStacks.includes(stack)}
                      onclick={() => onEdit({ type: 'TOGGLE_STACK', stack })}>{stack}</button
                    >
                  {/each}
                </div>
              </fieldset>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <footer class="shrink-0 border-t border-border-light bg-surface-white px-4 pb-1.5 pt-1">
      <div class="flex items-center justify-center gap-4">
        <button
          type="button"
          class="py-1 text-caption font-medium text-text-subtle"
          aria-expanded={expandedSection === 'advanced'}
          onclick={() => toggleSection('advanced')}
        >
          Plus de critères{advancedCount > 0 ? ` (${advancedCount})` : ''}
        </button>
        <span class="h-3 w-px bg-border-light" aria-hidden="true"></span>
        <button
          type="button"
          class="py-1 text-caption font-medium text-blueprint-blue"
          onclick={() => onEdit({ type: 'RESET_DRAFT' })}>Réinitialiser</button
        >
      </div>
      <button
        type="button"
        class="flex min-h-9 w-full items-center justify-center rounded-xl bg-blueprint-blue-strong px-4 py-1.5 text-body font-semibold text-white transition-colors hover:bg-blueprint-blue-strong/90"
        onclick={onApply}
      >
        Afficher {visibleCount} mission{visibleCount > 1 ? 's' : ''}
      </button>
    </footer>
  </section>
</div>
