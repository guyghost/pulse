<script lang="ts">
  import type { TJMAnalysis } from '$lib/core/types/tjm';
  import type { SeniorityLevel } from '$lib/core/types/profile';
  import TrendBadge from '../molecules/TrendBadge.svelte';
  import Skeleton from '../atoms/Skeleton.svelte';
  import Icon from '../atoms/Icon.svelte';

  let {
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
    gradient: string;
    accentText: string;
    accentBg: string;
    accentBorder: string;
  }> = [
    {
      key: 'junior',
      label: 'Junior',
      icon: 'zap',
      gradient: 'from-accent-blue/40 to-accent-blue/15',
      accentText: 'text-accent-blue',
      accentBg: 'bg-accent-blue/12',
      accentBorder: 'border-accent-blue/20',
    },
    {
      key: 'confirmed',
      label: 'Confirmé',
      icon: 'shield',
      gradient: 'from-accent-emerald/40 to-accent-emerald/15',
      accentText: 'text-accent-emerald',
      accentBg: 'bg-accent-emerald/12',
      accentBorder: 'border-accent-emerald/20',
    },
    {
      key: 'senior',
      label: 'Senior',
      icon: 'crown',
      gradient: 'from-accent-amber/40 to-accent-amber/15',
      accentText: 'text-accent-amber',
      accentBg: 'bg-accent-amber/12',
      accentBorder: 'border-accent-amber/20',
    },
  ];


</script>

<div class="space-y-4">
  {#if isLoading}
    <div class="section-card rounded-[1.5rem] space-y-3 p-4">
      <Skeleton width="50%" height="1.25rem" />
      <Skeleton width="100%" height="5rem" />
      <Skeleton width="100%" height="5rem" />
      <Skeleton width="100%" height="5rem" />
    </div>
  {:else if error}
    <div
      class="section-card rounded-[1.75rem] flex flex-col items-center justify-center py-12 text-center"
    >
      <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-red/12">
        <Icon name="x" size={20} class="text-accent-red" />
      </div>
      <p class="text-sm font-semibold text-text-primary">Erreur de chargement</p>
      <p class="mt-2 max-w-[250px] text-xs leading-relaxed text-text-secondary">{error}</p>
    </div>
  {:else if analysis}
    <!-- Trend overview card -->
    <div class="section-card-strong rounded-[1.75rem] p-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-blue/12">
            <Icon name="bar-chart-3" size={16} class="text-accent-blue" />
          </div>
          <div>
            <p class="text-sm font-semibold text-text-primary">Vue d'ensemble</p>
            <p class="text-[11px] text-text-muted">
              {analysis.dataPoints} points · {analysis.topStacks.length} stacks
            </p>
          </div>
        </div>
        <TrendBadge trend={analysis.trend} />
      </div>

      {#if analysis.trendDetail}
        <p class="mt-3 text-xs leading-relaxed text-text-secondary">{analysis.trendDetail}</p>
      {/if}
    </div>

    <!-- Level cards -->
    <div class="space-y-3">
      {#each levels as level}
        {@const range = analysis[level.key]}
        <div
          class="section-card rounded-[1.5rem] overflow-hidden {userSeniority === level.key
            ? 'ring-2 ring-white/20'
            : ''}"
        >
          <!-- Color accent top strip -->
          <div class="h-[3px] bg-gradient-to-r {level.gradient}"></div>
          <div class="px-4 py-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <div class="flex h-8 w-8 items-center justify-center rounded-lg {level.accentBg}">
                  <Icon name={level.icon} size={14} class={level.accentText} />
                </div>
                <p class="text-xs font-semibold uppercase tracking-[0.12em] text-text-secondary">
                  {level.label}
                </p>
              </div>
              <div class="flex items-baseline gap-3">
                <span class="text-[10px] font-mono text-text-muted">{range.min}–{range.max}€</span>
                <p class="text-2xl font-bold tabular-nums text-white">
                  {range.median}<span class="ml-0.5 text-xs font-normal {level.accentText}">€</span>
                  <span class="text-[10px] font-mono text-text-muted">/jour</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Top stacks -->
    {#if analysis.topStacks.length > 0}
      <div class="section-card rounded-[1.5rem] p-4">
        <p class="text-[11px] font-semibold uppercase tracking-[0.15em] text-text-muted mb-3">
          Stacks suivies
        </p>
        <div class="space-y-2">
          {#each analysis.topStacks as stack}
            {@const barWidth = Math.max(
              15,
              Math.round((stack.average / (analysis.topStacks[0]?.average || 1)) * 100)
            )}
            <div class="flex items-center gap-3">
              <span class="w-20 truncate text-xs font-medium text-text-primary">{stack.stack}</span>
              <div class="relative h-1.5 flex-1 rounded-full bg-white/[0.06]">
                <div
                  class="h-full rounded-full transition-all duration-500
                    {stack.trend === 'up'
                    ? 'bg-accent-emerald/50'
                    : stack.trend === 'down'
                      ? 'bg-accent-red/40'
                      : 'bg-white/20'}"
                  style:width="{barWidth}%"
                ></div>
              </div>
              <span
                class="w-14 text-right text-[11px] font-mono tabular-nums {stack.trend === 'up'
                  ? 'text-accent-emerald'
                  : stack.trend === 'down'
                    ? 'text-accent-red'
                    : 'text-text-secondary'}"
              >
                {stack.average}€
              </span>
              <Icon
                name={stack.trend === 'up'
                  ? 'trending-up'
                  : stack.trend === 'down'
                    ? 'trending-down'
                    : 'minus'}
                size={10}
                class={stack.trend === 'up'
                  ? 'text-accent-emerald'
                  : stack.trend === 'down'
                    ? 'text-accent-red'
                    : 'text-text-muted'}
              />
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Recommendation -->
    {#if analysis.recommendation}
      <div class="section-card-strong rounded-[1.5rem] p-4">
        <div class="flex items-start gap-3">
          <div
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-blue/12"
          >
            <Icon name="lightbulb" size={14} class="text-accent-blue" />
          </div>
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent-blue">
              Recommandation
            </p>
            <p class="mt-1.5 text-xs leading-relaxed text-text-secondary">
              {analysis.recommendation}
            </p>
          </div>
        </div>
      </div>
    {/if}
  {:else}
    <!-- Empty state -->
    <div
      class="section-card rounded-[1.75rem] flex flex-col items-center justify-center py-16 text-center"
    >
      <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.05]">
        <Icon name="bar-chart-3" size={24} class="text-text-muted" />
      </div>
      <p class="text-sm font-semibold text-text-primary">Aucune donnée TJM</p>
      <p class="mt-2 max-w-[220px] text-xs leading-relaxed text-text-secondary">
        Lancez un scan depuis l'onglet Feed pour alimenter les tendances.
      </p>
    </div>
  {/if}
</div>
