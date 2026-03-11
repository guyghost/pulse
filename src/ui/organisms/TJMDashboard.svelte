<script lang="ts">
  import type { TJMAnalysis } from '$lib/core/types/tjm';
  import TrendBadge from '../molecules/TrendBadge.svelte';
  import Skeleton from '../atoms/Skeleton.svelte';
  import Icon from '../atoms/Icon.svelte';

  let { analysis = null, isLoading = false, error = null }: {
    analysis?: TJMAnalysis | null;
    isLoading?: boolean;
    error?: string | null;
  } = $props();

  const levels = [
    { key: 'junior' as const, label: 'Junior' },
    { key: 'confirmed' as const, label: 'Confirm\u00e9' },
    { key: 'senior' as const, label: 'Senior' },
  ];
</script>

<div class="space-y-4">
  {#if isLoading}
    <div class="space-y-3">
      <Skeleton width="50%" height="1.25rem" />
      <Skeleton width="100%" height="3rem" />
      <Skeleton width="100%" height="3rem" />
      <Skeleton width="100%" height="3rem" />
    </div>
  {:else if error}
    <div class="flex flex-col items-center py-6 text-center">
      <Icon name="x" size={24} class="text-accent-red mb-2" />
      <p class="text-sm text-text-primary">{error}</p>
    </div>
  {:else if analysis}
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-text-primary">Analyse TJM</h3>
      <TrendBadge trend={analysis.trend} />
    </div>

    <div class="space-y-2">
      {#each levels as level}
        {@const range = analysis[level.key]}
        <div class="bg-surface rounded-lg p-3">
          <div class="flex justify-between items-center mb-1">
            <span class="text-xs font-medium text-text-secondary">{level.label}</span>
            <span class="text-xs font-mono text-accent-blue">{range.median}\u20AC/j</span>
          </div>
          <div class="flex items-center gap-2 text-[10px] text-text-muted font-mono">
            <span>{range.min}\u20AC</span>
            <div class="flex-1 h-1.5 bg-navy-700 rounded-full overflow-hidden">
              <div class="h-full bg-accent-blue/40 rounded-full" style:width="100%"></div>
            </div>
            <span>{range.max}\u20AC</span>
          </div>
        </div>
      {/each}
    </div>

    {#if analysis.trendDetail}
      <div class="bg-surface rounded-lg p-3">
        <p class="text-xs text-text-secondary">{analysis.trendDetail}</p>
      </div>
    {/if}

    {#if analysis.recommendation}
      <div class="bg-accent-blue/10 border border-accent-blue/20 rounded-lg p-3">
        <p class="text-xs font-medium text-accent-blue mb-1">Recommandation</p>
        <p class="text-xs text-text-secondary">{analysis.recommendation}</p>
      </div>
    {/if}

    <div class="flex items-center justify-between text-[10px] text-text-muted">
      <span>Confiance : {Math.round(analysis.confidence * 100)}%</span>
      <span>{analysis.dataPoints} donn\u00e9es</span>
    </div>
  {:else}
    <div class="flex flex-col items-center py-6 text-center">
      <Icon name="trending-up" size={24} class="text-text-muted mb-2" />
      <p class="text-sm text-text-primary">TJM Intelligence</p>
      <p class="text-xs text-text-secondary mt-1">Lancez une analyse pour voir les tendances TJM</p>
    </div>
  {/if}
</div>
