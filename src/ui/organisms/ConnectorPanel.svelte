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
    loading?: boolean;
  }

  let { connectors = [], onToggle, onToggleAll, showLoadingStates = true }: {
    connectors?: ConnectorInfo[];
    onToggle?: (id: string) => void;
    onToggleAll?: (enabled: boolean) => void;
    showLoadingStates?: boolean;
  } = $props();

  let allEnabled = $derived(connectors.length > 0 && connectors.every(c => c.enabled));
  let hasLoading = $derived(connectors.some(c => c.loading));
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
    {#if connectors.length > 0}
      <button
        class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200 {allEnabled ? 'border-accent-emerald/30 bg-accent-emerald/20' : 'border-white/10 bg-white/[0.05]'}
        {hasLoading ? 'opacity-50 cursor-not-allowed' : ''}"
        onclick={() => !hasLoading && onToggleAll?.(!allEnabled)}
        role="switch"
        aria-checked={allEnabled}
        aria-label="Activer ou désactiver tous les connecteurs"
        disabled={hasLoading}
      >
        <span class="inline-block h-5 w-5 rounded-full transition-transform duration-200 {allEnabled ? 'translate-x-6 bg-accent-emerald' : 'translate-x-0.5 bg-text-muted'}"></span>
      </button>
    {/if}
  </div>

  {#each connectors as connector (connector.id)}
    <div class="flex items-center gap-2">
      <div class="flex-1 min-w-0">
        {#if connector.loading && showLoadingStates}
          <!-- Skeleton loading state -->
          <div class="flex items-center gap-3 rounded-[1.25rem] border border-white/5 bg-white/[0.03] p-3">
            <div class="h-6 w-6 animate-pulse rounded-full bg-white/10"></div>
            <div class="flex-1 space-y-2">
              <div class="h-3 w-24 animate-pulse rounded bg-white/10"></div>
              <div class="h-2 w-32 animate-pulse rounded bg-white/5"></div>
            </div>
          </div>
        {:else}
          <ConnectorStatus
            name={connector.name}
            status={connector.status}
            lastSync={connector.lastSync}
            icon={connector.icon}
          />
        {/if}
      </div>
      <button
        class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200 {connector.enabled ? 'border-accent-emerald/30 bg-accent-emerald/20' : 'border-white/10 bg-white/[0.05]'}
        {connector.loading ? 'opacity-50 cursor-not-allowed' : ''}"
        onclick={() => !connector.loading && onToggle?.(connector.id)}
        role="switch"
        aria-checked={connector.enabled}
        aria-label="Activer {connector.name}"
        disabled={connector.loading}
      >
        <span class="inline-block h-5 w-5 rounded-full transition-transform duration-200 {connector.enabled ? 'translate-x-6 bg-accent-emerald' : 'translate-x-0.5 bg-text-muted'}"></span>
      </button>
    </div>
  {/each}

  {#if connectors.length === 0}
    <p class="py-4 text-center text-xs text-text-muted">Aucun connecteur configure</p>
  {/if}
</div>
