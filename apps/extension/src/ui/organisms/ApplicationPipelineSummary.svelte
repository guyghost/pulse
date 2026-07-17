<script lang="ts">
  import { Icon, type IconName } from '@pulse/ui';
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

  type PipelineInsightCard = {
    label: string;
    value: string | number;
    icon: IconName;
    stateLabel: string;
    hint: string;
    severity: 'success' | 'attention' | 'incident' | 'neutral';
  };

  const insightCards = $derived.by<PipelineInsightCard[]>(() => [
    {
      label: 'Actives',
      value: summary.activeCount,
      icon: 'activity',
      stateLabel: summary.activeCount > 0 ? 'En cours' : 'À créer',
      hint:
        summary.activeCount > 0
          ? 'Traiter le dossier recommandé.'
          : 'Qualifier une mission depuis le feed.',
      severity: summary.activeCount > 0 ? 'success' : 'neutral',
    },
    {
      label: 'Relances',
      value: summary.dueFollowUps,
      icon: 'calendar-clock',
      stateLabel: summary.dueFollowUps > 0 ? 'À traiter' : 'Normal',
      hint: summary.dueFollowUps > 0 ? 'Ouvrir la relance échue.' : 'Aucune échéance dépassée.',
      severity: summary.dueFollowUps > 0 ? 'attention' : 'success',
    },
    {
      label: 'Prêtes',
      value: summary.preparedNotApplied,
      icon: 'send',
      stateLabel: summary.preparedNotApplied > 0 ? 'À envoyer' : 'Fluide',
      hint:
        summary.preparedNotApplied > 0
          ? 'Finaliser l’envoi ou changer le statut.'
          : 'Aucun dossier préparé bloqué.',
      severity: summary.preparedNotApplied > 0 ? 'attention' : 'success',
    },
    {
      label: 'Conversion',
      value: acceptanceText,
      icon: 'target',
      stateLabel:
        summary.acceptanceRate === null
          ? 'Pas encore mesurée'
          : summary.acceptedCount >= summary.rejectedCount
            ? 'Signal positif'
            : 'À surveiller',
      hint:
        summary.acceptanceRate === null
          ? 'Attendre un premier résultat.'
          : 'Comparer gagnées et refusées.',
      severity:
        summary.acceptanceRate === null
          ? 'neutral'
          : summary.acceptedCount >= summary.rejectedCount
            ? 'success'
            : 'incident',
    },
  ]);
</script>

<div class="mt-4 space-y-3">
  <div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
    {#each insightCards as card, i (i)}
      <div
        class="rounded-lg border bg-surface-white px-3 py-2.5 {card.severity === 'attention'
          ? 'border-status-orange/25'
          : card.severity === 'incident'
            ? 'border-status-red/25'
            : card.severity === 'success'
              ? 'border-accent-green/25'
              : 'border-border-light'}"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">
              {card.label}
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-text-primary">
              {card.value}
            </p>
          </div>
          <span
            class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg {card.severity ===
            'attention'
              ? 'bg-status-orange/12 text-text-primary'
              : card.severity === 'incident'
                ? 'bg-status-red/12 text-text-primary'
                : card.severity === 'success'
                  ? 'bg-accent-green/12 text-text-primary'
                  : 'bg-subtle-gray text-text-muted'}"
            aria-hidden="true"
          >
            <Icon name={card.icon} size={13} />
          </span>
        </div>
        <p class="mt-1 text-[10px] font-medium text-text-primary">{card.stateLabel}</p>
        <p class="mt-0.5 min-h-7 text-[10px] leading-4 text-text-subtle">{card.hint}</p>
      </div>
    {/each}
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
      {#each summary.stages as stage, i (i)}
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
