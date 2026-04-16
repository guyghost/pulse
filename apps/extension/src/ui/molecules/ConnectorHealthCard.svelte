<script lang="ts">
  import type { ConnectorHealthSnapshot } from '$lib/core/types/health';
  import { computeHealthMetrics } from '$lib/core/health/health-metrics';
  import CircuitBadge from '../atoms/CircuitBadge.svelte';

  const {
    snapshot,
    connectorName,
    now = Date.now(),
  }: {
    snapshot: ConnectorHealthSnapshot;
    connectorName: string;
    /** Timestamp courant injecté (défaut: Date.now() — acceptable en UI leaf) */
    now?: number;
  } = $props();

  const metrics = $derived(computeHealthMetrics(snapshot, now));

  const isHealthy = $derived(snapshot.circuitState === 'closed');
  const isOpen = $derived(snapshot.circuitState === 'open');

  function formatLatency(ms: number | null): string {
    if (ms === null) return '—';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatRelativeTime(ts: number | null): string {
    if (ts === null) return 'jamais';
    const diff = now - ts;
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return "à l'instant";
    if (minutes < 60) return `il y a ${minutes}min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `il y a ${hours}h`;
    return `il y a ${Math.floor(hours / 24)}j`;
  }

  const lastSuccessText = $derived(formatRelativeTime(snapshot.lastSuccessAt));
  const p95Text = $derived(formatLatency(metrics.p95LatencyMs));
  const failureRatePct = $derived(Math.round(metrics.failureRate * 100));
</script>

<div
  class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[11px]
    {isOpen
      ? 'border-red-400/20 bg-red-400/[0.06]'
      : isHealthy
        ? 'border-white/6 bg-white/[0.03]'
        : 'border-accent-amber/20 bg-accent-amber/[0.06]'}"
>
  <!-- Left: circuit badge + name -->
  <div class="flex min-w-0 items-center gap-2">
    <CircuitBadge state={snapshot.circuitState} size="md" />
    <span class="truncate font-medium text-text-primary">{connectorName}</span>
  </div>

  <!-- Right: metrics -->
  <div class="flex shrink-0 items-center gap-3 text-text-muted">
    {#if snapshot.consecutiveFailures > 0}
      <span
        class="font-mono text-red-400"
        title="Échecs consécutifs"
      >{snapshot.consecutiveFailures} err</span>
    {/if}

    {#if metrics.totalCalls > 0}
      <span title="Latence p95">{p95Text}</span>
    {/if}

    <span title="Dernier succès">{lastSuccessText}</span>

    {#if isOpen}
      <span class="text-red-400/80 text-[10px]">suspendu</span>
    {:else if snapshot.circuitState === 'half-open'}
      <span class="text-accent-amber/80 text-[10px] animate-pulse">sonde...</span>
    {/if}
  </div>
</div>
