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
  }: {
    analysis?: TJMAnalysis | null;
    isLoading?: boolean;
    error?: string | null;
    userSeniority?: SeniorityLevel | null;
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
    <div class="section-card rounded-xl flex flex-col items-center justify-center py-12 text-center">
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
            <p class="text-[10px] text-text-muted">{analysis.dataPoints} points · {analysis.topStacks.length} stacks</p>
          </div>
        </div>
        <TrendBadge trend={analysis.trend} />
      </div>
      {#if analysis.trendDetail}
        <p class="mt-3 text-xs leading-relaxed text-text-subtle">{analysis.trendDetail}</p>
      {/if}
    </div>

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
                <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-blueprint-blue/8">
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
                  <span class="text-[10px] font-mono text-text-muted">{region.min}–{region.max}€</span>
                  <span
                    class="text-[11px] font-mono tabular-nums {region.trend === 'up'
                      ? 'text-blueprint-blue'
                      : region.trend === 'down'
                        ? 'text-status-red'
                        : 'text-text-subtle'}"
                  >{region.average}€</span>
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
          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blueprint-blue/8">
            <Icon name="lightbulb" size={14} class="text-blueprint-blue" />
          </div>
          <div>
            <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-blueprint-blue">Recommandation</p>
            <p class="mt-1.5 text-xs leading-relaxed text-text-subtle">{analysis.recommendation}</p>
          </div>
        </div>
      </div>
    {/if}
  {:else}
    <!-- Empty state -->
    <div class="section-card rounded-xl flex flex-col items-center justify-center py-16 text-center">
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
