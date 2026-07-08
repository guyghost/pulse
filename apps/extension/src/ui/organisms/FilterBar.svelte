<script lang="ts">
  import { Chip } from '@pulse/ui';
  import { Icon } from '@pulse/ui';
  import type { MissionSource, RemoteType } from '$lib/core/types/mission';
  import type { SeniorityLevel } from '$lib/core/types/profile';
  import type { SavedFeedView } from '$lib/core/types/feed-view';
  import { getConnectorsMeta } from '$lib/shell/facades/feed-data.facade';
  import Tooltip from '../atoms/Tooltip.svelte';

  const {
    availableStacks = [],
    selectedStacks = [],
    selectedSource = null,
    selectedRemote = null,
    selectedSeniority = null,
    savedViews = [],
    activeSavedViewId = null,
    canSaveCurrentView = false,
    savedViewLimitReached = false,
    onToggleStack,
    onSetSource,
    onSetRemote,
    onSetSeniority,
    onClearAll,
    onSaveView,
    onApplyView,
    onDeleteView,
  }: {
    availableStacks?: string[];
    selectedStacks?: string[];
    selectedSource?: MissionSource | null;
    selectedRemote?: RemoteType | null;
    selectedSeniority?: SeniorityLevel | null;
    savedViews?: SavedFeedView[];
    activeSavedViewId?: string | null;
    canSaveCurrentView?: boolean;
    savedViewLimitReached?: boolean;
    onToggleStack?: (stack: string) => void;
    onSetSource?: (source: MissionSource | null) => void;
    onSetRemote?: (remote: RemoteType | null) => void;
    onSetSeniority?: (seniority: SeniorityLevel | null) => void;
    onClearAll?: () => void;
    onSaveView?: (name: string) => Promise<void> | void;
    onApplyView?: (id: string) => void;
    onDeleteView?: (id: string) => Promise<void> | void;
  } = $props();

  let saveOpen = $state(false);
  let saveName = $state('');
  let isSaving = $state(false);

  const hasFilters = $derived(
    selectedStacks.length > 0 ||
      selectedSource !== null ||
      selectedRemote !== null ||
      selectedSeniority !== null
  );

  const sources: { value: MissionSource; label: string }[] = getConnectorsMeta().map((m) => ({
    value: m.id as MissionSource,
    label: m.name,
  }));

  const remoteTypes: { value: RemoteType; label: string }[] = [
    { value: 'full', label: 'Full remote' },
    { value: 'hybrid', label: 'Hybride' },
    { value: 'onsite', label: 'Sur site' },
  ];

  const seniorityLevels: { value: SeniorityLevel; label: string }[] = [
    { value: 'junior', label: 'Junior' },
    { value: 'confirmed', label: 'Confirmé' },
    { value: 'senior', label: 'Senior' },
  ];

  async function handleSaveSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!canSaveCurrentView || savedViewLimitReached || isSaving) {
      return;
    }
    isSaving = true;
    try {
      await onSaveView?.(saveName);
      saveName = '';
      saveOpen = false;
    } finally {
      isSaving = false;
    }
  }
</script>

<div class="flex flex-col gap-3 rounded-2xl border border-border-light bg-page-canvas p-3">
  <div>
    <div class="mb-2 flex items-center justify-between gap-2">
      <p class="text-[11px] uppercase tracking-[0.15em] text-text-subtle">Vues</p>
      <Tooltip
        label={savedViewLimitReached
          ? 'Limite de vues atteinte'
          : canSaveCurrentView
            ? 'Enregistrer la vue'
            : 'Aucun filtre à enregistrer'}
        description="Sauvegarde la combinaison actuelle de filtres."
      >
        <button
          type="button"
          class="inline-flex h-7 items-center gap-1 rounded-lg border border-border-light bg-surface-white px-2 text-[10px] font-medium text-text-secondary transition-colors hover:bg-subtle-gray hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          onclick={() => (saveOpen = !saveOpen)}
          disabled={!canSaveCurrentView || savedViewLimitReached}
        >
          <Icon name="bookmark-plus" size={12} />
          Enregistrer
        </button>
      </Tooltip>
    </div>

    {#if savedViews.length > 0}
      <div class="flex flex-wrap gap-1.5">
        {#each savedViews as view}
          <span
            class="group inline-flex items-center overflow-hidden rounded-lg border transition-colors {activeSavedViewId ===
            view.id
              ? 'border-blueprint-blue/20 bg-blueprint-blue/8 text-blueprint-blue'
              : 'border-border-light bg-surface-white text-text-secondary hover:bg-subtle-gray'}"
          >
            <button
              type="button"
              class="min-w-0 px-2 py-1.5 text-[10px] font-medium"
              onclick={() => onApplyView?.(view.id)}
              aria-pressed={activeSavedViewId === view.id}
              title={view.name}
            >
              <span class="block max-w-28 truncate">{view.name}</span>
            </button>
            <Tooltip label={`Supprimer ${view.name}`} description="Retire cette vue sauvegardée.">
              <button
                type="button"
                class="inline-flex h-6 w-6 items-center justify-center text-text-muted transition-colors hover:text-status-red"
                onclick={() => onDeleteView?.(view.id)}
                aria-label={`Supprimer ${view.name}`}
              >
                <Icon name="x" size={11} />
              </button>
            </Tooltip>
          </span>
        {/each}
      </div>
    {/if}

    {#if saveOpen}
      <form class="mt-2 flex gap-1.5" onsubmit={handleSaveSubmit}>
        <label class="sr-only" for="saved-view-name">Nom de la vue</label>
        <input
          id="saved-view-name"
          class="h-8 min-w-0 flex-1 rounded-lg border border-border-light bg-surface-white px-2 text-xs text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-blueprint-blue/30"
          bind:value={saveName}
          maxlength="48"
          placeholder="Nom de la vue"
        />
        <Tooltip label="Valider la vue" description="Enregistre ce filtre dans vos vues rapides.">
          <button
            type="submit"
            class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blueprint-blue text-surface-white transition-opacity disabled:opacity-40"
            disabled={isSaving}
            aria-label="Valider le nom de la vue"
          >
            <Icon name="check" size={13} />
          </button>
        </Tooltip>
      </form>
    {/if}
  </div>

  <div>
    <p class="mb-2 text-[11px] uppercase tracking-[0.15em] text-text-subtle">Source</p>
    <div class="flex flex-wrap gap-1.5">
      {#each sources as source}
        <Chip
          label={source.label}
          selected={selectedSource === source.value}
          onclick={() => onSetSource?.(selectedSource === source.value ? null : source.value)}
        />
      {/each}
    </div>
  </div>

  <div>
    <p class="mb-2 text-[11px] uppercase tracking-[0.15em] text-text-subtle">Mode de travail</p>
    <div class="flex flex-wrap gap-1.5">
      {#each remoteTypes as remote}
        <Chip
          label={remote.label}
          selected={selectedRemote === remote.value}
          onclick={() => onSetRemote?.(selectedRemote === remote.value ? null : remote.value)}
        />
      {/each}
    </div>
  </div>

  <div>
    <p class="mb-2 text-[11px] uppercase tracking-[0.15em] text-text-subtle">Séniorité</p>
    <div class="flex flex-wrap gap-1.5">
      {#each seniorityLevels as level}
        <Chip
          label={level.label}
          selected={selectedSeniority === level.value}
          onclick={() => onSetSeniority?.(selectedSeniority === level.value ? null : level.value)}
        />
      {/each}
    </div>
  </div>

  {#if availableStacks.length > 0}
    <div>
      <p class="mb-2 text-[11px] uppercase tracking-[0.15em] text-text-subtle">Technologies</p>
      <div class="flex flex-wrap gap-1.5">
        {#each availableStacks as stack}
          <Chip
            label={stack}
            selected={selectedStacks.includes(stack)}
            onclick={() => onToggleStack?.(stack)}
          />
        {/each}
      </div>
    </div>
  {/if}

  {#if hasFilters}
    <button
      class="self-start text-xs text-blueprint-blue hover:text-blueprint-blue/80 transition-colors"
      onclick={() => onClearAll?.()}
    >
      <span class="flex items-center gap-1">
        <Icon name="x" size={12} />
        Effacer les filtres
      </span>
    </button>
  {/if}
</div>
