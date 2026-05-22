<script lang="ts">
  import type { ConnectorStatus } from '$lib/core/types/connector-status';
  import type { PersistedConnectorStatus } from '$lib/core/types/connector-status';
  import { getConnectorsMeta, openExternalUrl } from '$lib/shell/facades/feed-data.facade';
  import ConnectorStatusItem from './ConnectorStatus.svelte';

  const {
    statuses,
    persistedStatuses = [],
    isScanning = false,
  }: {
    statuses?: Map<string, ConnectorStatus>;
    persistedStatuses?: PersistedConnectorStatus[];
    isScanning?: boolean;
  } = $props();

  const metas = getConnectorsMeta();

  function getMeta(id: string) {
    return metas.find((m) => m.id === id);
  }

  function handleReconnect(url: string): void {
    openExternalUrl(url).catch(() => {
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }

  const scanEntries = $derived(statuses ? [...statuses.entries()] : []);

  const errorEntries = $derived(persistedStatuses.filter((p) => p.lastState === 'error'));

  const shouldShow = $derived(isScanning ? scanEntries.length > 0 : errorEntries.length > 0);
</script>

{#if shouldShow}
  <div class="mt-3 space-y-0.5">
    {#if isScanning}
      {#each scanEntries as [id, status] (id)}
        {@const m = getMeta(id)}
        <ConnectorStatusItem
          name={m?.name ?? id}
          icon={m?.icon ?? ''}
          url={m?.url ?? ''}
          {status}
          onReconnect={handleReconnect}
        />
      {/each}
    {:else}
      {#each errorEntries as persisted (persisted.connectorId)}
        {@const m = getMeta(persisted.connectorId)}
        <ConnectorStatusItem
          name={m?.name ?? persisted.connectorName}
          icon={m?.icon ?? ''}
          url={m?.url ?? ''}
          {persisted}
          onReconnect={handleReconnect}
        />
      {/each}
    {/if}
  </div>
{/if}
