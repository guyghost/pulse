<script lang="ts">
  import type { TJMAnalysis } from '$lib/core/types/tjm';
  import type { SeniorityLevel } from '$lib/core/types/profile';
  import TrendBadge from '../molecules/TrendBadge.svelte';
  import { Skeleton } from '@pulse/ui';
  import { Icon } from '@pulse/ui';

  const {
    analysis = null,
    isLoading = false,
    error = null,
    userSeniority = null,
    userTjmMin = 0,
    userTjmMax = 0,
  }: {
    analysis?: TJMAnalysis | null;
    isLoading?: boolean;
    error?: string | null;
    userSeniority?: SeniorityLevel | null;
    userTjmMin?: number;
    userTjmMax?: number;
  } = $props();

  const levels: Array<{
    key: 'junior' | 'confirmed' | 'senior';
    label: string;
    icon: string;
  }> = [
    { key: 'junior', label: 'Junior', icon: 'zap' },
    { key: 'confirmed', label: 'Confirmé', icon: 'shield' },
    { key: 'senior', label: 'Senior', icon: 'crown' },
  ];

  const selectedMarketRange = $derived(analysis ? analysis[userSeniority ?? 'confirmed'] : null);
  const userTargetMedian = $derived(
    userTjmMin > 0 && userTjmMax > 0 ? Math.round((userTjmMin + userTjmMax) / 2) : null
  );
  const userTargetDelta = $derived(
    selectedMarketRange && userTargetMedian !== null
      ? userTargetMedian - selectedMarketRange.median
      : null
  );
  const confidencePct = $derived(analysis ? Math.round(analysis.confidence * 100) : 0);

  function formatDelta(delta: number): string {
    if (delta === 0) {
      return 'aligné';
    }
    return `${delta > 0 ? '+' : ''}${delta}€`;
  }
</script>

<div class="space-y-4">
  {#if isLoading}
    <div class="section-card rounded-xl p-5 space-y-4">
      <Skeleton width="40%" height="1rem" />
      <Skeleton width="100%" height="4.5rem" />
      <Skeleton width="100%" height="4.5rem" />
      <Skeleton width="100%" height="4.5rem" />
    </div>
  {:else if error}
    <div
      class="section-card rounded-xl flex flex-col items-center justify-center py-12 text-center"
    >
      <div class="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-status-red/10">
        <Icon name="x" size={18} class="text-status-red" />
      </div>
      <p class="text-sm font-medium text-text-primary">Erreur de chargement</p>
      <p class="mt-2 max-w-[250px] text-xs text-text-subtle">{error}</p>
    </div>
  {:else if analysis}
    <!-- Trend overview -->
    <div class="section-card-strong rounded-xl p-5">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-blueprint-blue/8">
            <Icon name="bar-chart-3" size={14} class="text-blueprint-blue" />
          </div>
          <div>
            <p class="text-sm font-medium text-text-primary">Vue d'ensemble</p>
            <p class="text-[10px] text-text-muted">
              {analysis.dataPoints} points · {analysis.topStacks.length} stacks
            </p>
          </div>
        </div>
        <TrendBadge trend={analysis.trend} />
      </div>
      {#if analysis.trendDetail}
        <p class="mt-3 text-xs leading-relaxed text-text-subtle">{analysis.trendDetail}</p>
      {/if}
      <div class="mt-4">
        <div class="mb-1.5 flex items-center justify-between gap-3">
          <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
            Confiance
          </p>
          <p class="text-[10px] font-mono tabular-nums text-text-primary">{confidencePct}%</p>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-subtle-gray">
          <div
            class="h-full rounded-full bg-blueprint-blue transition-all duration-500"
            style:width="{confidencePct}%"
          ></div>
        </div>
        <p class="mt-1.5 text-[10px] leading-snug text-text-muted">
          Basée sur {analysis.dataPoints} point{analysis.dataPoints > 1 ? 's' : ''} de marché consolidé{analysis.dataPoints >
          1
            ? 's'
            : ''}.
        </p>
      </div>
    </div>

    <!-- User positioning -->
    {#if selectedMarketRange && userTargetMedian !== null && userTargetDelta !== null}
      <div class="section-card rounded-xl p-5">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
              Votre positionnement
            </p>
            <p class="mt-1 text-xs leading-relaxed text-text-subtle">
              Cible {userTjmMin}–{userTjmMax}€ face au marché
              {userSeniority
                ? levels.find((level) => level.key === userSeniority)?.label
                : 'Confirmé'}.
            </p>
          </div>
          <div class="text-right">
            <p class="text-xl font-semibold tabular-nums text-text-primary">
              {formatDelta(userTargetDelta)}
            </p>
            <p class="text-[9px] text-text-muted">vs médiane</p>
          </div>
        </div>
        <div class="mt-4 grid grid-cols-3 gap-2 text-center">
          <div class="rounded-lg bg-page-canvas px-2 py-2">
            <p class="text-[9px] uppercase tracking-[0.12em] text-text-muted">Marché bas</p>
            <p class="mt-1 text-xs font-mono text-text-primary">{selectedMarketRange.min}€</p>
          </div>
          <div class="rounded-lg bg-blueprint-blue/6 px-2 py-2">
            <p class="text-[9px] uppercase tracking-[0.12em] text-blueprint-blue">Médiane</p>
            <p class="mt-1 text-xs font-mono text-text-primary">{selectedMarketRange.median}€</p>
          </div>
          <div class="rounded-lg bg-page-canvas px-2 py-2">
            <p class="text-[9px] uppercase tracking-[0.12em] text-text-muted">Marché haut</p>
            <p class="mt-1 text-xs font-mono text-text-primary">{selectedMarketRange.max}€</p>
          </div>
        </div>
      </div>
    {/if}

    <!-- Level cards -->
    <div class="space-y-3">
      {#each levels as level}
        {@const range = analysis[level.key]}
        <div
          class="section-card rounded-xl overflow-hidden {userSeniority === level.key
            ? 'ring-2 ring-blueprint-blue/15'
            : ''}"
        >
          <div class="h-[2px] bg-blueprint-blue/20"></div>
          <div class="p-5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div
                  class="flex h-8 w-8 items-center justify-center rounded-lg bg-blueprint-blue/8"
                >
                  <Icon name={level.icon} size={14} class="text-blueprint-blue" />
                </div>
                <div>
                  <p class="text-xs font-medium text-text-primary">{level.label}</p>
                  <p class="text-[10px] font-mono text-text-muted">{range.min}–{range.max}€</p>
                </div>
              </div>
              <div class="text-right">
                <p class="text-xl font-semibold tabular-nums text-text-primary">
                  {range.median}<span class="ml-0.5 text-sm font-normal text-text-muted">€</span>
                </p>
                <p class="text-[9px] text-text-muted">/jour</p>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Top stacks -->
    {#if analysis.topStacks.length > 0}
      <div class="section-card rounded-xl p-5">
        <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted mb-4">
          Stacks suivies
        </p>
        <div class="space-y-3">
          {#each analysis.topStacks as stack}
            {@const maxAverage = Math.max(...analysis.topStacks.map((item) => item.average), 1)}
            {@const barWidth = Math.max(8, Math.round((stack.average / maxAverage) * 100))}
            <div>
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-xs font-medium capitalize text-text-primary">
                    {stack.stack}
                  </p>
                  <p class="text-[10px] text-text-muted">
                    {stack.sampleCount} point{stack.sampleCount > 1 ? 's' : ''}
                  </p>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <TrendBadge trend={stack.trend} />
                  <span class="text-[11px] font-mono tabular-nums text-text-primary"
                    >{stack.average}€</span
                  >
                </div>
              </div>
              <div class="mt-1.5 h-1.5 rounded-full bg-subtle-gray">
                <div
                  class="h-full rounded-full bg-blueprint-blue/45 transition-all duration-500"
                  style:width="{barWidth}%"
                ></div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Region insights -->
    {#if analysis.regionInsights && analysis.regionInsights.length > 0}
      <div class="section-card rounded-xl p-5">
        <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted mb-4">
          TJM par région
        </p>
        <div class="space-y-3">
          {#each analysis.regionInsights.slice(0, 8) as region}
            {@const barWidth = Math.max(
              15,
              Math.round((region.average / (analysis.regionInsights[0]?.average || 1)) * 100)
            )}
            <div>
              <div class="flex items-center justify-between">
                <span class="truncate text-xs text-text-primary">{region.label}</span>
                <div class="flex shrink-0 items-center gap-2 pl-3">
                  <span class="text-[10px] font-mono text-text-muted"
                    >{region.min}–{region.max}€</span
                  >
                  <span
                    class="text-[11px] font-mono tabular-nums {region.trend === 'up'
                      ? 'text-blueprint-blue'
                      : region.trend === 'down'
                        ? 'text-status-red'
                        : 'text-text-subtle'}">{region.average}€</span
                  >
                </div>
              </div>
              <div class="mt-1.5 h-1.5 rounded-full bg-subtle-gray">
                <div
                  class="h-full rounded-full transition-all duration-500
                    {region.trend === 'up'
                    ? 'bg-blueprint-blue/40'
                    : region.trend === 'down'
                      ? 'bg-status-red/30'
                      : 'bg-text-muted/20'}"
                  style:width="{barWidth}%"
                ></div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Recommendation -->
    {#if analysis.recommendation}
      <div class="section-card-strong rounded-xl p-5">
        <div class="flex items-start gap-3">
          <div
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blueprint-blue/8"
          >
            <Icon name="lightbulb" size={14} class="text-blueprint-blue" />
          </div>
          <div>
            <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-blueprint-blue">
              Recommandation
            </p>
            <p class="mt-1.5 text-xs leading-relaxed text-text-subtle">{analysis.recommendation}</p>
          </div>
        </div>
      </div>
    {/if}
  {:else}
    <!-- Empty state -->
    <div
      class="section-card rounded-xl flex flex-col items-center justify-center py-16 text-center"
    >
      <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-subtle-gray">
        <Icon name="bar-chart-3" size={20} class="text-text-muted" />
      </div>
      <p class="text-sm font-medium text-text-primary">Aucune donnée TJM</p>
      <p class="mt-2 max-w-[220px] text-xs text-text-subtle">
        Lancez un scan depuis l'onglet Feed pour alimenter les tendances.
      </p>
    </div>
  {/if}
</div>
