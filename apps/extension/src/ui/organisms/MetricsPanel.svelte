<script lang="ts">
  import { Icon } from '@pulse/ui';
  import { metricsCollector, getWebVitals } from '../../lib/shell/metrics';
  import type { Metric } from '../../lib/core/metrics/types';

  type MetricsTab = 'overview' | 'scan' | 'cache' | 'timings' | 'webvitals';
  type DiagnosticTone = 'success' | 'attention' | 'incident';

  type MetricSignal = {
    label: string;
    value: string;
    state: string;
    hint: string;
    icon: string;
    tone: DiagnosticTone;
  };

  type OperationalSummary = {
    statusLabel: string;
    title: string;
    description: string;
    action: string;
    tone: DiagnosticTone;
  };

  const tabs: Array<{ id: MetricsTab; label: string }> = [
    { id: 'overview', label: 'Synthèse' },
    { id: 'scan', label: 'Scans' },
    { id: 'cache', label: 'Cache' },
    { id: 'timings', label: 'Latences' },
    { id: 'webvitals', label: 'Web vitals' },
  ];

  let isOpen = $state(false);
  let activeTab = $state<MetricsTab>('overview');
  let refreshKey = $state(0);
  let autoRefresh = $state(false);
  let refreshInterval: ReturnType<typeof setInterval> | null = null;
  let webVitals = $state(getWebVitals());

  const allMetrics = $derived.by(() => {
    refreshKey;
    return metricsCollector.getMetrics();
  });

  const scanStats = $derived.by(() => {
    const scanDurations = allMetrics.filter((m) => m.name === 'scan.duration').map((m) => m.value);
    const avgScanTime =
      scanDurations.length > 0
        ? Math.round(scanDurations.reduce((a, b) => a + b, 0) / scanDurations.length)
        : 0;
    const lastScan = scanDurations[scanDurations.length - 1] ?? 0;

    const dedupRatios = allMetrics.filter((m) => m.name === 'scan.dedup_ratio').map((m) => m.value);
    const avgDedup =
      dedupRatios.length > 0
        ? Math.round((dedupRatios.reduce((a, b) => a + b, 0) / dedupRatios.length) * 10) / 10
        : 0;

    return { avgScanTime, lastScan, avgDedup, scanCount: scanDurations.length };
  });

  const cacheStats = $derived.by(() => {
    const hitRates = allMetrics
      .filter((m) => m.name === 'cache.memory.hit_rate')
      .map((m) => m.value);
    const lastHitRate = hitRates[hitRates.length - 1] ?? 0;
    const sizes = allMetrics.filter((m) => m.name === 'cache.memory.size').map((m) => m.value);
    const lastSize = sizes[sizes.length - 1] ?? 0;

    return { lastHitRate, lastSize };
  });

  const missionsByConnector = $derived.by(() => {
    const connectorMetrics = allMetrics.filter((m) => m.name === 'scan.missions.per_connector');
    const latestByConnector = new Map<string, number>();
    for (const metric of connectorMetrics) {
      if (metric.tags?.connectorId) {
        latestByConnector.set(metric.tags.connectorId, metric.value);
      }
    }
    return latestByConnector;
  });

  const recentErrors = $derived.by(() => {
    return allMetrics
      .filter((m) => m.name === 'scan.error')
      .slice(-10)
      .reverse();
  });

  const scanHistory = $derived.by(() => {
    return allMetrics
      .filter((m) => m.name === 'scan.duration')
      .slice(-12)
      .reverse();
  });

  const cacheHistory = $derived.by(() => {
    return allMetrics
      .filter((m) => m.name === 'cache.memory.hit_rate')
      .slice(-12)
      .reverse();
  });

  const webVitalsHistory = $derived.by(() => {
    return allMetrics
      .filter((m) => m.name.startsWith('webvital.'))
      .slice(-16)
      .reverse();
  });

  const avgTimings = $derived.by(() => {
    const timingMetrics = allMetrics.filter((m) => m.name.startsWith('timing.'));
    const byOperation = new Map<string, number[]>();

    for (const metric of timingMetrics) {
      const operation = metric.name.replace('timing.', '');
      const values = byOperation.get(operation) ?? [];
      byOperation.set(operation, [...values, metric.value]);
    }

    const result = new Map<string, { avg: number; count: number; min: number; max: number }>();
    for (const [operation, values] of byOperation) {
      const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
      result.set(operation, {
        avg,
        count: values.length,
        min: Math.min(...values),
        max: Math.max(...values),
      });
    }

    return result;
  });

  const slowestTimings = $derived.by(() => {
    return [...avgTimings].sort((a, b) => b[1].avg - a[1].avg).slice(0, 8);
  });

  const webVitalsSignal = $derived.by<MetricSignal>(() => {
    const fcpIncident = webVitals.fcp > 3000;
    const lcpIncident = webVitals.lcp > 4000;
    const clsIncident = webVitals.cls > 0.25;
    const fidIncident = Boolean(webVitals.fid && webVitals.fid > 300);
    const hasIncident = fcpIncident || lcpIncident || clsIncident || fidIncident;
    const hasAttention =
      webVitals.fcp > 1800 ||
      webVitals.lcp > 2500 ||
      webVitals.cls > 0.1 ||
      Boolean(webVitals.fid && webVitals.fid > 100);

    if (hasIncident) {
      return {
        label: 'Interface',
        value: 'Dégradée',
        state: 'Incident UX',
        hint: 'Inspectez les Web Vitals avant de valider un nouveau parcours.',
        icon: 'activity',
        tone: 'incident',
      };
    }

    if (hasAttention) {
      return {
        label: 'Interface',
        value: 'À surveiller',
        state: 'Attention',
        hint: 'La perception reste acceptable, mais une métrique approche le seuil.',
        icon: 'activity',
        tone: 'attention',
      };
    }

    return {
      label: 'Interface',
      value: 'Stable',
      state: 'Normal',
      hint: 'Aucun signal Web Vital critique dans la session courante.',
      icon: 'activity',
      tone: 'success',
    };
  });

  const prioritySignals = $derived.by<MetricSignal[]>(() => {
    const errors = recentErrors.length;
    const scan = scanStats;
    const cache = cacheStats;

    return [
      {
        label: 'Incidents',
        value: String(errors),
        state: errors > 0 ? 'À traiter' : 'Normal',
        hint:
          errors > 0
            ? 'Ouvrez le dernier incident, puis relancez le connecteur concerné.'
            : 'Aucune erreur de scan récente détectée.',
        icon: errors > 0 ? 'alert-triangle' : 'check',
        tone: errors > 0 ? 'incident' : 'success',
      },
      {
        label: 'Scans',
        value: String(scan.scanCount),
        state: scan.scanCount > 0 ? 'Historique exploitable' : 'Aucun signal',
        hint:
          scan.scanCount > 0
            ? `Dernier scan ${formatDuration(scan.lastScan)}, moyenne ${formatDuration(scan.avgScanTime)}.`
            : 'Lancez un scan pour établir une base de diagnostic.',
        icon: 'radar',
        tone: scan.scanCount > 0 ? 'success' : 'attention',
      },
      {
        label: 'Cache',
        value: `${cache.lastHitRate.toFixed(1)}%`,
        state: cache.lastHitRate >= 70 ? 'Efficace' : 'À réchauffer',
        hint:
          cache.lastHitRate >= 70
            ? 'Le cache réduit probablement la latence perçue.'
            : 'Inspectez les parcours qui recalculent trop souvent.',
        icon: 'database',
        tone: cache.lastHitRate >= 70 ? 'success' : 'attention',
      },
      webVitalsSignal,
    ];
  });

  const operationalSummary = $derived.by<OperationalSummary>(() => {
    const errors = recentErrors.length;
    const slowOperation = slowestTimings[0];
    const scan = scanStats;
    const cache = cacheStats;

    if (errors > 0) {
      const latest = recentErrors[0];
      return {
        statusLabel: 'Incident',
        title: `${errors} incident${errors > 1 ? 's' : ''} détecté${errors > 1 ? 's' : ''} dans la session`,
        description: `Dernier signal : ${latest?.tags?.connectorId ?? 'source inconnue'} / ${latest?.tags?.errorType ?? 'erreur non classée'}.`,
        action:
          'Action recommandée : ouvrir l’onglet Scans, identifier la source, puis relancer le scan.',
        tone: 'incident',
      };
    }

    if (scan.scanCount === 0) {
      return {
        statusLabel: 'Aucun signal',
        title: 'Le panneau ne peut pas encore diagnostiquer Pulse',
        description: 'Aucun scan instrumenté n’a été capturé dans cette session.',
        action: 'Action recommandée : lancer un scan, puis revenir ici après le premier résultat.',
        tone: 'attention',
      };
    }

    if (slowOperation && slowOperation[1].avg > 1000) {
      return {
        statusLabel: 'Latence',
        title: `${slowOperation[0]} ralentit le parcours opérationnel`,
        description: `Durée moyenne observée : ${formatDuration(slowOperation[1].avg)} sur ${slowOperation[1].count} appel${slowOperation[1].count > 1 ? 's' : ''}.`,
        action: 'Action recommandée : inspecter l’onglet Latences et prioriser cette opération.',
        tone: 'attention',
      };
    }

    if (cache.lastHitRate > 0 && cache.lastHitRate < 50) {
      return {
        statusLabel: 'Cache faible',
        title: 'Le cache ne protège pas encore assez les parcours répétés',
        description: `Hit rate courant : ${cache.lastHitRate.toFixed(1)}%.`,
        action: 'Action recommandée : vérifier les clés de cache ou les invalidations trop larges.',
        tone: 'attention',
      };
    }

    return {
      statusLabel: 'Normal',
      title: 'Pulse ne montre pas d’anomalie instrumentée',
      description: `${scan.scanCount} scan${scan.scanCount > 1 ? 's' : ''} observé${scan.scanCount > 1 ? 's' : ''}, aucun incident récent.`,
      action:
        'Action recommandée : continuer la session ou exporter les métriques si vous préparez une investigation.',
      tone: 'success',
    };
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.ctrlKey && e.shiftKey && e.key === 'M') {
      e.preventDefault();
      isOpen = !isOpen;
      if (isOpen) {
        refresh();
      }
    }
  }

  function refresh() {
    refreshKey++;
    webVitals = getWebVitals();
  }

  function toggleAutoRefresh() {
    autoRefresh = !autoRefresh;
    if (autoRefresh) {
      refreshInterval = setInterval(() => refreshKey++, 1000);
    } else if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }

  function exportMetrics() {
    const json = metricsCollector.export();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `missionpulse-metrics-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function resetMetrics() {
    metricsCollector.clear();
    refresh();
  }

  function formatDuration(ms: number): string {
    if (ms <= 0) {
      return '—';
    }
    if (ms < 1000) {
      return `${Math.round(ms)}ms`;
    }
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function metricValue(metric: Metric): string {
    if (metric.name === 'webvital.cls') {
      return metric.value.toFixed(3);
    }
    if (metric.unit === 'percent') {
      return `${metric.value.toFixed(1)}%`;
    }
    if (metric.unit === 'ms') {
      return formatDuration(metric.value);
    }
    return String(Math.round(metric.value));
  }

  function toneClasses(tone: DiagnosticTone): string {
    if (tone === 'incident') {
      return 'border-status-red/25 bg-status-red/8 text-status-red';
    }
    if (tone === 'attention') {
      return 'border-status-orange/25 bg-status-orange/8 text-status-orange';
    }
    return 'border-blueprint-blue/20 bg-blueprint-blue/6 text-blueprint-blue';
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div class="fixed inset-0 z-50 overflow-auto bg-page-canvas">
    <div class="sticky top-0 z-10 border-b border-border-light bg-surface-white px-4 py-3">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-3">
          <div
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blueprint-blue/8 text-blueprint-blue"
          >
            <Icon name="activity" size={15} />
          </div>
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-text-primary">Diagnostic opérationnel</p>
            <p class="truncate text-[10px] text-text-subtle">Ctrl+Shift+M · métriques de session</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            class="rounded-lg border px-2.5 py-1.5 text-[10px] font-medium transition-colors {autoRefresh
              ? 'border-blueprint-blue/25 bg-blueprint-blue/8 text-blueprint-blue'
              : 'border-border-light bg-page-canvas text-text-secondary hover:bg-subtle-gray'}"
            onclick={toggleAutoRefresh}
          >
            {autoRefresh ? 'Auto actif' : 'Auto pause'}
          </button>
          <button
            class="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-subtle-gray hover:text-blueprint-blue"
            onclick={refresh}
            aria-label="Rafraîchir le diagnostic"
            title="Rafraîchir le diagnostic"
          >
            <Icon name="refresh-cw" size={14} />
          </button>
          <button
            class="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-subtle-gray hover:text-text-primary"
            onclick={() => (isOpen = false)}
            aria-label="Fermer le diagnostic"
            title="Fermer le diagnostic"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      </div>
    </div>

    <div class="mx-auto max-w-6xl space-y-4 p-4">
      <section class="rounded-2xl border p-4 {toneClasses(operationalSummary.tone)}">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div class="min-w-0">
            <p class="text-[10px] font-semibold uppercase tracking-[0.16em]">
              {operationalSummary.statusLabel}
            </p>
            <h2 class="mt-2 text-xl font-semibold leading-tight text-text-primary">
              {operationalSummary.title}
            </h2>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
              {operationalSummary.description}
            </p>
            <p class="mt-2 text-sm font-medium text-text-primary">{operationalSummary.action}</p>
          </div>
          <div class="grid grid-cols-2 gap-2 md:w-80">
            {#each prioritySignals as signal}
              <div class="rounded-xl border border-surface-white/70 bg-surface-white/70 px-3 py-2">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-[9px] font-medium uppercase tracking-[0.14em] text-text-muted">
                    {signal.label}
                  </span>
                  <Icon name={signal.icon} size={12} class="shrink-0" />
                </div>
                <p class="mt-1 font-mono text-lg font-semibold tabular-nums text-text-primary">
                  {signal.value}
                </p>
                <p
                  class="text-[10px] font-medium {signal.tone === 'incident'
                    ? 'text-status-red'
                    : signal.tone === 'attention'
                      ? 'text-status-orange'
                      : 'text-blueprint-blue'}"
                >
                  {signal.state}
                </p>
              </div>
            {/each}
          </div>
        </div>
      </section>

      <nav
        class="flex gap-1 overflow-x-auto rounded-xl border border-border-light bg-surface-white p-1"
      >
        {#each tabs as tab}
          <button
            class="shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors {activeTab ===
            tab.id
              ? 'bg-blueprint-blue text-surface-white'
              : 'text-text-secondary hover:bg-subtle-gray hover:text-text-primary'}"
            onclick={() => (activeTab = tab.id)}
          >
            {tab.label}
          </button>
        {/each}
      </nav>

      {#if activeTab === 'overview'}
        <div class="grid gap-3 md:grid-cols-2">
          <section class="rounded-xl border border-border-light bg-surface-white p-4">
            <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              Signaux prioritaires
            </p>
            <div class="mt-3 space-y-2">
              {#each prioritySignals as signal}
                <article class="rounded-xl border border-border-light bg-page-canvas px-3 py-2.5">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="text-sm font-semibold text-text-primary">{signal.state}</p>
                      <p class="mt-1 text-xs leading-5 text-text-subtle">{signal.hint}</p>
                    </div>
                    <span class="font-mono text-sm font-semibold tabular-nums text-text-primary"
                      >{signal.value}</span
                    >
                  </div>
                </article>
              {/each}
            </div>
          </section>

          <section class="rounded-xl border border-border-light bg-surface-white p-4">
            <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              Couverture par source
            </p>
            {#if missionsByConnector.size === 0}
              <div class="mt-3 rounded-xl border border-status-orange/20 bg-status-orange/8 p-3">
                <p class="text-sm font-medium text-text-primary">
                  Aucune source n’a encore produit de signal.
                </p>
                <p class="mt-1 text-xs leading-5 text-text-subtle">
                  Lancez un scan pour savoir si le problème vient d’un connecteur ou d’un feed vide.
                </p>
              </div>
            {:else}
              <div class="mt-3 space-y-2">
                {#each [...missionsByConnector] as [connectorId, count]}
                  <article class="rounded-xl border border-border-light bg-page-canvas px-3 py-2.5">
                    <div class="flex items-center justify-between gap-3">
                      <div class="min-w-0">
                        <p class="truncate text-sm font-medium text-text-primary">{connectorId}</p>
                        <p class="text-xs text-text-subtle">
                          {count > 0
                            ? 'Source contributrice au dernier scan.'
                            : 'Source muette à investiguer.'}
                        </p>
                      </div>
                      <span class="font-mono text-sm font-semibold tabular-nums text-text-primary">
                        {count}
                      </span>
                    </div>
                  </article>
                {/each}
              </div>
            {/if}
          </section>
        </div>
      {:else if activeTab === 'scan'}
        <section class="rounded-xl border border-border-light bg-surface-white p-4">
          <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Timeline des scans
          </p>
          <div class="mt-3 rounded-xl border border-border-light bg-page-canvas p-3">
            <p class="text-sm font-semibold text-text-primary">
              {scanStats.scanCount > 0
                ? `Dernier scan traité en ${formatDuration(scanStats.lastScan)}`
                : 'Aucun scan mesuré'}
            </p>
            <p class="mt-1 text-xs leading-5 text-text-subtle">
              {scanStats.scanCount > 0
                ? `Moyenne observée ${formatDuration(scanStats.avgScanTime)}, déduplication ${scanStats.avgDedup.toFixed(1)}%.`
                : 'Déclenchez un scan pour créer une timeline exploitable.'}
            </p>
          </div>

          <div class="mt-3 space-y-2">
            {#each scanHistory as metric}
              {@const missions = allMetrics.find(
                (m) => m.name === 'scan.missions.total' && m.timestamp === metric.timestamp
              )}
              <article class="rounded-xl border border-border-light bg-surface-white px-3 py-2.5">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-xs font-medium text-text-primary">
                      {formatTimestamp(metric.timestamp)}
                    </p>
                    <p class="text-[11px] text-text-subtle">
                      {missions?.value
                        ? `${missions.value} mission(s) détectée(s)`
                        : 'Volume non renseigné'}
                    </p>
                  </div>
                  <span class="font-mono text-xs font-semibold tabular-nums text-blueprint-blue">
                    {formatDuration(metric.value)}
                  </span>
                </div>
              </article>
            {:else}
              <p
                class="rounded-xl border border-border-light bg-page-canvas p-3 text-xs text-text-subtle"
              >
                Aucune entrée de timeline disponible.
              </p>
            {/each}
          </div>
        </section>

        <section class="rounded-xl border border-border-light bg-surface-white p-4">
          <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Incidents récents
          </p>
          <div class="mt-3 space-y-2">
            {#each recentErrors as error}
              <article class="rounded-xl border border-status-red/20 bg-status-red/8 px-3 py-2.5">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold text-text-primary">
                      {error.tags?.connectorId ?? 'Source inconnue'}
                    </p>
                    <p class="mt-1 text-xs text-text-subtle">
                      Cause probable : {error.tags?.errorType ?? 'erreur non classée'}.
                    </p>
                    <p class="mt-1 text-xs font-medium text-text-primary">
                      Action : relancer la source ou inspecter la session navigateur.
                    </p>
                  </div>
                  <span class="font-mono text-[11px] text-text-muted"
                    >{formatTimestamp(error.timestamp)}</span
                  >
                </div>
              </article>
            {:else}
              <p
                class="rounded-xl border border-border-light bg-page-canvas p-3 text-xs text-text-subtle"
              >
                Aucun incident récent. Le scan peut être considéré normal sur cette session.
              </p>
            {/each}
          </div>
        </section>
      {:else if activeTab === 'cache'}
        <section class="rounded-xl border border-border-light bg-surface-white p-4">
          <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Diagnostic cache
          </p>
          <div
            class="mt-3 rounded-xl border p-3 {cacheStats.lastHitRate >= 70
              ? 'border-blueprint-blue/20 bg-blueprint-blue/6'
              : 'border-status-orange/20 bg-status-orange/8'}"
          >
            <p class="text-sm font-semibold text-text-primary">
              {cacheStats.lastHitRate >= 70
                ? 'Le cache accélère les parcours répétés'
                : 'Le cache mérite une investigation'}
            </p>
            <p class="mt-1 text-xs leading-5 text-text-subtle">
              Hit rate {cacheStats.lastHitRate.toFixed(1)}%, {cacheStats.lastSize} entrée(s) suivie(s).
              {cacheStats.lastHitRate >= 70
                ? ' Continuez à surveiller après les scans longs.'
                : ' Vérifiez les invalidations et les clés trop spécifiques.'}
            </p>
          </div>

          <div class="mt-3 space-y-2">
            {#each cacheHistory as metric}
              {@const hits = allMetrics.find(
                (m) => m.name === 'cache.memory.hits' && m.timestamp === metric.timestamp
              )}
              {@const misses = allMetrics.find(
                (m) => m.name === 'cache.memory.misses' && m.timestamp === metric.timestamp
              )}
              <article class="rounded-xl border border-border-light bg-page-canvas px-3 py-2.5">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-xs font-medium text-text-primary">
                      {formatTimestamp(metric.timestamp)}
                    </p>
                    <p class="text-[11px] text-text-subtle">
                      {hits?.value ?? 0} hit(s), {misses?.value ?? 0} miss(es)
                    </p>
                  </div>
                  <span class="font-mono text-xs font-semibold tabular-nums text-blueprint-blue">
                    {metric.value.toFixed(1)}%
                  </span>
                </div>
              </article>
            {:else}
              <p
                class="rounded-xl border border-border-light bg-page-canvas p-3 text-xs text-text-subtle"
              >
                Aucun historique cache disponible.
              </p>
            {/each}
          </div>
        </section>
      {:else if activeTab === 'timings'}
        <section class="rounded-xl border border-border-light bg-surface-white p-4">
          <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Latences à prioriser
          </p>
          <div class="mt-3 space-y-2">
            {#each slowestTimings as [operation, stats]}
              <article class="rounded-xl border border-border-light bg-page-canvas px-3 py-2.5">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold text-text-primary">{operation}</p>
                    <p class="mt-1 text-xs text-text-subtle">
                      {stats.count} appel{stats.count > 1 ? 's' : ''}, plage {formatDuration(
                        stats.min
                      )}
                      → {formatDuration(stats.max)}.
                    </p>
                    <p class="mt-1 text-xs font-medium text-text-primary">
                      {stats.avg > 1000
                        ? 'Action : profiler cette opération avant le prochain shipping.'
                        : 'État : pas de blocage opérationnel immédiat.'}
                    </p>
                  </div>
                  <span
                    class="font-mono text-sm font-semibold tabular-nums {stats.avg > 1000
                      ? 'text-status-orange'
                      : 'text-blueprint-blue'}"
                  >
                    {formatDuration(stats.avg)}
                  </span>
                </div>
              </article>
            {:else}
              <p
                class="rounded-xl border border-border-light bg-page-canvas p-3 text-xs text-text-subtle"
              >
                Aucune latence instrumentée. Ajoutez un timing autour du parcours à investiguer.
              </p>
            {/each}
          </div>
        </section>
      {:else if activeTab === 'webvitals'}
        <section class="rounded-xl border border-border-light bg-surface-white p-4">
          <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Expérience perçue
          </p>
          <div class="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            {#each [{ label: 'FCP', value: webVitals.fcp, limit: 1800, incident: 3000, help: 'Premier contenu visible' }, { label: 'LCP', value: webVitals.lcp, limit: 2500, incident: 4000, help: 'Contenu principal visible' }, { label: 'CLS', value: webVitals.cls, limit: 0.1, incident: 0.25, help: 'Stabilité visuelle' }, { label: 'FID', value: webVitals.fid ?? 0, limit: 100, incident: 300, help: 'Réactivité interaction' }] as vital}
              {@const measured = vital.value > 0}
              {@const tone = !measured
                ? 'attention'
                : vital.value > vital.incident
                  ? 'incident'
                  : vital.value > vital.limit
                    ? 'attention'
                    : 'success'}
              <article class="rounded-xl border p-3 {toneClasses(tone)}">
                <p class="text-[10px] font-semibold uppercase tracking-[0.14em]">{vital.label}</p>
                <p class="mt-1 font-mono text-lg font-semibold tabular-nums text-text-primary">
                  {measured
                    ? vital.label === 'CLS'
                      ? vital.value.toFixed(3)
                      : formatDuration(vital.value)
                    : '—'}
                </p>
                <p class="mt-1 text-[11px] leading-4 text-text-subtle">{vital.help}</p>
              </article>
            {/each}
          </div>

          <div class="mt-3 space-y-2">
            {#each webVitalsHistory as metric}
              <article class="rounded-xl border border-border-light bg-page-canvas px-3 py-2.5">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-xs font-medium text-text-primary">
                      {metric.name.replace('webvital.', '').toUpperCase()}
                    </p>
                    <p class="text-[11px] text-text-subtle">{formatTimestamp(metric.timestamp)}</p>
                  </div>
                  <span class="font-mono text-xs font-semibold tabular-nums text-text-primary">
                    {metricValue(metric)}
                  </span>
                </div>
              </article>
            {:else}
              <p
                class="rounded-xl border border-border-light bg-page-canvas p-3 text-xs text-text-subtle"
              >
                Aucune mesure historique. Rafraîchissez après avoir navigué dans l’interface.
              </p>
            {/each}
          </div>
        </section>
      {/if}

      <footer class="flex flex-wrap items-center gap-2 border-t border-border-light pt-4">
        <button
          class="rounded-lg border border-blueprint-blue/25 bg-blueprint-blue/8 px-3 py-1.5 text-xs font-medium text-blueprint-blue transition-colors hover:bg-blueprint-blue/12"
          onclick={exportMetrics}
        >
          Exporter le contexte JSON
        </button>
        <button
          class="rounded-lg border border-status-red/25 bg-status-red/8 px-3 py-1.5 text-xs font-medium text-status-red transition-colors hover:bg-status-red/12"
          onclick={resetMetrics}
        >
          Vider la session
        </button>
        <span class="ml-auto text-[10px] text-text-muted">
          {allMetrics.length} signal{allMetrics.length > 1 ? 'aux' : ''} collecté{allMetrics.length >
          1
            ? 's'
            : ''}
        </span>
      </footer>
    </div>
  </div>
{:else}
  <div class="fixed bottom-2 left-2 z-50">
    <button
      class="rounded border border-border-light bg-surface-white/80 px-2 py-1 text-[9px] font-mono text-text-muted transition-colors hover:text-blueprint-blue"
      onclick={() => {
        isOpen = true;
        refresh();
      }}
      title="Ouvrir le diagnostic opérationnel"
    >
      Ctrl+Shift+M
    </button>
  </div>
{/if}
