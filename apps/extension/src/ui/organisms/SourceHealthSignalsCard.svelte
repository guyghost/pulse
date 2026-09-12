<script lang="ts">
  /**
   * SourceHealthSignalsCard — carte « Santé des sources » (organisme).
   * 4 signaux de risque agrégés avec jauges demi-cercle, dérivés à 100 %
   * des enregistrements persistés via le core pur `computeSourceHealthSignals`.
   * Modèle : src/models/source-health-signals.model.md
   */
  import { Icon } from '@pulse/ui';
  import GaugeArc from '../atoms/GaugeArc.svelte';
  import {
    computeScoreStats,
    computeSourceHealthSignals,
    type DedupStats,
  } from '$lib/core/connectors/source-health-signals';
  import type { ConnectorHealthRecord } from '$lib/core/connectors/parser-health-logic';
  import type { PersistedConnectorStatus } from '$lib/core/types/connector-status';
  import type { Mission } from '$lib/core/types/mission';

  const {
    healthRecords,
    persistedStatuses,
    missions,
    dedupStats = null,
  }: {
    healthRecords: Map<string, ConnectorHealthRecord>;
    persistedStatuses: PersistedConnectorStatus[];
    missions: Mission[];
    dedupStats: DedupStats | null;
  } = $props();

  const result = $derived(
    computeSourceHealthSignals(
      {
        healthRecords: [...healthRecords.values()],
        persistedStatuses,
        dedupStats,
        scoreStats: computeScoreStats(missions),
      },
      new Date()
    )
  );

  // Modèle §4 : la ligne la plus préoccupante passe en bleu uniquement
  // si sa sévérité est warn ou alert — tout gris quand tout va bien.
  const highlightId = $derived.by(() => {
    const first = result.signals[0];
    return first && first.severity !== 'ok' ? first.id : null;
  });

  const subtitle = $derived(`Signaux sur ${result.activeConnectorCount} connecteur(s) actif(s)`);

  function formatValue(value: number, unit: '%' | 'count'): string {
    return unit === '%' ? `${value}%` : `${value}`;
  }
</script>

<div class="mt-4 overflow-hidden rounded-xl border border-border-light bg-page-canvas">
  <div class="flex items-center gap-2 px-3 pt-3">
    <span
      class="inline-flex items-center rounded-md bg-subtle-gray px-1.5 py-0.5 text-text-muted"
      aria-hidden="true"
    >
      <Icon name="alert-triangle" size={11} />
    </span>
    <div class="min-w-0">
      <p class="eyebrow eyebrow--strong">Santé des sources</p>
      <p class="mt-0.5 truncate text-micro text-text-muted">{subtitle}</p>
    </div>
  </div>

  {#if result.signals.length === 0}
    <div class="px-3 pt-2 pb-3">
      <p class="text-micro leading-4 text-text-muted">
        Aucun connecteur actif pour l'instant. Lancez un scan pour alimenter les signaux.
      </p>
    </div>
  {:else}
    <ul class="mt-2 divide-y divide-border-light px-3 pb-2">
      {#each result.signals as signal (signal.id)}
        {@const highlighted = signal.id === highlightId}
        <li class="flex items-center gap-2.5 py-2">
          <GaugeArc
            ratio={signal.ratio}
            color={highlighted ? 'blue' : 'gray'}
            title="{signal.label} : {formatValue(signal.value, signal.unit)}"
          />
          <div class="min-w-0 flex-1">
            <p
              class="text-micro leading-4 font-medium {highlighted
                ? 'text-blueprint-blue'
                : 'text-text-primary'}"
            >
              {signal.label}
            </p>
            <p class="mt-0.5 truncate text-micro leading-4 text-text-muted">
              {signal.detail}
            </p>
          </div>
          <span
            class="shrink-0 font-mono text-micro font-semibold {highlighted
              ? 'text-blueprint-blue'
              : 'text-text-muted'}"
          >
            {formatValue(signal.value, signal.unit)}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
