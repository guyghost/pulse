<script lang="ts">
  import Chip from '../atoms/Chip.svelte';
  import Icon from '../atoms/Icon.svelte';
  import type { MissionSource, RemoteType } from '$lib/core/types/mission';
  import { getConnectorsMeta } from '$lib/shell/connectors/index';

  let {
    availableStacks = [],
    selectedStacks = [],
    selectedSource = null,
    selectedRemote = null,
    onToggleStack,
    onSetSource,
    onSetRemote,
    onClearAll,
  }: {
    availableStacks?: string[];
    selectedStacks?: string[];
    selectedSource?: MissionSource | null;
    selectedRemote?: RemoteType | null;
    onToggleStack?: (stack: string) => void;
    onSetSource?: (source: MissionSource | null) => void;
    onSetRemote?: (remote: RemoteType | null) => void;
    onClearAll?: () => void;
  } = $props();

  let hasFilters = $derived(selectedStacks.length > 0 || selectedSource !== null || selectedRemote !== null);

  const sources: { value: MissionSource; label: string }[] = getConnectorsMeta().map((m) => ({
    value: m.id as MissionSource,
    label: m.name,
  }));

  const remoteTypes: { value: RemoteType; label: string }[] = [
    { value: 'full', label: 'Full remote' },
    { value: 'hybrid', label: 'Hybride' },
    { value: 'onsite', label: 'Sur site' },
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
