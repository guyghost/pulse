<script lang="ts">
  import type { ConnectorStatus as ConnectorStatusType } from '$lib/core/types/connector';
  import ConnectorStatus from '../molecules/ConnectorStatus.svelte';
  import Icon from '../atoms/Icon.svelte';

  interface ConnectorInfo {
    id: string;
    name: string;
    icon: string;
    status: ConnectorStatusType;
    lastSync: Date | null;
    enabled: boolean;
  }

  let { connectors = [], onToggle }: {
    connectors?: ConnectorInfo[];
    onToggle?: (id: string) => void;
  } = $props();
</script>

<div class="section-card rounded-[1.5rem] p-4 space-y-3">
  <div class="mb-2 flex items-center justify-between">
    <div>
      <div class="flex items-center gap-2">
        <Icon name="plug" size={12} class="text-accent-blue/60" />
        <h3 class="text-sm font-semibold text-text-primary">Connecteurs</h3>
      </div>
      <p class="mt-1 text-xs text-text-secondary">Activez les sources que vous voulez scanner.</p>
    </div>
  </div>

  {#each connectors as connector (connector.id)}
    <div class="flex items-center gap-2">
      <div class="flex-1 min-w-0">
        <ConnectorStatus
          name={connector.name}
          status={connector.status}
          lastSync={connector.lastSync}
          icon={connector.icon}
        />
      </div>
      <button
        class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200 {connector.enabled ? 'border-accent-emerald/30 bg-accent-emerald/20' : 'border-white/10 bg-white/[0.05]'}"
        onclick={() => onToggle?.(connector.id)}
        role="switch"
        aria-checked={connector.enabled}
      >
        <span class="inline-block h-5 w-5 rounded-full transition-transform duration-200 {connector.enabled ? 'translate-x-6 bg-accent-emerald' : 'translate-x-0.5 bg-text-muted'}"></span>
      </button>
    </div>
  {/each}

  {#if connectors.length === 0}
    <p class="py-4 text-center text-xs text-text-muted">Aucun connecteur configure</p>
  {/if}
</div>
