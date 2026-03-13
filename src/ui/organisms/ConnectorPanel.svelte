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

  let { connectors = [], onToggle, onScan }: {
    connectors?: ConnectorInfo[];
    onToggle?: (id: string) => void;
    onScan?: (id: string) => void;
  } = $props();
</script>

<div class="section-card rounded-[1.5rem] p-4 space-y-3">
  <div class="mb-2 flex items-center justify-between">
    <div>
      <div class="flex items-center gap-2">
        <Icon name="edit-2" size={12} class="text-accent-blue/60" />
        <h3 class="text-sm font-semibold text-text-primary">Connecteurs</h3>
      </div>
      <p class="mt-1 text-xs text-text-secondary">Activez les sources que vous voulez scanner.</p>
    </div>
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
        class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] transition-colors {connector.enabled ? 'text-accent-emerald hover:bg-accent-emerald/10' : 'text-text-muted hover:bg-white/[0.08]'}"
        onclick={() => onToggle?.(connector.id)}
        title={connector.enabled ? 'D\u00e9sactiver' : 'Activer'}
      >
        <Icon name={connector.enabled ? 'check' : 'x'} size={14} />
      </button>
      {#if connector.enabled}
        <button
          class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-text-secondary transition-colors hover:bg-white/[0.08] hover:text-text-primary"
          onclick={() => onScan?.(connector.id)}
          title="Scanner"
        >
          <Icon name="refresh-cw" size={14} />
        </button>
      {/if}
    </div>
  {/each}

  {#if connectors.length === 0}
    <p class="py-4 text-center text-xs text-text-muted">Aucun connecteur configure</p>
  {/if}
</div>
