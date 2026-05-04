<script lang="ts">
  import { Icon } from '@pulse/ui';
  import CircuitBadge from '../atoms/CircuitBadge.svelte';
  import type { AppError } from '$lib/core/errors';
  import type { ConnectorHealthSnapshot } from '$lib/core/types/health';
  import { deriveHealthStatus } from '$lib/core/health/derive-health-status';
  import ConnectorHealthCard from '../molecules/ConnectorHealthCard.svelte';

  import type { SourceStatus } from '$lib/shell/facades/feed-controller.svelte';

  const {
    sources,
    isChecking = false,
    compact = false,
    scanResultCounts = new Map<string, number>(),
    activeSourceFilter = null,
    enabledConnectors = null,
    onRefresh,
    onFilterBySource,
    onToggleConnector,
    onRecheckConnector,
    healthSnapshots,
  }: {
    sources: SourceStatus[];
    isChecking?: boolean;
    compact?: boolean;
    scanResultCounts?: Map<string, number>;
    activeSourceFilter?: string | null;
    enabledConnectors?: Set<string> | null;
    onRefresh?: () => void;
    onFilterBySource?: (connectorId: string | null) => void;
    onToggleConnector?: (connectorId: string) => void;
    onRecheckConnector?: (connectorId: string, enable?: boolean) => void;
    healthSnapshots?: Map<string, ConnectorHealthSnapshot>;
  } = $props();

  const imgFailed = $state<Record<string, boolean>>({});
  let expanded = $state(false);

  function getRelativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) {
      return "à l'instant";
    }
    if (minutes < 60) {
      return `il y a ${minutes}min`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `il y a ${hours}h`;
    }
    return `il y a ${Math.floor(hours / 24)}j`;
  }

  const connectedCount = $derived(sources.filter((s) => s.sessionStatus === 'connected').length);
  const totalSources = $derived(sources.length);
  const isCompact = $derived(compact && !expanded);

  const sortedSources = $derived(
    [...sources].sort((a, b) => {
      const countA = scanResultCounts.get(a.connectorId) ?? 0;
      const countB = scanResultCounts.get(b.connectorId) ?? 0;
      return countB - countA;
    })
  );

  function handleReconnect(url: string) {
    try {
      chrome.tabs.create({ url });
    } catch {
      window.open(url, '_blank');
    }
  }

  const unhealthySnapshots = $derived.by(() => {
    if (!healthSnapshots) {
      return [] as Array<{ connectorId: string; name: string; snapshot: ConnectorHealthSnapshot }>;
    }
    return sources
      .map((source) => {
        const snapshot = healthSnapshots.get(source.connectorId);
        return snapshot ? { connectorId: source.connectorId, name: source.name, snapshot } : null;
      })
      .filter(
        (item): item is { connectorId: string; name: string; snapshot: ConnectorHealthSnapshot } =>
          item !== null && deriveHealthStatus(item.snapshot) !== 'healthy'
      );
  });

  function toggleExpand() {
    if (compact) {
      expanded = !expanded;
    }
  }
</script>

{#if sources.length > 0}
  <div
    class="mt-4 overflow-hidden rounded-xl border border-border-light bg-page-canvas transition-all duration-300 ease-in-out"
  >
    {#if isCompact}
      <!-- ── Compact mode: pill chips with color ── -->
      <div class="flex items-center gap-2 px-1 py-1">
        {#each sortedSources as source (source.connectorId)}
          {@const missionCount = scanResultCounts.get(source.connectorId) ?? 0}
          {@const hasData = missionCount > 0}
          {@const isFiltered = activeSourceFilter === source.connectorId}
          {@const isEnabled = enabledConnectors ? enabledConnectors.has(source.connectorId) : true}

          <button
            class="group flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-all duration-200
              {isFiltered
              ? 'border-blueprint-blue/30 bg-blueprint-blue/10'
              : hasData && isEnabled
                ? 'border-blueprint-blue/15 bg-blueprint-blue/5 hover:bg-blueprint-blue/10'
                : 'border-border-light bg-surface-white opacity-35 hover:opacity-60'}"
            onclick={() => {
              if (isFiltered) {
                onFilterBySource?.(null);
              } else if (hasData) {
                onFilterBySource?.(source.connectorId);
              } else {
                toggleExpand();
              }
            }}
            title="{source.name}{hasData ? ` — ${missionCount} missions` : ' — aucune mission'}"
          >
            <!-- Status dot -->
            <span
              class="inline-block h-1.5 w-1.5 shrink-0 rounded-full
                {source.sessionStatus === 'connected' && isEnabled
                ? 'bg-accent-green'
                : source.sessionStatus === 'error'
                  ? 'bg-status-red'
                  : 'bg-text-muted'}"
            ></span>
            <!-- Favicon or initials -->
            {#if source.icon.startsWith('http') && !imgFailed[source.connectorId]}
              <img
                src={source.icon}
                alt=""
                width="14"
                height="14"
                class="rounded-sm shrink-0"
                onerror={() => {
                  imgFailed[source.connectorId] = true;
                }}
              />
            {:else}
              <span class="text-[8px] font-bold text-text-secondary shrink-0">
                {source.name.slice(0, 2).toUpperCase()}
              </span>
            {/if}
            <!-- Mission count -->
            {#if hasData}
              <span
                class="text-[10px] font-mono font-medium
                  {isFiltered
                  ? 'text-blueprint-blue'
                  : hasData && isEnabled
                    ? 'text-text-secondary'
                    : 'text-text-muted'}">{missionCount}</span
              >
            {/if}
          </button>
        {/each}
        <button
          class="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-subtle-gray hover:text-text-primary transition-colors"
          onclick={toggleExpand}
          title="Afficher le détail des sources"
        >
          <Icon name="chevron-down" size={12} />
        </button>
      </div>
    {:else}
      <!-- ── Expanded mode: full detail rows ── -->
      <div class="px-4 pt-3 pb-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
              Sources
            </p>
            {#if !isChecking}
              <span
                class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-medium
                  {connectedCount === totalSources
                  ? 'bg-accent-green/10 text-accent-green'
                  : connectedCount > 0
                    ? 'bg-blueprint-blue/8 text-blueprint-blue'
                    : 'bg-subtle-gray text-text-muted'}"
              >
                {connectedCount}/{totalSources}
              </span>
            {/if}
          </div>
          <div class="flex items-center gap-1">
            {#if onRefresh}
              <button
                class="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-subtle-gray hover:text-text-primary disabled:opacity-40"
                onclick={onRefresh}
                disabled={isChecking}
                title="Vérifier les connexions"
              >
                <span class:animate-spin={isChecking}>
                  <Icon name="refresh-cw" size={11} />
                </span>
              </button>
            {/if}
            {#if compact}
              <button
                class="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-subtle-gray hover:text-text-primary"
                onclick={toggleExpand}
                title="Réduire"
              >
                <Icon name="chevron-down" size={11} class="rotate-180" />
              </button>
            {/if}
          </div>
        </div>
      </div>

      <div class="px-4 pb-3">
        {#each sources as source, i (source.connectorId)}
          {@const missionCount = scanResultCounts.get(source.connectorId) ?? 0}
          {@const isFiltered = activeSourceFilter === source.connectorId}
          {@const isEnabled = enabledConnectors ? enabledConnectors.has(source.connectorId) : true}
          {@const isActive = source.sessionStatus === 'connected' && isEnabled}

          <div
            class="flex items-center gap-3 py-2.5 {i > 0 ? 'border-t border-border-light' : ''}"
            class:opacity-40={!isEnabled}
          >
            <!-- Toggle switch -->
            {#if onToggleConnector}
              <button
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-200
                  {isEnabled
                  ? 'border-accent-green/30 bg-accent-green/15'
                  : 'border-border-light bg-surface-white'}"
                onclick={() => onToggleConnector(source.connectorId)}
                role="switch"
                aria-checked={isEnabled}
                aria-label="Activer {source.name}"
              >
                <span
                  class="inline-block h-3.5 w-3.5 rounded-full transition-transform duration-200
                    {isEnabled ? 'translate-x-4 bg-accent-green' : 'translate-x-0.5 bg-text-muted'}"
                ></span>
              </button>
            {/if}

            <!-- Favicon -->
            <div
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors
                {isActive
                ? 'border-blueprint-blue/20 bg-blueprint-blue/6'
                : 'border-border-light bg-surface-white'}"
            >
              {#if source.icon.startsWith('http') && !imgFailed[source.connectorId]}
                <img
                  src={source.icon}
                  alt=""
                  width="16"
                  height="16"
                  class="rounded-sm"
                  onerror={() => {
                    imgFailed[source.connectorId] = true;
                  }}
                />
              {:else}
                <span class="text-[9px] font-bold text-text-secondary">
                  {source.name.slice(0, 2).toUpperCase()}
                </span>
              {/if}
            </div>

            <!-- Name + count -->
            <div class="min-w-0 flex-1">
              <span class="block truncate text-[12px] font-medium text-text-primary"
                >{source.name}</span
              >
              {#if missionCount > 0}
                <span class="block text-[10px] text-text-muted">{missionCount} missions</span>
              {/if}
            </div>

            <!-- Status -->
            <div class="flex shrink-0 items-center gap-2">
              {#if healthSnapshots}
                {@const snap = healthSnapshots.get(source.connectorId)}
                {#if snap && snap.circuitState !== 'closed'}
                  <CircuitBadge state={snap.circuitState} size="sm" showLabel />
                {/if}
              {/if}

              {#if source.sessionStatus === 'checking'}
                <span class="flex items-center gap-1 text-[10px] text-text-muted">
                  <span class="animate-spin"><Icon name="loader" size={11} /></span>
                </span>
              {:else if source.sessionStatus === 'connected'}
                <span class="flex items-center gap-1.5 text-[10px] text-accent-green">
                  <span class="inline-block h-1.5 w-1.5 rounded-full bg-accent-green"></span>
                  Connecté
                </span>
              {:else if source.sessionStatus === 'not-connected'}
                <button
                  class="rounded-md border border-blueprint-blue/20 bg-blueprint-blue/6 px-2 py-0.5 text-[10px] font-medium text-blueprint-blue transition-colors hover:bg-blueprint-blue/10"
                  onclick={() => handleReconnect(source.url)}
                >
                  Se connecter
                </button>
              {:else if source.sessionStatus === 'error'}
                <span class="flex items-center gap-1 text-[10px] text-status-red">
                  <Icon name="x-circle" size={11} />
                  <span class="max-w-28 truncate">{source.error?.message ?? 'Erreur'}</span>
                </span>
              {/if}

              {#if healthSnapshots}
                {@const snap = healthSnapshots.get(source.connectorId)}
                {#if snap && deriveHealthStatus(snap) === 'broken' && onRecheckConnector}
                  <button
                    class="rounded-md border border-status-red/20 bg-status-red/6 px-2 py-0.5 text-[10px] font-medium text-status-red transition-colors hover:bg-status-red/10"
                    onclick={() => onRecheckConnector(source.connectorId, !isEnabled)}
                  >
                    {isEnabled ? 'Re-check' : 'Activer'}
                  </button>
                {/if}
              {/if}

              <!-- Filter by source button -->
              {#if missionCount > 0}
                <button
                  class="rounded-md px-1.5 py-0.5 text-[10px] font-mono font-medium transition-colors
                    {isFiltered
                    ? 'bg-blueprint-blue/10 text-blueprint-blue'
                    : 'text-text-muted hover:bg-subtle-gray hover:text-text-primary'}"
                  onclick={() => onFilterBySource?.(isFiltered ? null : source.connectorId)}
                  title={isFiltered ? 'Retirer le filtre' : `Filtrer par ${source.name}`}
                >
                  {missionCount}
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      {#if unhealthySnapshots.length > 0}
        <div class="border-t border-border-light px-4 py-3">
          <p class="text-[10px] uppercase tracking-[0.15em] text-text-muted mb-2">
            Santé détaillée
          </p>
          <div class="space-y-2">
            {#each unhealthySnapshots as item (item.connectorId)}
              <ConnectorHealthCard snapshot={item.snapshot} connectorName={item.name} />
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  </div>
{/if}
