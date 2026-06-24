<script lang="ts">
  import { Icon } from '@pulse/ui';
  import CircuitBadge from '../atoms/CircuitBadge.svelte';
  import Tooltip from '../atoms/Tooltip.svelte';
  import type { AppError } from '$lib/core/errors';
  import type { ConnectorHealthSnapshot } from '$lib/core/types/health';
  import { deriveHealthStatus } from '$lib/core/health/derive-health-status';
  import ConnectorHealthCard from '../molecules/ConnectorHealthCard.svelte';

  import type { SourceStatus } from '$lib/shell/facades/feed-controller.svelte';
  import { getConnectorErrorCopy } from '../copy/connector-error-copy';

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
    onReconnect,
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
    onReconnect?: (url: string) => void;
    healthSnapshots?: Map<string, ConnectorHealthSnapshot>;
  } = $props();

  const imgFailed = $state<Record<string, boolean>>({});
  let expanded = $state(false);

  type SourceDiagnosis = {
    statusLabel: string;
    impact: string;
    action: string;
    severity: 'success' | 'attention' | 'incident' | 'neutral';
  };

  function getRelativeTime(timestamp: number | null): string {
    if (timestamp === null) {
      return 'jamais';
    }
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

  function formatMissionCount(count: number): string {
    return `${count} mission${count > 1 ? 's' : ''}`;
  }

  function getHealthLabel(snapshot: ConnectorHealthSnapshot): string {
    const status = deriveHealthStatus(snapshot);
    if (status === 'broken') {
      return 'À corriger';
    }
    if (status === 'degraded') {
      return 'Dégradé';
    }
    return 'Sain';
  }

  function getSourceDiagnosis(
    source: SourceStatus,
    snapshot: ConnectorHealthSnapshot | undefined,
    missionCount: number,
    isEnabled: boolean
  ): SourceDiagnosis {
    if (!isEnabled) {
      return {
        statusLabel: 'Source désactivée',
        impact: 'Le radar ignore volontairement cette plateforme.',
        action: 'Activez puis sondez si elle doit contribuer au feed.',
        severity: 'neutral',
      };
    }

    if (source.sessionStatus === 'not-connected') {
      return {
        statusLabel: 'Session absente',
        impact: 'Les nouvelles missions de cette source ne peuvent pas remonter.',
        action: 'Reconnectez la plateforme dans Chrome.',
        severity: 'attention',
      };
    }

    if (source.sessionStatus === 'error') {
      return {
        statusLabel: 'Session en erreur',
        impact: 'Le feed peut sous-estimer les opportunités récentes.',
        action: 'Reconnectez ou relancez le diagnostic.',
        severity: 'incident',
      };
    }

    if (snapshot) {
      const healthStatus = deriveHealthStatus(snapshot);
      if (healthStatus === 'broken') {
        return {
          statusLabel: 'Collecte suspendue',
          impact: 'Le radar ne doit pas être considéré fiable pour cette source.',
          action: 'Relancez le diagnostic puis reconnectez si l’échec persiste.',
          severity: 'incident',
        };
      }
      if (healthStatus === 'degraded') {
        return {
          statusLabel: 'Signal instable',
          impact: 'Les résultats peuvent être partiels ou retardés.',
          action: 'Sondez la source avant de traiter les alertes.',
          severity: 'attention',
        };
      }
    }

    if (missionCount === 0) {
      return {
        statusLabel: 'Aucun signal',
        impact: 'La source est disponible mais n’a rien produit au dernier scan.',
        action: 'Élargissez les critères ou vérifiez la plateforme.',
        severity: 'neutral',
      };
    }

    return {
      statusLabel: 'Signal exploitable',
      impact: 'Les missions de cette source peuvent alimenter la décision.',
      action: 'Filtrez cette source si vous voulez investiguer son volume.',
      severity: 'success',
    };
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
    onReconnect?.(url);
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
            aria-label={isFiltered
              ? `Retirer le filtre ${source.name}`
              : hasData
                ? `Filtrer par ${source.name}, ${formatMissionCount(missionCount)}`
                : `Afficher les détails de ${source.name}`}
            aria-pressed={isFiltered}
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
        <Tooltip
          label="Afficher le detail des sources"
          description="Ouvre les sessions, incidents et filtres par connecteur."
        >
          <button
            class="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-subtle-gray hover:text-text-primary transition-colors"
            onclick={toggleExpand}
            aria-label="Afficher le détail des sources"
          >
            <Icon name="chevron-down" size={12} />
          </button>
        </Tooltip>
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
              <Tooltip
                label={isChecking ? 'Vérification en cours' : 'Vérifier les connexions'}
                description="Relance le diagnostic des sessions sources."
              >
                <button
                  class="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-subtle-gray hover:text-text-primary disabled:opacity-40"
                  onclick={onRefresh}
                  disabled={isChecking}
                  aria-label="Vérifier les connexions des sources"
                >
                  <span class:animate-spin={isChecking}>
                    <Icon name="refresh-cw" size={11} />
                  </span>
                </button>
              </Tooltip>
            {/if}
            {#if compact}
              <Tooltip label="Reduire" description="Revient a la vue compacte des sources.">
                <button
                  class="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-subtle-gray hover:text-text-primary"
                  onclick={toggleExpand}
                  aria-label="Réduire le détail des sources"
                >
                  <Icon name="chevron-down" size={11} class="rotate-180" />
                </button>
              </Tooltip>
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
          {@const snap = healthSnapshots?.get(source.connectorId)}
          {@const healthStatus = snap ? deriveHealthStatus(snap) : null}
          {@const diagnosis = getSourceDiagnosis(source, snap, missionCount, isEnabled)}
          {@const sourceErrorCopy = getConnectorErrorCopy({
            connectorId: source.connectorId,
            connectorName: source.name,
            error: source.error,
          })}

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
                aria-label={isEnabled ? `Désactiver ${source.name}` : `Activer ${source.name}`}
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
              <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
                <span class="text-text-muted">{formatMissionCount(missionCount)} dernier scan</span>
                {#if source.lastSyncAt}
                  <span class="text-text-muted">Sync {getRelativeTime(source.lastSyncAt)}</span>
                {/if}
                {#if snap?.lastSuccessAt}
                  <span class="text-accent-green">Succès {getRelativeTime(snap.lastSuccessAt)}</span
                  >
                {/if}
                {#if snap?.lastFailureAt}
                  <span class="text-status-red">Échec {getRelativeTime(snap.lastFailureAt)}</span>
                {/if}
              </div>
              {#if source.error}
                <span class="mt-0.5 block truncate text-[10px] text-status-red">
                  {sourceErrorCopy.label}
                </span>
              {/if}
              <div
                class="mt-1.5 rounded-lg border px-2 py-1.5 {diagnosis.severity === 'incident'
                  ? 'border-status-red/20 bg-status-red/6'
                  : diagnosis.severity === 'attention'
                    ? 'border-status-orange/20 bg-status-orange/6'
                    : diagnosis.severity === 'success'
                      ? 'border-accent-green/20 bg-accent-green/6'
                      : 'border-border-light bg-surface-white'}"
              >
                <div class="flex items-center justify-between gap-2">
                  <span
                    class="text-[10px] font-medium {diagnosis.severity === 'incident'
                      ? 'text-status-red'
                      : diagnosis.severity === 'attention'
                        ? 'text-status-orange'
                        : diagnosis.severity === 'success'
                          ? 'text-accent-green'
                          : 'text-text-subtle'}"
                  >
                    {diagnosis.statusLabel}
                  </span>
                  <span class="text-[10px] text-text-muted">Action</span>
                </div>
                <p class="mt-0.5 text-[10px] leading-4 text-text-subtle">{diagnosis.impact}</p>
                <p class="mt-0.5 text-[10px] leading-4 text-text-primary">{diagnosis.action}</p>
              </div>
            </div>

            <!-- Status -->
            <div class="flex shrink-0 items-center gap-2">
              {#if snap}
                <span
                  class="rounded-md px-1.5 py-0.5 text-[9px] font-medium
                    {healthStatus === 'broken'
                    ? 'bg-status-red/10 text-status-red'
                    : healthStatus === 'degraded'
                      ? 'bg-status-yellow/20 text-status-orange'
                      : 'bg-accent-green/10 text-accent-green'}"
                >
                  {getHealthLabel(snap)}
                </span>
                {#if snap.circuitState !== 'closed'}
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
                  <span class="max-w-28 truncate">{sourceErrorCopy.label}</span>
                </span>
              {/if}

              {#if snap}
                {#if deriveHealthStatus(snap) === 'broken' && onRecheckConnector}
                  <button
                    class="rounded-md border border-status-red/20 bg-status-red/6 px-2 py-0.5 text-[10px] font-medium text-status-red transition-colors hover:bg-status-red/10"
                    onclick={() => onRecheckConnector(source.connectorId, !isEnabled)}
                  >
                    {isEnabled ? 'Relancer' : 'Activer'}
                  </button>
                {/if}
              {/if}

              <!-- Filter by source button -->
              {#if missionCount > 0}
                <Tooltip
                  label={isFiltered ? 'Retirer le filtre' : `Filtrer ${source.name}`}
                  description={`${formatMissionCount(missionCount)} détectée${missionCount > 1 ? 's' : ''} sur cette source.`}
                >
                  <button
                    class="rounded-md px-1.5 py-0.5 text-[10px] font-mono font-medium transition-colors
                      {isFiltered
                      ? 'bg-blueprint-blue/10 text-blueprint-blue'
                      : 'text-text-muted hover:bg-subtle-gray hover:text-text-primary'}"
                    onclick={() => onFilterBySource?.(isFiltered ? null : source.connectorId)}
                    aria-label={isFiltered
                      ? `Retirer le filtre ${source.name}`
                      : `Filtrer par ${source.name}, ${formatMissionCount(missionCount)}`}
                    aria-pressed={isFiltered}
                  >
                    {missionCount}
                  </button>
                </Tooltip>
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
