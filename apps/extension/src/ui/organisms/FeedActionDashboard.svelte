<script lang="ts">
  import { Icon } from '@pulse/ui';
  import type {
    FeedDashboardSummary,
    FeedInsightSummary,
    ScoreBucket,
    ScoreBucketSummary,
  } from '$lib/state/feed-page.svelte';

  const {
    summary,
    insightSummary,
    scoreDistribution = [],
    selectedScoreBucket = null,
    showNewOnly = false,
    brokenConnectorCount = 0,
    onToggleNewOnly,
    onToggleFavorites,
    onSetScoreBucket,
  }: {
    summary: FeedDashboardSummary;
    insightSummary: FeedInsightSummary;
    scoreDistribution?: ScoreBucketSummary[];
    selectedScoreBucket?: ScoreBucket | null;
    showNewOnly?: boolean;
    brokenConnectorCount?: number;
    onToggleNewOnly?: () => void;
    onToggleFavorites?: () => void;
    onSetScoreBucket?: (bucket: ScoreBucket | null) => void;
  } = $props();

  const totalBucketCount = $derived(
    scoreDistribution.reduce((sum, bucket) => sum + bucket.count, 0)
  );
  const hasScoreData = $derived(totalBucketCount > 0);

  const bucketTone: Record<ScoreBucket, string> = {
    strong: 'bg-blueprint-blue',
    good: 'bg-status-yellow',
    weak: 'bg-disabled-gray',
  };

  const bucketTextTone: Record<ScoreBucket, string> = {
    strong: 'text-blueprint-blue',
    good: 'text-status-orange',
    weak: 'text-text-subtle',
  };

  type FeedInsightItem = {
    label: string;
    value: number;
    icon: string;
    stateLabel: string;
    hint: string;
    severity: 'success' | 'attention' | 'neutral';
  };

  function bucketRange(bucket: ScoreBucketSummary): string {
    if (bucket.max === null) {
      return `${bucket.min}+`;
    }
    return `${bucket.min}-${bucket.max}`;
  }

  function toggleBucket(bucket: ScoreBucket): void {
    onSetScoreBucket?.(selectedScoreBucket === bucket ? null : bucket);
  }

  const insightItems = $derived<FeedInsightItem[]>([
    {
      label: 'Stack forte',
      value: insightSummary.strongStackCount,
      icon: 'layers',
      stateLabel: insightSummary.strongStackCount > 0 ? 'Compétences alignées' : 'Profil à compléter',
      hint:
        insightSummary.strongStackCount > 0
          ? 'Comparer ces missions en premier.'
          : 'Compléter la stack du profil.',
      severity: insightSummary.strongStackCount > 0 ? 'success' : 'neutral',
    },
    {
      label: 'TJM à négocier',
      value: insightSummary.weakTjmCount,
      icon: 'badge-euro',
      stateLabel: insightSummary.weakTjmCount > 0 ? 'Attention marge' : 'Fourchette saine',
      hint:
        insightSummary.weakTjmCount > 0
          ? 'Filtrer ou négocier avant de postuler.'
          : 'Pas de mission sous plancher.',
      severity: insightSummary.weakTjmCount > 0 ? 'attention' : 'success',
    },
    {
      label: 'Remote compatible',
      value: insightSummary.remoteMatchCount,
      icon: 'wifi',
      stateLabel: insightSummary.remoteMatchCount > 0 ? 'Compatible' : 'Aucune mission',
      hint:
        insightSummary.remoteMatchCount > 0
          ? 'Prioriser si le lieu est clé.'
          : 'Vérifier les critères remote.',
      severity: insightSummary.remoteMatchCount > 0 ? 'success' : 'neutral',
    },
    {
      label: 'Analyse locale',
      value: insightSummary.semanticAnalyzedCount,
      icon: 'sparkles',
      stateLabel:
        insightSummary.semanticAnalyzedCount > 0 ? 'Score enrichi' : 'Inactive',
      hint:
        insightSummary.semanticAnalyzedCount > 0
          ? 'Lire les raisons de score.'
          : 'Pulse utilise le score de base.',
      severity: insightSummary.semanticAnalyzedCount > 0 ? 'success' : 'neutral',
    },
  ]);
</script>

<div class="mt-3 border-t border-border-light pt-3">
  <div class="grid grid-cols-4 gap-2" aria-label="Insights actionnables du périmètre courant">
    <button
      type="button"
      class="min-w-0 rounded-lg px-2 py-2 text-left transition-colors {showNewOnly
        ? 'bg-blueprint-blue/8 text-blueprint-blue'
        : 'hover:bg-subtle-gray'}"
      onclick={onToggleNewOnly}
      aria-pressed={showNewOnly}
      title="Filtrer les nouvelles missions"
    >
      <span class="flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-text-muted">
        <Icon name="sparkles" size={11} />
        Nouvelles
      </span>
      <span class="mt-1 block text-lg font-semibold tabular-nums text-text-primary">
        {summary.newCount}
      </span>
    </button>

    <button
      type="button"
      class="min-w-0 rounded-lg px-2 py-2 text-left transition-colors {selectedScoreBucket ===
      'strong'
        ? 'bg-blueprint-blue/8 text-blueprint-blue'
        : 'hover:bg-subtle-gray'}"
      onclick={() => toggleBucket('strong')}
      aria-pressed={selectedScoreBucket === 'strong'}
      title="Filtrer les missions prioritaires"
    >
      <span class="flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-text-muted">
        <Icon name="target" size={11} />
        80+
      </span>
      <span class="mt-1 block text-lg font-semibold tabular-nums text-text-primary">
        {summary.highScoreCount}
      </span>
    </button>

    <button
      type="button"
      class="min-w-0 rounded-lg px-2 py-2 text-left transition-colors hover:bg-subtle-gray"
      onclick={onToggleFavorites}
      title="Filtrer les favoris"
    >
      <span class="flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-text-muted">
        <Icon name="star" size={11} />
        Favoris
      </span>
      <span class="mt-1 block text-lg font-semibold tabular-nums text-text-primary">
        {summary.favoriteCount}
      </span>
    </button>

    <div class="min-w-0 rounded-lg px-2 py-2">
      <span class="flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-text-muted">
        <Icon name={brokenConnectorCount > 0 ? 'circle-alert' : 'shield-check'} size={11} />
        Sources
      </span>
      <span
        class="mt-1 block text-lg font-semibold tabular-nums {brokenConnectorCount > 0
          ? 'text-status-red'
          : 'text-text-primary'}"
      >
        {brokenConnectorCount}
      </span>
    </div>
  </div>

  <div class="mt-3" aria-label="Distribution des missions par score">
    <div class="mb-1.5 flex items-center justify-between gap-3">
      <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
        Score des missions
      </p>
      <p class="text-[10px] text-text-muted">{summary.visibleCount} visibles</p>
    </div>

    {#if hasScoreData}
      <div class="flex h-2 overflow-hidden rounded-full bg-subtle-gray">
        {#each scoreDistribution as bucket}
          {@const width = Math.max(3, Math.round((bucket.count / totalBucketCount) * 100))}
          {#if bucket.count > 0}
            <button
              type="button"
              class="h-full transition-opacity {bucketTone[bucket.bucket]} {selectedScoreBucket &&
              selectedScoreBucket !== bucket.bucket
                ? 'opacity-35'
                : 'opacity-100'}"
              style:width="{width}%"
              onclick={() => toggleBucket(bucket.bucket)}
              aria-label={`${bucket.label}: ${bucket.count} missions, score ${bucketRange(bucket)}`}
              aria-pressed={selectedScoreBucket === bucket.bucket}
              title={`${bucket.label}: ${bucket.count} missions`}
            ></button>
          {/if}
        {/each}
      </div>

      <div class="mt-2 grid grid-cols-3 gap-1.5">
        {#each scoreDistribution as bucket}
          <button
            type="button"
            class="rounded-md px-1.5 py-1 text-left transition-colors {selectedScoreBucket ===
            bucket.bucket
              ? 'bg-blueprint-blue/8'
              : 'hover:bg-subtle-gray'}"
            onclick={() => toggleBucket(bucket.bucket)}
            aria-pressed={selectedScoreBucket === bucket.bucket}
          >
            <span class="block truncate text-[10px] text-text-subtle">{bucket.label}</span>
            <span
              class="mt-0.5 block text-[11px] font-mono font-semibold tabular-nums {bucketTextTone[
                bucket.bucket
              ]}"
            >
              {bucket.count}
              <span class="font-normal text-text-muted"> · {bucketRange(bucket)}</span>
            </span>
          </button>
        {/each}
      </div>
    {:else}
      <div
        class="rounded-lg border border-border-light bg-page-canvas px-3 py-2 text-xs text-text-muted"
      >
        Aucun score disponible avec les filtres actuels.
      </div>
    {/if}
  </div>

  <div
    class="mt-3 grid grid-cols-2 gap-1.5"
    aria-label="Détails du tri avec les filtres actuels"
  >
    {#each insightItems as item}
      <div
        class="rounded-lg border bg-page-canvas px-2 py-1.5 {item.severity === 'attention'
          ? 'border-status-orange/25'
          : item.severity === 'success'
            ? 'border-accent-green/20'
            : 'border-border-light'}"
      >
        <div class="flex items-start justify-between gap-2">
          <span class="min-w-0">
            <span class="flex items-center gap-1 text-[10px] text-text-muted">
              <Icon name={item.icon} size={11} />
              {item.label}
            </span>
            <span class="mt-0.5 block truncate text-[10px] font-medium text-text-primary">
              {item.stateLabel}
            </span>
          </span>
          <span
            class="shrink-0 text-[12px] font-mono font-semibold tabular-nums {item.severity ===
            'attention'
              ? 'text-status-orange'
              : item.severity === 'success'
                ? 'text-accent-green'
                : 'text-text-subtle'}"
          >
            {item.value}
          </span>
        </div>
        <p class="mt-1 min-h-7 text-[10px] leading-4 text-text-subtle">{item.hint}</p>
      </div>
    {/each}
  </div>
</div>
