<script lang="ts">
  import Icon from '../atoms/Icon.svelte';
  import type { AppError } from '$lib/core/errors';

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

  // Sources triées par nombre de missions décroissant (actives d'abord, puis inactives)
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

  function toggleExpand() {
    if (compact) {
      expanded = !expanded;
    }
  }
</script>

{#if sources.length > 0}
  <div
    class="mt-3 overflow-hidden rounded-[1.25rem] border border-white/8 bg-white/3 transition-all duration-300 ease-in-out"
    class:px-4={!isCompact}
    class:py-3={!isCompact}
    class:px-3={isCompact}
    class:py-2={isCompact}
  >
    {#if isCompact}
      <!-- Compact mode: favicon row sorted by mission count desc -->
      <button
        class="flex w-full items-center gap-2"
        onclick={toggleExpand}
        title="Afficher le détail des sources"
      >
        <div class="flex items-center gap-1.5">
          {#each sortedSources as source (source.connectorId)}
            {@const missionCount = scanResultCounts.get(source.connectorId) ?? 0}
            {@const hasData = missionCount > 0}
            <div
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all duration-300
                {hasData
                ? 'border-accent-emerald/25 bg-white/6 shadow-[0_0_6px_rgba(88,217,169,0.1)]'
                : 'border-white/5 bg-white/2 opacity-30 grayscale'}"
              title="{source.name}{hasData ? ` — ${missionCount} missions` : ' — aucune mission'}"
            >
              {#if source.icon.startsWith('http') && !imgFailed[source.connectorId]}
                <img
                  src={source.icon}
                  alt={source.name}
                  width="16"
                  height="16"
                  class="rounded-sm"
                  onerror={() => {
                    imgFailed[source.connectorId] = true;
                  }}
                />
              {:else}
                <span class="text-[8px] font-bold text-text-secondary">
                  {source.name.slice(0, 2).toUpperCase()}
                </span>
              {/if}
            </div>
          {/each}
        </div>
        <Icon name="chevron-down" size={12} class="text-text-muted ml-auto" />
      </button>
    {:else}
      <!-- Expanded mode: full status list -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <p class="text-[11px] uppercase tracking-[0.18em] text-text-muted">Sources</p>
          {#if !isChecking}
            <span
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium
              {connectedCount === totalSources
                ? 'border border-accent-emerald/20 bg-accent-emerald/10 text-accent-emerald'
                : connectedCount > 0
                  ? 'border border-accent-amber/20 bg-accent-amber/10 text-accent-amber'
                  : 'border border-white/10 bg-white/5 text-text-muted'}"
            >
              {connectedCount}/{totalSources} connectées
            </span>
          {/if}
        </div>
        <div class="flex items-center gap-1">
          {#if onRefresh}
            <button
              class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-all duration-200 hover:bg-white/6 hover:text-text-primary disabled:opacity-40"
              onclick={onRefresh}
              disabled={isChecking}
              title="Vérifier les connexions"
            >
              <span class:animate-spin={isChecking}>
                <Icon name="refresh-cw" size={12} />
              </span>
            </button>
          {/if}
          {#if compact}
            <button
              class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-all duration-200 hover:bg-white/6 hover:text-text-primary"
              onclick={toggleExpand}
              title="Réduire"
            >
              <Icon name="chevron-down" size={12} class="rotate-180" />
            </button>
          {/if}
        </div>
      </div>

      <div class="mt-2 space-y-0.5">
        {#each sources as source (source.connectorId)}
          {@const missionCount = scanResultCounts.get(source.connectorId) ?? 0}
          {@const isFiltered = activeSourceFilter === source.connectorId}
          {@const isEnabled = enabledConnectors ? enabledConnectors.has(source.connectorId) : true}
          <div class="flex items-center gap-2.5 py-1.5" class:opacity-40={!isEnabled}>
            <!-- Toggle switch -->
            {#if onToggleConnector}
              <button
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-200
                  {isEnabled
                  ? 'border-accent-emerald/30 bg-accent-emerald/20'
                  : 'border-white/10 bg-white/5'}"
                onclick={() => onToggleConnector(source.connectorId)}
                role="switch"
                aria-checked={isEnabled}
                aria-label="Activer {source.name}"
              >
                <span
                  class="inline-block h-3.5 w-3.5 rounded-full transition-transform duration-200
                  {isEnabled ? 'translate-x-4 bg-accent-emerald' : 'translate-x-0.5 bg-text-muted'}"
                ></span>
              </button>
            {/if}
            <!-- Favicon -->
            <div
              class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/4"
            >
              {#if source.icon.startsWith('http') && !imgFailed[source.connectorId]}
                <img
                  src={source.icon}
                  alt={source.name}
                  width="14"
                  height="14"
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

            <!-- Name -->
            <span class="min-w-0 flex-1 truncate text-[11px] font-medium text-text-primary">
              {source.name}
            </span>

            <!-- Mission count badge (clickable filter) -->
            {#if missionCount > 0}
              <button
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-all duration-200
                  {isFiltered
                  ? 'border border-accent-blue/40 bg-accent-blue/20 text-accent-blue shadow-glow-blue'
                  : 'border border-white/10 bg-white/5 text-text-secondary hover:bg-white/10 hover:text-white'}"
                onclick={() => onFilterBySource?.(isFiltered ? null : source.connectorId)}
                title={isFiltered ? 'Retirer le filtre' : `Filtrer par ${source.name}`}
              >
                {missionCount}
              </button>
            {/if}

            <!-- Status -->
            <div class="flex items-center gap-1.5">
              {#if source.sessionStatus === 'checking'}
                <span class="flex items-center gap-1 text-[10px] text-text-muted">
                  <span class="animate-spin">
                    <Icon name="loader" size={12} />
                  </span>
                  <span>Vérification...</span>
                </span>
              {:else if source.sessionStatus === 'connected'}
                {#if source.lastSyncAt}
                  <span class="text-[9px] text-text-muted"
                    >{getRelativeTime(source.lastSyncAt)}</span
                  >
                {/if}
                <span class="flex items-center gap-1 text-[10px] text-accent-emerald">
                  <span class="inline-block h-1.5 w-1.5 rounded-full bg-accent-emerald"></span>
                  <span>Connecté</span>
                </span>
              {:else if source.sessionStatus === 'not-connected'}
                <button
                  class="rounded-md border border-accent-blue/20 bg-accent-blue/8 px-2 py-0.5 text-[10px] font-medium text-accent-blue transition-colors hover:bg-accent-blue/15"
                  onclick={() => handleReconnect(source.url)}
                >
                  Se connecter
                </button>
              {:else if source.sessionStatus === 'error'}
                <span class="flex items-center gap-1 text-[10px] text-red-400">
                  <Icon name="x-circle" size={12} />
                  <span class="max-w-32 truncate">
                    {source.error?.message ?? 'Erreur'}
                  </span>
                </span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
