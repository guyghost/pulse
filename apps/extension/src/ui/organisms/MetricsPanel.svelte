<script lang="ts">
  import Icon from '../atoms/Icon.svelte';
  import { metricsCollector, getWebVitals } from '../../lib/shell/metrics';
  import type { Metric } from '../../lib/core/metrics/types';

  let isOpen = $state(false);
  let activeTab = $state<'overview' | 'timings' | 'cache' | 'scan' | 'webvitals'>('overview');
  let refreshKey = $state(0);
  let autoRefresh = $state(false);
  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  // Récupérer les métriques
  const allMetrics = $derived.by(() => {
    refreshKey; // Dependency pour forcer la réévaluation
    return metricsCollector.getMetrics();
  });

  // Grouper les métriques par nom
  const metricsByName = $derived(() => {
    const grouped = new Map<string, Metric[]>();
    for (const metric of allMetrics) {
      const existing = grouped.get(metric.name) || [];
      existing.push(metric);
      grouped.set(metric.name, existing);
    }
    return grouped;
  });

  // Calculer les stats du scan
  const scanStats = $derived(() => {
    const scanDurations = allMetrics.filter((m) => m.name === 'scan.duration').map((m) => m.value);
    const avgScanTime =
      scanDurations.length > 0
        ? Math.round(scanDurations.reduce((a, b) => a + b, 0) / scanDurations.length)
        : 0;
    const lastScan = scanDurations[scanDurations.length - 1] || 0;

    const dedupRatios = allMetrics.filter((m) => m.name === 'scan.dedup_ratio').map((m) => m.value);
    const avgDedup =
      dedupRatios.length > 0
        ? Math.round((dedupRatios.reduce((a, b) => a + b, 0) / dedupRatios.length) * 10) / 10
        : 0;

    return { avgScanTime, lastScan, avgDedup, scanCount: scanDurations.length };
  });

  // Stats cache
  const cacheStats = $derived(() => {
    const hitRates = allMetrics
      .filter((m) => m.name === 'cache.memory.hit_rate')
      .map((m) => m.value);
    const lastHitRate = hitRates[hitRates.length - 1] || 0;
    const sizes = allMetrics.filter((m) => m.name === 'cache.memory.size').map((m) => m.value);
    const lastSize = sizes[sizes.length - 1] || 0;

    return { lastHitRate, lastSize };
  });

  // Missions par connecteur
  const missionsByConnector = $derived(() => {
    const connectorMetrics = allMetrics.filter((m) => m.name === 'scan.missions.per_connector');
    const latestByConnector = new Map<string, number>();
    for (const m of connectorMetrics) {
      if (m.tags?.connectorId) {
        latestByConnector.set(m.tags.connectorId, m.value);
      }
    }
    return latestByConnector;
  });

  // Erreurs récentes
  const recentErrors = $derived(() => {
    return allMetrics
      .filter((m) => m.name === 'scan.error')
      .slice(-10)
      .reverse();
  });

  // Timings moyens par opération
  const avgTimings = $derived(() => {
    const timingMetrics = allMetrics.filter((m) => m.name.startsWith('timing.'));
    const byOp = new Map<string, number[]>();
    for (const m of timingMetrics) {
      const op = m.name.replace('timing.', '');
      const existing = byOp.get(op) || [];
      existing.push(m.value);
      byOp.set(op, existing);
    }
    const result = new Map<string, { avg: number; count: number; min: number; max: number }>();
    for (const [op, values] of byOp) {
      const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
      result.set(op, {
        avg,
        count: values.length,
        min: Math.min(...values),
        max: Math.max(...values),
      });
    }
    return result;
  });

  // Web Vitals
  let webVitals = $state(getWebVitals());

  function handleKeydown(e: KeyboardEvent) {
    if (e.ctrlKey && e.shiftKey && e.key === 'M') {
      e.preventDefault();
      isOpen = !isOpen;
      if (isOpen) {
        refreshKey++;
        webVitals = getWebVitals();
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
    const a = document.createElement('a');
    a.href = url;
    a.download = `missionpulse-metrics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetMetrics() {
    metricsCollector.clear();
    refreshKey++;
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleTimeString();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div class="fixed inset-0 z-50 bg-navy-900/95 overflow-auto">
    <!-- Header -->
    <div
      class="sticky top-0 flex items-center justify-between px-4 py-3 bg-navy-800 border-b border-navy-700"
    >
      <div class="flex items-center gap-3">
        <span class="text-sm font-bold text-accent-blue font-mono">METRICS</span>
        <div class="flex gap-1">
          {#each ['overview', 'scan', 'cache', 'timings', 'webvitals'] as tab}
            <button
              class="px-2 py-1 text-[10px] font-mono rounded transition-colors {activeTab === tab
                ? 'bg-accent-blue text-white'
                : 'bg-surface text-text-secondary hover:text-text-primary'}"
              onclick={() => (activeTab = tab as typeof activeTab)}
            >
              {tab}
            </button>
          {/each}
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="px-2 py-1 text-[10px] font-mono rounded {autoRefresh
            ? 'bg-accent-emerald/20 text-accent-emerald'
            : 'bg-surface text-text-secondary'} transition-colors"
          onclick={toggleAutoRefresh}
        >
          {autoRefresh ? 'auto-on' : 'auto-off'}
        </button>
        <button
          class="p-1.5 text-text-secondary hover:text-accent-blue transition-colors"
          onclick={refresh}
          title="Refresh"
        >
          <Icon name="refresh-cw" size={14} />
        </button>
        <button
          class="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
          onclick={() => (isOpen = false)}
        >
          <Icon name="x" size={16} />
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="p-4 max-w-6xl mx-auto">
      <!-- Overview Tab -->
      {#if activeTab === 'overview'}
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div class="bg-surface rounded p-3">
            <div class="text-[10px] uppercase text-text-secondary tracking-wider">Scans</div>
            <div class="text-2xl font-mono text-text-primary">{scanStats().scanCount}</div>
          </div>
          <div class="bg-surface rounded p-3">
            <div class="text-[10px] uppercase text-text-secondary tracking-wider">
              Avg Scan Time
            </div>
            <div class="text-2xl font-mono text-accent-blue">
              {formatDuration(scanStats().avgScanTime)}
            </div>
          </div>
          <div class="bg-surface rounded p-3">
            <div class="text-[10px] uppercase text-text-secondary tracking-wider">
              Cache Hit Rate
            </div>
            <div class="text-2xl font-mono text-accent-emerald">
              {cacheStats().lastHitRate.toFixed(1)}%
            </div>
          </div>
          <div class="bg-surface rounded p-3">
            <div class="text-[10px] uppercase text-text-secondary tracking-wider">Dedup Ratio</div>
            <div class="text-2xl font-mono text-accent-amber">
              {scanStats().avgDedup.toFixed(1)}%
            </div>
          </div>
        </div>

        <div class="grid md:grid-cols-2 gap-4">
          <!-- Missions by Connector -->
          <div class="bg-surface rounded p-3">
            <div class="text-[10px] uppercase text-text-secondary tracking-wider mb-2">
              Missions by Connector
            </div>
            {#if missionsByConnector().size === 0}
              <div class="text-text-muted text-xs">No data yet</div>
            {:else}
              <div class="space-y-1">
                {#each [...missionsByConnector()] as [connectorId, count]}
                  <div
                    class="flex justify-between items-center py-1 border-b border-navy-700 last:border-0"
                  >
                    <span class="text-xs text-text-secondary">{connectorId}</span>
                    <span class="text-xs font-mono text-text-primary">{count}</span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Recent Errors -->
          <div class="bg-surface rounded p-3">
            <div class="text-[10px] uppercase text-text-secondary tracking-wider mb-2">
              Recent Errors
            </div>
            {#if recentErrors().length === 0}
              <div class="text-text-muted text-xs">No errors</div>
            {:else}
              <div class="space-y-1 max-h-40 overflow-auto">
                {#each recentErrors() as error}
                  <div
                    class="flex justify-between items-center py-1 border-b border-navy-700 last:border-0 text-xs"
                  >
                    <span class="text-accent-red">{error.tags?.connectorId || 'unknown'}</span>
                    <span class="text-text-muted">{error.tags?.errorType || 'error'}</span>
                    <span class="text-text-muted font-mono">{formatTimestamp(error.timestamp)}</span
                    >
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Scan Tab -->
      {#if activeTab === 'scan'}
        <div class="space-y-4">
          <div class="bg-surface rounded p-4">
            <div class="grid grid-cols-3 gap-4">
              <div>
                <div class="text-[10px] uppercase text-text-secondary tracking-wider">
                  Total Scans
                </div>
                <div class="text-xl font-mono text-text-primary">{scanStats().scanCount}</div>
              </div>
              <div>
                <div class="text-[10px] uppercase text-text-secondary tracking-wider">
                  Avg Duration
                </div>
                <div class="text-xl font-mono text-accent-blue">
                  {formatDuration(scanStats().avgScanTime)}
                </div>
              </div>
              <div>
                <div class="text-[10px] uppercase text-text-secondary tracking-wider">
                  Last Duration
                </div>
                <div class="text-xl font-mono text-text-primary">
                  {formatDuration(scanStats().lastScan)}
                </div>
              </div>
            </div>
          </div>

          <!-- All scan metrics -->
          <div class="bg-surface rounded p-3">
            <div class="text-[10px] uppercase text-text-secondary tracking-wider mb-2">
              Scan History
            </div>
            <div class="space-y-1 max-h-64 overflow-auto">
              {#each allMetrics.filter((m) => m.name === 'scan.duration').reverse() as metric}
                {@const missions = allMetrics.find(
                  (m) => m.name === 'scan.missions.total' && m.timestamp === metric.timestamp
                )}
                <div
                  class="flex justify-between items-center py-1 border-b border-navy-700 last:border-0 text-xs"
                >
                  <span class="font-mono text-text-secondary"
                    >{formatTimestamp(metric.timestamp)}</span
                  >
                  <span class="text-accent-blue">{formatDuration(metric.value)}</span>
                  <span class="text-text-primary">{missions?.value || '?'} missions</span>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}

      <!-- Cache Tab -->
      {#if activeTab === 'cache'}
        <div class="space-y-4">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="bg-surface rounded p-3">
              <div class="text-[10px] uppercase text-text-secondary tracking-wider">Hit Rate</div>
              <div class="text-2xl font-mono text-accent-emerald">
                {cacheStats().lastHitRate.toFixed(1)}%
              </div>
            </div>
            <div class="bg-surface rounded p-3">
              <div class="text-[10px] uppercase text-text-secondary tracking-wider">Size</div>
              <div class="text-2xl font-mono text-text-primary">{cacheStats().lastSize}</div>
            </div>
          </div>

          <!-- All cache metrics -->
          <div class="bg-surface rounded p-3">
            <div class="text-[10px] uppercase text-text-secondary tracking-wider mb-2">
              Cache History
            </div>
            <div class="space-y-1 max-h-64 overflow-auto">
              {#each allMetrics
                .filter((m) => m.name === 'cache.memory.hit_rate')
                .reverse() as metric}
                {@const hits = allMetrics.find(
                  (m) => m.name === 'cache.memory.hits' && m.timestamp === metric.timestamp
                )}
                {@const misses = allMetrics.find(
                  (m) => m.name === 'cache.memory.misses' && m.timestamp === metric.timestamp
                )}
                <div
                  class="flex justify-between items-center py-1 border-b border-navy-700 last:border-0 text-xs"
                >
                  <span class="font-mono text-text-secondary"
                    >{formatTimestamp(metric.timestamp)}</span
                  >
                  <span class="text-accent-emerald">{metric.value.toFixed(1)}%</span>
                  <span class="text-text-muted"
                    >{hits?.value || 0} hits / {misses?.value || 0} misses</span
                  >
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}

      <!-- Timings Tab -->
      {#if activeTab === 'timings'}
        <div class="bg-surface rounded p-3">
          <div class="text-[10px] uppercase text-text-secondary tracking-wider mb-2">
            Operation Timings
          </div>
          {#if avgTimings().size === 0}
            <div class="text-text-muted text-xs">No timing data yet</div>
          {:else}
            <div class="space-y-1">
              {#each [...avgTimings()].sort((a, b) => b[1].avg - a[1].avg) as [op, stats]}
                <div
                  class="flex justify-between items-center py-2 border-b border-navy-700 last:border-0"
                >
                  <span class="text-xs text-text-secondary">{op}</span>
                  <div class="flex items-center gap-4">
                    <span class="text-[10px] text-text-muted">{stats.count} calls</span>
                    <span class="text-[10px] text-text-muted">min {stats.min}ms</span>
                    <span class="text-[10px] text-text-muted">max {stats.max}ms</span>
                    <span class="text-xs font-mono text-accent-blue w-16 text-right"
                      >{stats.avg}ms avg</span
                    >
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Web Vitals Tab -->
      {#if activeTab === 'webvitals'}
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="bg-surface rounded p-4">
            <div class="text-[10px] uppercase text-text-secondary tracking-wider">FCP</div>
            <div
              class="text-2xl font-mono {webVitals.fcp < 1800
                ? 'text-accent-emerald'
                : webVitals.fcp < 3000
                  ? 'text-accent-amber'
                  : 'text-accent-red'}"
            >
              {webVitals.fcp > 0 ? `${Math.round(webVitals.fcp)}ms` : '–'}
            </div>
            <div class="text-[10px] text-text-muted">First Contentful Paint</div>
          </div>
          <div class="bg-surface rounded p-4">
            <div class="text-[10px] uppercase text-text-secondary tracking-wider">LCP</div>
            <div
              class="text-2xl font-mono {webVitals.lcp < 2500
                ? 'text-accent-emerald'
                : webVitals.lcp < 4000
                  ? 'text-accent-amber'
                  : 'text-accent-red'}"
            >
              {webVitals.lcp > 0 ? `${Math.round(webVitals.lcp)}ms` : '–'}
            </div>
            <div class="text-[10px] text-text-muted">Largest Contentful Paint</div>
          </div>
          <div class="bg-surface rounded p-4">
            <div class="text-[10px] uppercase text-text-secondary tracking-wider">CLS</div>
            <div
              class="text-2xl font-mono {webVitals.cls < 0.1
                ? 'text-accent-emerald'
                : webVitals.cls < 0.25
                  ? 'text-accent-amber'
                  : 'text-accent-red'}"
            >
              {webVitals.cls > 0 ? webVitals.cls.toFixed(3) : '–'}
            </div>
            <div class="text-[10px] text-text-muted">Cumulative Layout Shift</div>
          </div>
          <div class="bg-surface rounded p-4">
            <div class="text-[10px] uppercase text-text-secondary tracking-wider">FID</div>
            <div
              class="text-2xl font-mono {webVitals.fid && webVitals.fid < 100
                ? 'text-accent-emerald'
                : webVitals.fid && webVitals.fid < 300
                  ? 'text-accent-amber'
                  : 'text-accent-red'}"
            >
              {webVitals.fid && webVitals.fid > 0 ? `${webVitals.fid}ms` : '–'}
            </div>
            <div class="text-[10px] text-text-muted">First Input Delay</div>
          </div>
        </div>

        <!-- All web vital metrics -->
        <div class="bg-surface rounded p-3 mt-4">
          <div class="text-[10px] uppercase text-text-secondary tracking-wider mb-2">
            Web Vitals History
          </div>
          <div class="space-y-1 max-h-64 overflow-auto">
            {#each allMetrics.filter((m) => m.name.startsWith('webvital.')).reverse() as metric}
              <div
                class="flex justify-between items-center py-1 border-b border-navy-700 last:border-0 text-xs"
              >
                <span class="text-text-secondary"
                  >{metric.name.replace('webvital.', '').toUpperCase()}</span
                >
                <span class="font-mono text-text-secondary"
                  >{formatTimestamp(metric.timestamp)}</span
                >
                <span class="font-mono text-text-primary">
                  {metric.name === 'webvital.cls'
                    ? metric.value.toFixed(3)
                    : `${Math.round(metric.value)}ms`}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Footer Actions -->
      <div class="flex gap-2 mt-6 pt-4 border-t border-navy-700">
        <button
          class="px-3 py-1.5 text-xs font-mono rounded bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 transition-colors"
          onclick={exportMetrics}
        >
          Export JSON
        </button>
        <button
          class="px-3 py-1.5 text-xs font-mono rounded bg-accent-red/20 text-accent-red hover:bg-accent-red/30 transition-colors"
          onclick={resetMetrics}
        >
          Reset All
        </button>
        <span class="text-[10px] text-text-muted ml-auto self-center">
          {allMetrics.length} metrics collected
        </span>
      </div>
    </div>
  </div>
{:else}
  <div class="fixed bottom-2 left-2 z-50">
    <button
      class="px-2 py-1 text-[9px] font-mono rounded bg-navy-800/80 text-text-muted hover:text-accent-blue transition-colors border border-navy-700/50"
      onclick={() => (isOpen = true)}
    >
      Ctrl+Shift+M
    </button>
  </div>
{/if}
