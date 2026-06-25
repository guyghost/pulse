<script lang="ts">
  import type { ConnectorStatus, ConnectorState } from '$lib/core/types/connector-status';

  const {
    progress = 0,
    isScanning = false,
    missionsFound = 0,
    connectorName = '',
    current = 0,
    total = 0,
    statuses = new Map<string, ConnectorStatus>(),
  }: {
    progress?: number;
    isScanning?: boolean;
    missionsFound?: number;
    connectorName?: string;
    current?: number;
    total?: number;
    statuses?: Map<string, ConnectorStatus>;
  } = $props();

  const entries = $derived([...statuses.values()]);
  const partialMissionCount = $derived(
    entries.reduce((sum, status) => sum + status.missionsCount, 0)
  );
  const doneCount = $derived(entries.filter((status) => status.state === 'done').length);
  const errorCount = $derived(entries.filter((status) => status.state === 'error').length);
  const activeCount = $derived(
    entries.filter((status) =>
      (['detecting', 'fetching', 'retrying'] as ConnectorState[]).includes(status.state)
    ).length
  );

  function statusLabel(state: ConnectorState): string {
    switch (state) {
      case 'pending':
        return 'En attente';
      case 'detecting':
        return 'Session';
      case 'fetching':
        return 'Collecte';
      case 'retrying':
        return 'Nouvel essai';
      case 'done':
        return 'OK';
      case 'error':
        return 'Erreur';
    }
  }

  function statusTone(state: ConnectorState): string {
    if (state === 'done') {
      return 'border-accent-green/20 bg-accent-green/10 text-accent-green';
    }
    if (state === 'error') {
      return 'border-status-red/20 bg-status-red/10 text-status-red';
    }
    if (state === 'retrying') {
      return 'border-status-orange/20 bg-status-orange/10 text-status-orange';
    }
    if (state === 'fetching' || state === 'detecting') {
      return 'border-blueprint-blue/20 bg-blueprint-blue/8 text-blueprint-blue';
    }
    return 'border-border-light bg-surface-white text-text-muted';
  }
</script>

{#if isScanning}
  <div class="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-subtle-gray">
    <div
      class="h-full rounded-full bg-gradient-to-r from-blueprint-blue via-blueprint-blue to-blueprint-blue transition-all duration-500 ease-out"
      style:width="{Math.max(progress, 5)}%"
    ></div>
  </div>
  <div class="px-1 pt-2">
    <div class="flex items-center justify-between gap-3 text-[11px] text-text-secondary">
      <p class="transition-opacity duration-300">
        {#if connectorName}
          Collecte {connectorName}... ({current}/{total})
        {:else if missionsFound > 0}
          {missionsFound} mission{missionsFound > 1 ? 's' : ''} reperee{missionsFound > 1
            ? 's'
            : ''} pendant le scan
        {:else}
          Demarrage du scan...
        {/if}
      </p>
      {#if entries.length > 0}
        <p class="shrink-0 font-mono tabular-nums text-text-muted">
          {partialMissionCount} trouvée{partialMissionCount > 1 ? 's' : ''}
        </p>
      {/if}
    </div>

    {#if entries.length > 0}
      <div class="mt-2 grid grid-cols-3 gap-1.5">
        <div class="rounded-lg bg-page-canvas px-2 py-1.5">
          <p class="text-[9px] uppercase tracking-[0.12em] text-text-muted">Actifs</p>
          <p class="mt-0.5 text-xs font-semibold tabular-nums text-blueprint-blue">
            {activeCount}
          </p>
        </div>
        <div class="rounded-lg bg-page-canvas px-2 py-1.5">
          <p class="text-[9px] uppercase tracking-[0.12em] text-text-muted">Terminés</p>
          <p class="mt-0.5 text-xs font-semibold tabular-nums text-accent-green">{doneCount}</p>
        </div>
        <div class="rounded-lg bg-page-canvas px-2 py-1.5">
          <p class="text-[9px] uppercase tracking-[0.12em] text-text-muted">Erreurs</p>
          <p
            class="mt-0.5 text-xs font-semibold tabular-nums {errorCount > 0
              ? 'text-status-red'
              : 'text-text-primary'}"
          >
            {errorCount}
          </p>
        </div>
      </div>

      <div class="mt-2 flex gap-1.5 overflow-x-auto pb-0.5" aria-label="Progression par source">
        {#each entries as status (status.connectorId)}
          <div
            class="shrink-0 rounded-lg border px-2 py-1 text-[10px] {statusTone(status.state)}"
            title={`${status.connectorName}: ${statusLabel(status.state)}`}
          >
            <span class="font-medium">{status.connectorName}</span>
            <span class="ml-1 font-mono tabular-nums">{status.missionsCount}</span>
            <span class="ml-1 text-current/70">{statusLabel(status.state)}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
