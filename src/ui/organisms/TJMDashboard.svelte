<script lang="ts">
  import type { TJMAnalysis } from '$lib/core/types/tjm';
  import TrendBadge from '../molecules/TrendBadge.svelte';
  import Skeleton from '../atoms/Skeleton.svelte';
  import Icon from '../atoms/Icon.svelte';

  let { analysis = null, isLoading = false, error = null, userTjmMin = 0, userTjmMax = 0 }: {
    analysis?: TJMAnalysis | null;
    isLoading?: boolean;
    error?: string | null;
    userTjmMin?: number;
    userTjmMax?: number;
  } = $props();

  const levels = [
    { key: 'junior' as const, label: 'Junior' },
    { key: 'confirmed' as const, label: 'Confirmé' },
    { key: 'senior' as const, label: 'Senior' },
  ];

  function medianPercent(range: { min: number; max: number; median: number }): number {
    if (range.max === range.min) return 50;
    return Math.round(((range.median - range.min) / (range.max - range.min)) * 100);
  }

  function userTjmPercent(range: { min: number; max: number }): number | null {
    const mid = (userTjmMin + userTjmMax) / 2;
    if (mid <= 0 || range.max === range.min) return null;
    const pct = ((mid - range.min) / (range.max - range.min)) * 100;
    if (pct < 0 || pct > 100) return null;
    return Math.round(pct);
  }

  let hasUserTjm = $derived(userTjmMin > 0 || userTjmMax > 0);
</script>

<div class="space-y-4">
  {#if isLoading}
    <div class="section-card rounded-[1.5rem] space-y-3 p-4">
      <Skeleton width="50%" height="1.25rem" />
      <Skeleton width="100%" height="3rem" />
      <Skeleton width="100%" height="3rem" />
      <Skeleton width="100%" height="3rem" />
    </div>
  {:else if error}
    <div class="section-card rounded-[1.5rem] flex flex-col items-center py-8 text-center">
      <Icon name="x" size={24} class="text-accent-red mb-2" />
      <p class="text-sm text-text-primary">{error}</p>
    </div>
  {:else if analysis}
    <div class="section-card-strong rounded-[1.75rem] p-4">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-text-primary">Analyse TJM</h3>
        <TrendBadge trend={analysis.trend} />
      </div>
      <div class="mt-4 grid grid-cols-2 gap-2 text-[11px]">
        <div class="rounded-[1.2rem] border border-white/8 bg-white/[0.05] px-3 py-3">
          <p class="uppercase tracking-[0.18em] text-text-muted">Confiance</p>
          <p class="mt-2 text-lg font-semibold text-white">{Math.round(analysis.confidence * 100)}%</p>
        </div>
        <div class="rounded-[1.2rem] border border-white/8 bg-white/[0.05] px-3 py-3">
          <p class="uppercase tracking-[0.18em] text-text-muted">Points</p>
          <p class="mt-2 text-lg font-semibold text-white">{analysis.dataPoints}</p>
        </div>
      </div>
    </div>

    <div class="space-y-3">
      {#each levels as level}
        {@const range = analysis[level.key]}
        {@const mPct = medianPercent(range)}
        {@const uPct = hasUserTjm ? userTjmPercent(range) : null}
        <div class="section-card rounded-[1.5rem] p-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-medium text-text-secondary">{level.label}</p>
              <p class="mt-2 text-2xl font-semibold text-white">{range.median}<span class="ml-1 text-sm font-mono text-accent-blue">€/j</span></p>
            </div>
            <div class="rounded-full border border-accent-blue/18 bg-accent-blue/12 px-3 py-1.5 text-[11px] font-mono text-accent-blue">
              {range.min}–{range.max}
            </div>
          </div>

          <div class="mt-4 flex items-center gap-2 text-[10px] font-mono text-text-muted">
            <span>{range.min}€</span>
            <div class="relative h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <!-- Filled bar up to median -->
              <div
                class="h-full rounded-full bg-gradient-to-r from-accent-blue/50 to-accent-emerald/60"
                style:width="{mPct}%"
              ></div>
              <!-- Median marker -->
              <div
                class="absolute top-[-2px] h-[12px] w-[2px] rounded-full bg-white"
                style:left="{mPct}%"
                title="Médian : {range.median}€"
              ></div>
              <!-- User TJM marker -->
              {#if uPct !== null}
                <div
                  class="absolute top-[-3px] h-[14px] w-[3px] rounded-full bg-accent-amber shadow-glow-amber"
                  style:left="{uPct}%"
                  title="Votre TJM cible"
                ></div>
              {/if}
            </div>
            <span>{range.max}€</span>
          </div>
          {#if uPct !== null}
            <p class="mt-1 text-right text-[9px] text-accent-amber/70">▲ votre cible</p>
          {/if}
        </div>
      {/each}
    </div>

    {#if analysis.trendDetail}
      <div class="section-card rounded-[1.5rem] p-4">
        <p class="text-xs leading-relaxed text-text-secondary">{analysis.trendDetail}</p>
      </div>
    {/if}

    {#if analysis.recommendation}
      <div class="section-card-strong rounded-[1.5rem] p-4">
        <p class="text-[11px] uppercase tracking-[0.2em] text-accent-blue">Recommandation</p>
        <p class="mt-2 text-sm leading-relaxed text-text-secondary">{analysis.recommendation}</p>
      </div>
    {/if}
  {:else}
    <div class="section-card rounded-[1.5rem] flex flex-col items-center py-8 text-center">
      <Icon name="trending-up" size={24} class="text-text-muted mb-2" />
      <p class="text-sm text-text-primary">TJM Intelligence</p>
      <p class="text-xs text-text-secondary mt-1">Lancez un scan pour alimenter les tendances TJM.</p>
    </div>
  {/if}
</div>
