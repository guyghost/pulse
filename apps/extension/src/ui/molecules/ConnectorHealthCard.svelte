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

  type ConnectorDiagnosis = {
    statusLabel: string;
    hint: string;
    tone: 'success' | 'attention' | 'incident';
  };

  function formatLatency(ms: number | null): string {
    if (ms === null) {
      return '—';
    }
    if (ms < 1000) {
      return `${Math.round(ms)}ms`;
    }
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatRelativeTime(ts: number | null): string {
    if (ts === null) {
      return 'jamais';
    }
    const diff = now - ts;
    const minutes = Math.floor(diff / 60_000);
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

  const lastSuccessText = $derived(formatRelativeTime(snapshot.lastSuccessAt));
  const p95Text = $derived(formatLatency(metrics.p95LatencyMs));
  const failureRatePct = $derived(Math.round(metrics.failureRate * 100));

  const diagnosis = $derived.by<ConnectorDiagnosis>(() => {
    if (isOpen) {
      return {
        statusLabel: 'Collecte suspendue',
        hint: 'Source isolée pour éviter des scans répétés en échec.',
        tone: 'incident',
      };
    }

    if (snapshot.circuitState === 'half-open') {
      return {
        statusLabel: 'Sonde en cours',
        hint: 'Pulse teste si la source peut réintégrer le scan.',
        tone: 'attention',
      };
    }

    if (snapshot.consecutiveFailures > 0) {
      return {
        statusLabel: 'Instable',
        hint: `${snapshot.consecutiveFailures} échec${snapshot.consecutiveFailures > 1 ? 's' : ''} consécutif${snapshot.consecutiveFailures > 1 ? 's' : ''}; surveillez le prochain scan.`,
        tone: 'attention',
      };
    }

    if (metrics.totalCalls === 0) {
      return {
        statusLabel: 'Pas encore sondée',
        hint: 'Aucun historique disponible pour qualifier la fiabilité.',
        tone: 'attention',
      };
    }

    if (failureRatePct >= 30) {
      return {
        statusLabel: 'Fiabilité dégradée',
        hint: `${failureRatePct}% d’échecs observés sur l’historique récent.`,
        tone: 'attention',
      };
    }

    return {
      statusLabel: 'Collecte fiable',
      hint: `Dernier succès ${lastSuccessText}; latence p95 ${p95Text}.`,
      tone: 'success',
    };
  });
</script>

<div
  class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[11px]
    {isOpen
    ? 'border-status-red/20 bg-status-red/8'
    : isHealthy
      ? 'border-border-light bg-page-canvas'
      : 'border-blueprint-blue/20 bg-blueprint-blue/[0.06]'}"
>
  <div class="flex min-w-0 items-center gap-2">
    <CircuitBadge state={snapshot.circuitState} size="md" />
    <div class="min-w-0">
      <span class="block truncate font-medium text-text-primary">{connectorName}</span>
      <span class="mt-0.5 block truncate text-[10px] text-text-subtle">{diagnosis.hint}</span>
    </div>
  </div>

  <div
    class="flex shrink-0 flex-col items-end gap-0.5 text-[10px]"
    title={`Dernier succès : ${lastSuccessText}. Latence p95 : ${p95Text}. Échecs : ${failureRatePct}%.`}
  >
    <span
      class={diagnosis.tone === 'incident'
        ? 'font-medium text-status-red'
        : diagnosis.tone === 'attention'
          ? 'font-medium text-status-orange'
          : 'font-medium text-blueprint-blue'}
    >
      {diagnosis.statusLabel}
    </span>
    <span class="font-mono tabular-nums text-text-muted">{lastSuccessText}</span>
  </div>
</div>
