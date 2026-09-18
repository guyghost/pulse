<script lang="ts">
  /**
   * "Time to review" card — organism (see src/models/time-to-review.model.md).
   * Badge header + legend, p50/p95/unviewed KPIs with deltas, inline
   * dependency-free SVG chart (p50 area, p95 line, circled end point),
   * empty state until any review is journaled.
   */
  import { Icon } from '@pulse/ui';
  import TimeToReviewKpi from '../molecules/TimeToReviewKpi.svelte';
  import { createTimeToReviewStore } from '../../lib/state/time-to-review.svelte';
  import type { TimeToReviewSeriesPoint } from '../../lib/core/metrics/time-to-review';

  const store = createTimeToReviewStore();

  $effect(() => {
    void store.load();
  });

  const Y_MAX_HOURS = 48;
  const Y_TICKS = [0, 12, 24, 48] as const;

  /** Clamps values to the chart's 0–48 h scale. */
  function clampToScale(hours: number): number {
    return Math.min(Math.max(hours, 0), Y_MAX_HOURS);
  }

  function xPercent(index: number, total: number): number {
    return total <= 1 ? 0 : (index / (total - 1)) * 100;
  }

  function yPercent(hours: number): number {
    return (1 - clampToScale(hours) / Y_MAX_HOURS) * 100;
  }

  /** Splits the series into segments of consecutive non-null values. */
  function nonNullSegments(values: TimeToReviewSeriesPoint[]): number[][] {
    const segments: number[][] = [];
    let current: number[] = [];
    values.forEach((point, index) => {
      if (point.p50 === null) {
        if (current.length > 0) {
          segments.push(current);
          current = [];
        }
        return;
      }
      current.push(index);
    });
    if (current.length > 0) {
      segments.push(current);
    }
    return segments;
  }

  function areaPath(values: TimeToReviewSeriesPoint[], indices: number[]): string {
    const total = values.length;
    const points = indices.map((index) => {
      const value = values[index].p50;
      const x = xPercent(index, total);
      const y = yPercent(value ?? 0);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    const firstX = xPercent(indices[0], total).toFixed(2);
    const lastX = xPercent(indices[indices.length - 1], total).toFixed(2);
    return `M ${firstX},100 L ${points.join(' L ')} L ${lastX},100 Z`;
  }

  function linePoints(values: TimeToReviewSeriesPoint[], indices: number[]): string {
    const total = values.length;
    return indices
      .map((index) => {
        const x = xPercent(index, total).toFixed(2);
        const y = yPercent(values[index].p50 ?? 0).toFixed(2);
        return `${x},${y}`;
      })
      .join(' ');
  }

  function p95PolylinePoints(values: TimeToReviewSeriesPoint[]): string {
    return linePoints(values, nonNullSegments(values).flat());
  }

  function lastNonNullP50(values: TimeToReviewSeriesPoint[]): { x: number; y: number } | null {
    for (let index = values.length - 1; index >= 0; index -= 1) {
      const value = values[index].p50;
      if (value !== null) {
        return { x: xPercent(index, values.length), y: yPercent(value) };
      }
    }
    return null;
  }

  function formatHours(value: number): string {
    return value >= 10 ? `${Math.round(value)}` : value.toFixed(1);
  }

  function formatHoursDelta(delta: number): string {
    const sign = delta < 0 ? '\u2212' : '+';
    return `${sign}${formatHours(Math.abs(delta))} h`;
  }

  function formatPercent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  function formatPointsDelta(delta: number): string {
    const sign = delta < 0 ? '\u2212' : '+';
    return `${sign}${Math.round(Math.abs(delta) * 100)} pt`;
  }

  function formatDay(day: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${day}T00:00:00Z`));
  }

  const stats = $derived(store.stats);
  const series = $derived(stats?.series ?? []);
  const endDot = $derived(series.length > 0 ? lastNonNullP50(series) : null);
  const p50Segments = $derived(nonNullSegments(series));
  const p95Points = $derived(series.length > 0 ? p95PolylinePoints(series) : '');
  const ariaLabel = $derived.by(() => {
    if (!stats || !stats.hasData) {
      return 'Time to review : pas encore de statistiques de consultation.';
    }
    const p50 = stats.p50.value === null ? 'n/d' : `${formatHours(stats.p50.value)} h`;
    const p95 = stats.p95.value === null ? 'n/d' : `${formatHours(stats.p95.value)} h`;
    const unviewed = stats.unviewed.value === null ? 'n/d' : formatPercent(stats.unviewed.value);
    return `Time to review : délai médian ${p50}, 95e percentile ${p95}, ${unviewed} de missions non vues, sur 30 jours.`;
  });
</script>

<section
  class="mt-4 rounded-xl border border-border-light bg-surface-white p-4"
  aria-label="Time to review"
>
  <div class="flex items-start justify-between gap-2">
    <div class="flex items-center gap-2.5">
      <span class="flex h-7 w-7 items-center justify-center rounded-full bg-subtle-gray">
        <Icon name="activity" size={14} class="text-text-secondary" />
      </span>
      <div>
        <p class="text-[13px] leading-tight font-medium text-text-primary">Time to review</p>
        <p class="mt-0.5 text-caption text-text-muted">
          Heures entre capture et première consultation · 30 jours
        </p>
      </div>
    </div>
    <div class="flex shrink-0 items-center gap-3 pt-0.5">
      <span class="flex items-center gap-1 text-micro text-text-muted">
        <span class="h-1 w-3 rounded-full bg-blueprint-blue"></span>
        p50
      </span>
      <span class="flex items-center gap-1 text-micro text-text-muted">
        <span class="h-1 w-3 rounded-full bg-text-muted"></span>
        p95
      </span>
    </div>
  </div>

  {#if store.status === 'loading'}
    <div class="mt-4 space-y-2" aria-hidden="true">
      <div class="h-8 animate-pulse rounded bg-subtle-gray"></div>
      <div class="h-20 animate-pulse rounded bg-subtle-gray"></div>
    </div>
  {:else if store.status === 'error'}
    <div class="mt-4 flex items-center justify-between gap-2 py-4">
      <p class="text-meta text-text-muted">Statistiques indisponibles.</p>
      <button
        type="button"
        class="text-micro font-medium text-blueprint-blue hover:text-blueprint-blue/80"
        onclick={() => void store.load()}
      >
        Réessayer
      </button>
    </div>
  {:else if stats && stats.hasData}
    <div class="mt-3 grid grid-cols-3 gap-3 border-y border-border-light py-3">
      <TimeToReviewKpi
        label="p50"
        value={stats.p50.value === null ? 'n/d' : `${formatHours(stats.p50.value)} h`}
        delta={stats.p50.delta === null ? null : formatHoursDelta(stats.p50.delta)}
        improved={stats.p50.delta !== null && stats.p50.delta < 0}
      />
      <TimeToReviewKpi
        label="p95"
        value={stats.p95.value === null ? 'n/d' : `${formatHours(stats.p95.value)} h`}
        delta={stats.p95.delta === null ? null : formatHoursDelta(stats.p95.delta)}
        improved={stats.p95.delta !== null && stats.p95.delta < 0}
      />
      <TimeToReviewKpi
        label="Non vues"
        value={stats.unviewed.value === null ? 'n/d' : formatPercent(stats.unviewed.value)}
        delta={stats.unviewed.delta === null ? null : formatPointsDelta(stats.unviewed.delta)}
        improved={stats.unviewed.delta !== null && stats.unviewed.delta < 0}
      />
    </div>

    {#if series.length > 0}
      <div class="mt-3 flex gap-2" role="img" aria-label={ariaLabel}>
        <div
          class="flex h-24 flex-col justify-between py-px text-right text-micro leading-none text-text-muted tabular-nums"
          aria-hidden="true"
        >
          {#each [...Y_TICKS].reverse() as tick (tick)}
            <span>{tick}{tick === 0 ? '' : 'h'}</span>
          {/each}
        </div>
        <div class="relative min-w-0 flex-1">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            class="h-24 w-full overflow-visible"
          >
            {#each Y_TICKS.slice(1) as tick (tick)}
              <line
                x1="0"
                x2="100"
                y1={yPercent(tick).toFixed(2)}
                y2={yPercent(tick).toFixed(2)}
                stroke="var(--color-border-light)"
                stroke-width="1"
                vector-effect="non-scaling-stroke"
              ></line>
            {/each}
            {#if p95Points}
              <polyline
                points={p95Points}
                fill="none"
                stroke="var(--color-text-muted)"
                stroke-width="1.5"
                stroke-linejoin="round"
                stroke-linecap="round"
                vector-effect="non-scaling-stroke"
              ></polyline>
            {/if}
            {#each p50Segments as indices, segmentIndex (`segment-${segmentIndex}`)}
              <path
                d={areaPath(series, indices)}
                fill="var(--color-blueprint-blue)"
                fill-opacity="0.12"
              ></path>
              <polyline
                points={linePoints(series, indices)}
                fill="none"
                stroke="var(--color-blueprint-blue)"
                stroke-width="1.5"
                stroke-linejoin="round"
                stroke-linecap="round"
                vector-effect="non-scaling-stroke"
              ></polyline>
            {/each}
          </svg>
          {#if endDot}
            <span
              class="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-blueprint-blue bg-surface-white"
              style="left: {endDot.x.toFixed(2)}%; top: {endDot.y.toFixed(2)}%;"
              aria-hidden="true"
            ></span>
          {/if}
          <div class="mt-1 flex justify-between text-micro text-text-muted" aria-hidden="true">
            <span>{formatDay(series[0].day)}</span>
            <span>{formatDay(series[series.length - 1].day)}</span>
          </div>
        </div>
      </div>
    {/if}
  {:else}
    <div class="flex flex-col items-center gap-1 py-6 text-center">
      <Icon name="clock" size={16} class="text-text-muted" />
      <p class="text-meta font-medium text-text-secondary">Pas encore de statistiques</p>
      <p class="max-w-[16rem] text-caption text-text-muted">
        Les statistiques de consultation se constituent à l'usage du feed.
      </p>
    </div>
  {/if}
</section>
