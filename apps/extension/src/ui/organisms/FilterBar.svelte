<script lang="ts">
  import Chip from '../atoms/Chip.svelte';
  import Icon from '../atoms/Icon.svelte';
  import type { MissionSource, RemoteType } from '$lib/core/types/mission';
  import type { SeniorityLevel } from '$lib/core/types/profile';
  import { getConnectorsMeta } from '$lib/shell/facades/feed-data.facade';

  const {
    availableStacks = [],
    selectedStacks = [],
    selectedSource = null,
    selectedRemote = null,
    selectedSeniority = null,
    onToggleStack,
    onSetSource,
    onSetRemote,
    onSetSeniority,
    onClearAll,
  }: {
    availableStacks?: string[];
    selectedStacks?: string[];
    selectedSource?: MissionSource | null;
    selectedRemote?: RemoteType | null;
    selectedSeniority?: SeniorityLevel | null;
    onToggleStack?: (stack: string) => void;
    onSetSource?: (source: MissionSource | null) => void;
    onSetRemote?: (remote: RemoteType | null) => void;
    onSetSeniority?: (seniority: SeniorityLevel | null) => void;
    onClearAll?: () => void;
  } = $props();

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
</script>

<div class="flex flex-col gap-3 rounded-2xl border border-white/6 bg-white/[0.02] p-3">
  <div>
    <p class="mb-2 text-[11px] uppercase tracking-[0.15em] text-text-muted">Source</p>
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
    <p class="mb-2 text-[11px] uppercase tracking-[0.15em] text-text-muted">Mode de travail</p>
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
    <p class="mb-2 text-[11px] uppercase tracking-[0.15em] text-text-muted">Séniorité</p>
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
      <p class="mb-2 text-[11px] uppercase tracking-[0.15em] text-text-muted">Technologies</p>
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
      class="self-start text-xs text-accent-blue hover:text-accent-blue/80 transition-colors"
      onclick={() => onClearAll?.()}
    >
      <span class="flex items-center gap-1">
        <Icon name="x" size={12} />
        Effacer les filtres
      </span>
    </button>
  {/if}
</div>
