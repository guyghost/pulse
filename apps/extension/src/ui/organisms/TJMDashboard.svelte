<script lang="ts">
  import type { TJMAnalysis } from '$lib/core/types/tjm';
  import type { SeniorityLevel } from '$lib/core/types/profile';
  import TrendBadge from '../molecules/TrendBadge.svelte';
  import { Skeleton } from '@pulse/ui';
  import { Icon, type IconName } from '@pulse/ui';
  import OperationalStoryCard, {
    type OperationalEvidence,
  } from '../molecules/OperationalStoryCard.svelte';
  import OperationalEmptyState from '../molecules/OperationalEmptyState.svelte';

  type TjmSetupStep = {
    title: string;
    description: string;
    icon: IconName;
    actionLabel: string;
    action?: () => void;
  };

  const {
    analysis = null,
    isLoading = false,
    error = null,
    userSeniority = null,
    userTjmMin = 0,
    userTjmMax = 0,
    onRetry,
    onOpenProfile,
    onOpenFeed,
  }: {
    analysis?: TJMAnalysis | null;
    isLoading?: boolean;
    error?: string | null;
    userSeniority?: SeniorityLevel | null;
    userTjmMin?: number;
    userTjmMax?: number;
    onRetry?: () => void;
    onOpenProfile?: () => void;
    onOpenFeed?: () => void;
  } = $props();

  const levels: Array<{
    key: 'junior' | 'confirmed' | 'senior';
    label: string;
    icon: IconName;
  }> = [
    { key: 'junior', label: 'Junior', icon: 'zap' },
    { key: 'confirmed', label: 'Confirmé', icon: 'shield' },
    { key: 'senior', label: 'Senior', icon: 'crown' },
  ];

  const selectedMarketRange = $derived(analysis ? analysis[userSeniority ?? 'confirmed'] : null);
  // An inverted target (min > max, both defined) is incoherent: do not derive a
  // median/delta from it, otherwise the dashboard would display a misleading
  // positioning and écart. Surfaced as an explicit validation state instead.
  const isTargetInverted = $derived(userTjmMin > 0 && userTjmMax > 0 && userTjmMin > userTjmMax);
  const userTargetMedian = $derived(
    userTjmMin > 0 && userTjmMax > 0 && !isTargetInverted
      ? Math.round((userTjmMin + userTjmMax) / 2)
      : null
  );
  const userTargetDelta = $derived(
    selectedMarketRange && userTargetMedian !== null
      ? userTargetMedian - selectedMarketRange.median
      : null
  );
  const confidencePct = $derived(analysis ? Math.round(analysis.confidence * 100) : 0);
  const hasTjmTarget = $derived(userTjmMin > 0 && userTjmMax > 0 && !isTargetInverted);
  // Positioning geometry: projects the market range and the user target onto a
  // shared 0–100 scale so both bars stay comparable in one glance.
  const positioning = $derived.by(() => {
    if (!selectedMarketRange || userTargetMedian === null) {
      return null;
    }
    const market = selectedMarketRange;
    const lo = Math.min(market.min, userTjmMin);
    const hi = Math.max(market.max, userTjmMax);
    const pad = Math.max(40, Math.round((hi - lo) * 0.08));
    const scaleMin = lo - pad;
    const scaleMax = hi + pad;
    const span = scaleMax - scaleMin || 1;
    const pct = (value: number) => Math.max(0, Math.min(100, ((value - scaleMin) / span) * 100));
    return {
      marketLeft: pct(market.min),
      marketWidth: Math.max(3, pct(market.max) - pct(market.min)),
      medianLeft: pct(market.median),
      userLeft: pct(userTjmMin),
      userWidth: Math.max(3, pct(userTjmMax) - pct(userTjmMin)),
      marketMedian: market.median,
    };
  });
  const tjmSetupSteps = $derived.by<TjmSetupStep[]>(() => [
    {
      title: 'Scanner le feed',
      description: 'Collecter des missions avec TJM pour créer les premiers points de marché.',
      icon: 'briefcase',
      actionLabel: 'Ouvrir le feed',
      action: onOpenFeed,
    },
    {
      title: 'Ajuster mon TJM cible',
      description: hasTjmTarget
        ? 'Votre fourchette existe déjà; vérifiez qu’elle correspond à votre prochaine négociation.'
        : 'Définir une fourchette min/max pour comparer votre cible au marché observé.',
      icon: 'badge-euro',
      actionLabel: 'Ouvrir le profil',
      action: onOpenProfile,
    },
    {
      title: 'Relancer l’analyse',
      description: 'Transformer les missions stockées et votre fourchette en recommandation TJM.',
      icon: 'refresh-cw',
      actionLabel: 'Réessayer',
      action: onRetry,
    },
  ]);

  function formatDelta(delta: number): string {
    if (delta === 0) {
      return 'aligné';
    }
    return `${delta > 0 ? '+' : ''}${delta}€`;
  }

  const pricingStory = $derived.by(() => {
    if (!analysis) {
      return null;
    }

    const evidence: OperationalEvidence[] = [
      {
        label: 'Confiance',
        value: `${confidencePct}%`,
        icon: 'shield',
        severity: confidencePct >= 70 ? 'success' : confidencePct >= 45 ? 'attention' : 'incident',
      },
      {
        label: 'Missions analysées',
        value: analysis.dataPoints,
        icon: 'database',
        severity: analysis.dataPoints >= 20 ? 'success' : 'attention',
      },
      {
        label: 'Ecart',
        value: isTargetInverted
          ? 'Invalide'
          : userTargetDelta === null
            ? 'A calibrer'
            : formatDelta(userTargetDelta),
        icon: 'badge-euro',
        severity: isTargetInverted
          ? 'incident'
          : userTargetDelta === null
            ? 'attention'
            : Math.abs(userTargetDelta) <= 50
              ? 'success'
              : userTargetDelta > 0
                ? 'attention'
                : 'incident',
      },
    ];

    if (isTargetInverted) {
      return {
        severity: 'incident' as const,
        statusLabel: 'Fourchette invalide',
        title: 'Votre fourchette TJM est inversée',
        description: `Le minimum (${userTjmMin}€) est supérieur au maximum (${userTjmMax}€). Corrigez votre fourchette dans le profil pour obtenir un positionnement fiable.`,
        evidence,
      };
    }

    if (userTargetDelta === null || selectedMarketRange === null) {
      return {
        severity: 'attention' as const,
        statusLabel: 'Profil incomplet',
        title: 'Le positionnement TJM ne peut pas encore être décidé',
        description:
          'Ajoutez une fourchette TJM et une séniorité dans le profil pour comparer votre position au marché.',
        evidence,
      };
    }

    if (confidencePct < 45) {
      return {
        severity: 'incident' as const,
        statusLabel: 'Confiance faible',
        title: 'Le marché observé est encore trop peu fiable pour changer votre TJM',
        description:
          'Gardez votre fourchette actuelle et scannez plus de missions avant de négocier sur cette base.',
        evidence,
      };
    }

    if (userTargetDelta > 80) {
      return {
        severity: 'attention' as const,
        statusLabel: 'À justifier',
        title: `Votre cible est ${formatDelta(userTargetDelta)} au-dessus de la médiane`,
        description:
          'Acceptez ce niveau seulement si la mission coche fortement stack, remote et contexte client. Sinon, préparez une marge de négociation.',
        evidence,
      };
    }

    if (userTargetDelta < -80) {
      return {
        severity: 'incident' as const,
        statusLabel: 'Sous-positionné',
        title: `Votre cible est ${formatDelta(userTargetDelta)} sous la médiane`,
        description:
          'L’analyse indique une marge de rehausse. La prochaine action est de relever la fourchette ou de filtrer les missions trop basses.',
        evidence,
      };
    }

    return {
      severity: 'success' as const,
      statusLabel: 'Aligné',
      title: 'Votre TJM est cohérent avec le marché observé',
      description:
        analysis.recommendation ??
        'Conservez la fourchette actuelle et utilisez les écarts par stack ou région pour arbitrer mission par mission.',
      evidence,
    };
  });
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
    <OperationalEmptyState
      title="L’analyse TJM ne peut pas être calculée"
      description={error}
      severity="critical"
      statusLabel="Incident"
      icon="triangle-alert"
      proofLabel="Analyse"
      proofValue="Indisponible"
      primaryActionLabel="Réessayer"
      primaryActionIcon="refresh-cw"
      onPrimaryAction={onRetry}
    />
  {:else if analysis}
    {#if pricingStory}
      <OperationalStoryCard
        eyebrow="Décision tarifaire"
        title={pricingStory.title}
        description={pricingStory.description}
        severity={pricingStory.severity}
        statusLabel={pricingStory.statusLabel}
        evidence={pricingStory.evidence}
      />
    {/if}

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
              {analysis.dataPoints} missions · {analysis.topStacks.length} stacks
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
      </div>
    </div>

    <!-- User positioning -->
    {#if positioning && userTargetDelta !== null}
      <div class="section-card rounded-xl p-5">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
              Votre positionnement
            </p>
            <p class="mt-1 text-xs leading-relaxed text-text-subtle">
              Cible {userTjmMin}–{userTjmMax}€ ·
              {userSeniority
                ? levels.find((level) => level.key === userSeniority)?.label
                : 'Confirmé'}
            </p>
          </div>
          <div class="text-right">
            <p class="text-xl font-semibold tabular-nums text-text-primary">
              {formatDelta(userTargetDelta)}
            </p>
            <p class="text-[10px] text-text-muted">vs médiane</p>
          </div>
        </div>

        <div class="mt-5 space-y-2.5">
          <div class="flex items-center gap-3">
            <span class="w-16 shrink-0 text-[10px] text-text-muted">Marché</span>
            <div class="relative h-2 flex-1 rounded-full bg-subtle-gray">
              <div
                class="absolute inset-y-0 rounded-full bg-text-muted/35 transition-all duration-500"
                style:left="{positioning.marketLeft}%"
                style:width="{positioning.marketWidth}%"
              ></div>
              <div
                class="absolute top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded-full bg-text-primary transition-all duration-500"
                style:left="{positioning.medianLeft}%"
                title="Médiane marché"
              ></div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <span class="w-16 shrink-0 text-[10px] text-text-muted">Votre cible</span>
            <div class="relative h-2 flex-1 rounded-full bg-subtle-gray">
              <div
                class="absolute inset-y-0 rounded-full bg-blueprint-blue transition-all duration-500"
                style:left="{positioning.userLeft}%"
                style:width="{positioning.userWidth}%"
              ></div>
            </div>
          </div>
        </div>

        <div class="mt-2 flex items-center gap-3">
          <span class="w-16 shrink-0"></span>
          <p class="flex-1 text-[10px] leading-relaxed text-text-muted">
            Trait plein : médiane marché
            <span class="font-mono tabular-nums text-text-subtle"
              >{positioning.marketMedian}€/j</span
            >.
          </p>
        </div>
      </div>
    {/if}

    <!-- Level cards -->
    <div class="space-y-3">
      {#each levels as level (level)}
        {@const range = analysis[level.key]}
        {@const isSelected = userSeniority === level.key}
        <div
          class="section-card rounded-xl p-5 transition-shadow {isSelected
            ? 'ring-2 ring-blueprint-blue/30'
            : ''}"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div
                class="flex h-8 w-8 items-center justify-center rounded-lg {isSelected
                  ? 'bg-blueprint-blue/15'
                  : 'bg-blueprint-blue/8'}"
              >
                <Icon name={level.icon} size={14} class="text-blueprint-blue" />
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <p class="text-xs font-medium text-text-primary">{level.label}</p>
                  {#if isSelected}
                    <span
                      class="rounded-full bg-blueprint-blue/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-blueprint-blue"
                    >
                      Vous
                    </span>
                  {/if}
                </div>
                <p class="text-[10px] font-mono text-text-muted">{range.min}–{range.max}€</p>
              </div>
            </div>
            <div class="text-right">
              <p class="text-xl font-semibold tabular-nums text-text-primary">
                {range.median}<span class="ml-0.5 text-sm font-normal text-text-muted">€</span>
              </p>
              <p class="text-[10px] text-text-muted">/jour</p>
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
          {#each analysis.topStacks as stack, i (i)}
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
      <section class="section-card rounded-xl p-5" aria-label="TJM par région">
        <h3 class="mb-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
          TJM par région
        </h3>
        <ul class="space-y-3" aria-label="Régions analysées">
          {#each analysis.regionInsights.slice(0, 8) as region, i (i)}
            {@const barWidth = Math.max(
              15,
              Math.round((region.average / (analysis.regionInsights[0]?.average || 1)) * 100)
            )}
            <li>
              <div class="flex items-center justify-between">
                <h4 class="truncate text-xs text-text-primary">{region.label}</h4>
                <div class="flex shrink-0 items-center gap-2 pl-3">
                  <span class="text-[10px] font-mono text-text-muted"
                    >{region.min}–{region.max}€</span
                  >
                  <span class="text-[11px] font-mono tabular-nums text-text-primary"
                    >{region.average}€</span
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
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {:else}
    <div class="space-y-3">
      <OperationalEmptyState
        title="Aucune tendance TJM exploitable"
        description="Le marché ne contient pas encore assez de missions stockées pour produire une décision tarifaire. Suivez les étapes ci-dessous avant de relancer l’analyse."
        severity="attention"
        statusLabel="Données absentes"
        icon="bar-chart-3"
        proofLabel="Missions analysées"
        proofValue="0"
        primaryActionLabel="Réessayer l’analyse"
        primaryActionIcon="refresh-cw"
        onPrimaryAction={onRetry}
      />

      <section
        class="section-card rounded-xl p-5"
        aria-label="3 étapes pour alimenter le radar TJM"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="eyebrow text-blueprint-blue">3 étapes</p>
            <h3 class="mt-1 text-sm font-semibold text-text-primary">Alimenter le radar TJM</h3>
            <p class="mt-1 text-xs leading-5 text-text-subtle">
              L’analyse devient utile quand les missions scannées et votre fourchette cible se
              répondent.
            </p>
          </div>
          <Icon name="badge-euro" size={16} class="mt-1 shrink-0 text-blueprint-blue" />
        </div>

        <div class="mt-4 space-y-2">
          {#each tjmSetupSteps as step, index (index)}
            <button
              type="button"
              class="group flex w-full items-start gap-3 rounded-lg border border-border-light bg-page-canvas px-3 py-2.5 text-left transition-colors hover:border-blueprint-blue/20 hover:bg-surface-white disabled:cursor-not-allowed disabled:opacity-60"
              onclick={step.action}
              disabled={!step.action}
            >
              <span
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-white text-blueprint-blue"
              >
                <Icon name={step.icon} size={14} />
              </span>
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-2">
                  <span class="font-mono text-[10px] text-text-muted">{index + 1}</span>
                  <span class="text-xs font-semibold text-text-primary">{step.title}</span>
                </span>
                <span class="mt-0.5 block text-[11px] leading-4 text-text-subtle">
                  {step.description}
                </span>
              </span>
              <span class="mt-1.5 flex shrink-0 items-center gap-1 text-[10px] text-text-muted">
                {step.actionLabel}
                <Icon
                  name="chevron-right"
                  size={12}
                  class="transition-colors group-hover:text-blueprint-blue"
                />
              </span>
            </button>
          {/each}
        </div>
      </section>
    </div>
  {/if}
</div>
