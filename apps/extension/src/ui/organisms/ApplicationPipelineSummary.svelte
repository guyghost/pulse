<script lang="ts">
  import { Icon } from '@pulse/ui';
  import type { ApplicationPipelineSummary } from '$lib/core/tracking/pipeline-summary';

  const {
    summary,
  }: {
    summary: ApplicationPipelineSummary;
  } = $props();

  const maxStageCount = $derived(Math.max(...summary.stages.map((stage) => stage.count), 1));
  const acceptanceText = $derived(
    summary.acceptanceRate === null ? '—' : `${summary.acceptanceRate}%`
  );
</script>

<div class="mt-4 space-y-3">
  <div class="grid grid-cols-4 gap-2">
    <div class="rounded-lg border border-border-light bg-surface-white px-3 py-2">
      <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">Actives</p>
      <p class="mt-1 text-lg font-semibold tabular-nums text-text-primary">
        {summary.activeCount}
      </p>
    </div>
    <div class="rounded-lg border border-border-light bg-surface-white px-3 py-2">
      <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">Relances</p>
      <p
        class="mt-1 text-lg font-semibold tabular-nums {summary.dueFollowUps > 0
          ? 'text-status-orange'
          : 'text-text-primary'}"
      >
        {summary.dueFollowUps}
      </p>
    </div>
    <div class="rounded-lg border border-border-light bg-surface-white px-3 py-2">
      <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">Prêtes</p>
      <p class="mt-1 text-lg font-semibold tabular-nums text-text-primary">
        {summary.preparedNotApplied}
      </p>
    </div>
    <div class="rounded-lg border border-border-light bg-surface-white px-3 py-2">
      <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">Accept.</p>
      <p class="mt-1 text-lg font-semibold tabular-nums text-blueprint-blue">{acceptanceText}</p>
    </div>
  </div>

  <div class="rounded-xl border border-border-light bg-surface-white p-3">
    <div class="mb-2 flex items-center justify-between gap-3">
      <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
        Avancement
      </p>
      {#if summary.bottleneck}
        <p class="flex items-center gap-1 text-[10px] text-text-subtle">
          <Icon name="traffic-cone" size={11} />
          Goulot: {summary.bottleneck.label}
        </p>
      {/if}
    </div>
    <div class="space-y-2">
      {#each summary.stages as stage}
        {@const width = Math.max(3, Math.round((stage.count / maxStageCount) * 100))}
        <div>
          <div class="flex items-center justify-between gap-2">
            <span class="truncate text-[11px] text-text-subtle">{stage.label}</span>
            <span class="text-[11px] font-mono tabular-nums text-text-primary">{stage.count}</span>
          </div>
          <div class="mt-1 h-1.5 rounded-full bg-subtle-gray">
            <div
              class="h-full rounded-full {stage.status === 'accepted'
                ? 'bg-accent-green'
                : stage.status === 'rejected'
                  ? 'bg-status-red/50'
                  : 'bg-blueprint-blue/50'}"
              style:width="{stage.count > 0 ? width : 0}%"
            ></div>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
