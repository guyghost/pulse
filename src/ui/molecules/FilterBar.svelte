<script lang="ts">
  import Chip from '../atoms/Chip.svelte';
  import type { RemoteType } from '$lib/core/types/mission';

  let {
    stackOptions = [],
    selectedStack = [],
    selectedRemote = null,
    onToggleStack,
    onSetRemote,
    onClear,
  }: {
    stackOptions?: string[];
    selectedStack?: string[];
    selectedRemote?: RemoteType | null;
    onToggleStack?: (item: string) => void;
    onSetRemote?: (remote: RemoteType | null) => void;
    onClear?: () => void;
  } = $props();

  let hasFilters = $derived(selectedStack.length > 0 || selectedRemote !== null);

  const remoteOptions: { label: string; value: RemoteType }[] = [
    { label: 'Full remote', value: 'full' },
    { label: 'Hybride', value: 'hybrid' },
    { label: 'Sur site', value: 'onsite' },
  ];
</script>

<div class="flex flex-wrap gap-1.5 py-2">
  {#each stackOptions as tech}
    <Chip
      label={tech}
      selected={selectedStack.includes(tech)}
      onclick={() => onToggleStack?.(tech)}
    />
  {/each}

  {#each remoteOptions as opt}
    <Chip
      label={opt.label}
      selected={selectedRemote === opt.value}
      onclick={() => onSetRemote?.(selectedRemote === opt.value ? null : opt.value)}
    />
  {/each}

  {#if hasFilters}
    <button
      class="text-[11px] text-text-muted hover:text-accent-red transition-colors px-1"
      onclick={() => onClear?.()}
    >
      Effacer
    </button>
  {/if}
</div>
