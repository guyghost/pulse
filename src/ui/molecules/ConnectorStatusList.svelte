<script lang="ts">
  import type { ConnectorStatus } from '$lib/core/types/connector-status';
  import type { PersistedConnectorStatus } from '$lib/core/types/connector-status';
  import { getConnectorsMeta } from '$lib/shell/connectors';
  import ConnectorStatusItem from './ConnectorStatus.svelte';

  let { statuses, persistedStatuses = [], isScanning = false }: {
    statuses?: Map<string, ConnectorStatus>;
    persistedStatuses?: PersistedConnectorStatus[];
    isScanning?: boolean;
  } = $props();

  const metas = getConnectorsMeta();

  function getMeta(id: string) {
    return metas.find((m) => m.id === id);
  }

  let scanEntries = $derived(
    statuses ? [...statuses.entries()] : []
  );

  let errorEntries = $derived(
    persistedStatuses.filter((p) => p.lastState === 'error')
  );

  let shouldShow = $derived(
    isScanning ? scanEntries.length > 0 : errorEntries.length > 0
  );
</script>

{#if shouldShow}
  <div class="mt-3 space-y-0.5">
    {#if isScanning}
      {#each scanEntries as [id, status] (id)}
        {@const m = getMeta(id)}
        <ConnectorStatusItem name={m?.name ?? id} icon={m?.icon ?? ''} url={m?.url ?? ''} {status} />
      {/each}
    {:else}
      {#each errorEntries as persisted (persisted.connectorId)}
        {@const m = getMeta(persisted.connectorId)}
        <ConnectorStatusItem name={m?.name ?? persisted.connectorName} icon={m?.icon ?? ''} url={m?.url ?? ''} {persisted} />
      {/each}
    {/if}
  </div>
{/if}
