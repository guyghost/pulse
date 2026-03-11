<script lang="ts">
  import type { ConnectorStatus as ConnectorStatusType } from '$lib/types/connector';
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

  let { connectors = [], onToggle, onScan }: {
    connectors?: ConnectorInfo[];
    onToggle?: (id: string) => void;
    onScan?: (id: string) => void;
  } = $props();
</script>

<div class="space-y-2">
  <div class="flex items-center justify-between mb-2">
    <h3 class="text-sm font-semibold text-text-primary">Connecteurs</h3>
  </div>

  {#each connectors as connector (connector.id)}
    <div class="flex items-center gap-2">
      <div class="flex-1">
        <ConnectorStatus
          name={connector.name}
          status={connector.status}
          lastSync={connector.lastSync}
          icon={connector.icon}
        />
      </div>
      <button
        class="p-1.5 rounded-md transition-colors {connector.enabled ? 'text-accent-emerald hover:bg-accent-emerald/10' : 'text-text-muted hover:bg-surface-hover'}"
        onclick={() => onToggle?.(connector.id)}
        title={connector.enabled ? 'D\u00e9sactiver' : 'Activer'}
      >
        <Icon name={connector.enabled ? 'check' : 'x'} size={14} />
      </button>
      {#if connector.enabled}
        <button
          class="p-1.5 rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
          onclick={() => onScan?.(connector.id)}
          title="Scanner"
        >
          <Icon name="refresh-cw" size={14} />
        </button>
      {/if}
    </div>
  {/each}

  {#if connectors.length === 0}
    <p class="text-xs text-text-muted text-center py-4">Aucun connecteur configur\u00e9</p>
  {/if}
</div>
