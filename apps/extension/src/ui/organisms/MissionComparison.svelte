<script lang="ts">
  import type { Mission } from '$lib/core/types/mission';
  import { Icon } from '@pulse/ui';

  const {
    missions,
    onClose,
  }: {
    missions: Mission[];
    onClose: () => void;
  } = $props();

  const remoteLabels: Record<string, string> = {
    full: 'Full remote',
    hybrid: 'Hybride',
    onsite: 'Sur site',
  };

  type DecisionEvidence = {
    label: string;
    value: string;
    icon: string;
    severity: 'success' | 'attention' | 'neutral';
  };

  /**
   * Single source of truth for a mission's score across the comparison
   * (table cell, ranking and recommendation evidence). Prefers the fused
   * breakdown.total and only falls back to legacy semantic/score when no
   * breakdown exists — matching sort-missions.ts so the table can never
   * diverge from the ranking/recommendation.
   */
  function getMissionScore(mission: Mission): number {
    return mission.scoreBreakdown?.total ?? mission.semanticScore ?? mission.score ?? 0;
  }

  const fields: { label: string; key: string; render: (m: Mission) => string }[] = [
    { label: 'TJM', key: 'tjm', render: (m) => (m.tjm ? `${m.tjm} €/j` : '—') },
    { label: 'Localisation', key: 'location', render: (m) => m.location ?? '—' },
    {
      label: 'Remote',
      key: 'remote',
      render: (m) => (m.remote ? (remoteLabels[m.remote] ?? m.remote) : '—'),
    },
    { label: 'Durée', key: 'duration', render: (m) => m.duration ?? '—' },
    { label: 'Début', key: 'startDate', render: (m) => m.startDate ?? '—' },
    { label: 'Séniorité', key: 'seniority', render: (m) => m.seniority ?? '—' },
    {
      label: 'Score',
      key: 'score',
      render: (m) => `${getMissionScore(m)}/100`,
    },
    { label: 'Source', key: 'source', render: (m) => m.source },
    { label: 'Client', key: 'client', render: (m) => m.client ?? '—' },
  ];

  function formatTjm(value: number | null): string {
    return typeof value === 'number' ? `${value} €/j` : 'Non précisé';
  }

  const rankedMissions = $derived(
    [...missions].sort((a, b) => getMissionScore(b) - getMissionScore(a))
  );
  const recommendedMission = $derived(rankedMissions[0] ?? null);
  const runnerUpMission = $derived(rankedMissions[1] ?? null);
  const scoreGap = $derived(
    recommendedMission && runnerUpMission
      ? getMissionScore(recommendedMission) - getMissionScore(runnerUpMission)
      : 0
  );
  const bestTjmMission = $derived(
    [...missions]
      .filter((mission) => typeof mission.tjm === 'number')
      .sort((a, b) => (b.tjm ?? 0) - (a.tjm ?? 0))[0] ?? null
  );

  const recommendationTitle = $derived(
    recommendedMission ? `Priorité: ${recommendedMission.title}` : 'Comparaison prête'
  );

  const recommendationDescription = $derived.by(() => {
    if (!recommendedMission) {
      return 'Sélectionnez au moins deux missions pour obtenir une recommandation.';
    }

    if (scoreGap >= 10) {
      return `${recommendedMission.title} devance la suivante de ${scoreGap} points. La prochaine action est d’ouvrir cette mission ou de la mettre en suivi.`;
    }

    if (scoreGap > 0) {
      return `Les scores sont proches: ${scoreGap} point${scoreGap > 1 ? 's' : ''} d’écart. Départagez avec le TJM, le remote et la source avant de postuler.`;
    }

    return 'Les scores sont à égalité. Utilisez le TJM, le remote et le client pour trancher.';
  });

  const decisionEvidence = $derived.by<DecisionEvidence[]>(() => {
    if (!recommendedMission) {
      return [];
    }

    return [
      {
        label: 'Score',
        value: `${getMissionScore(recommendedMission)}/100`,
        icon: 'target',
        severity: getMissionScore(recommendedMission) >= 80 ? 'success' : 'attention',
      },
      {
        label: 'Écart',
        value: scoreGap > 0 ? `+${scoreGap} pts` : 'Égalité',
        icon: 'git-compare-arrows',
        severity: scoreGap >= 10 ? 'success' : 'attention',
      },
      {
        label: 'Meilleur TJM',
        value: bestTjmMission ? formatTjm(bestTjmMission.tjm) : 'Absent',
        icon: 'badge-euro',
        severity: bestTjmMission ? 'success' : 'neutral',
      },
      {
        label: 'Vigilance',
        value:
          recommendedMission.remote === 'onsite'
            ? 'Présentiel'
            : recommendedMission.tjm === null
              ? 'TJM absent'
              : 'Aucune',
        icon: 'circle-alert',
        severity:
          recommendedMission.remote === 'onsite' || recommendedMission.tjm === null
            ? 'attention'
            : 'success',
      },
    ];
  });
</script>

{#if missions.length >= 2}
  <div
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
  >
    <div
      class="w-full max-w-lg animate-slide-up rounded-t-3xl bg-surface-white border border-border-light max-h-[85vh] overflow-y-auto"
    >
      <!-- Header -->
      <div
        class="sticky top-0 z-10 flex items-center justify-between border-b border-border-light bg-surface-white/95 backdrop-blur-sm px-4 py-3"
      >
        <h2 class="text-sm font-semibold text-text-primary">
          Comparaison ({missions.length} missions)
        </h2>
        <button
          class="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-subtle-gray hover:text-text-primary transition-colors"
          onclick={onClose}
          aria-label="Fermer"
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      {#if recommendedMission}
        <section class="border-b border-border-light bg-page-canvas px-4 py-3">
          <div class="rounded-xl border border-blueprint-blue/15 bg-surface-white p-3">
            <div class="flex items-start gap-3">
              <span
                class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blueprint-blue/8 text-blueprint-blue"
                aria-hidden="true"
              >
                <Icon name="target" size={16} />
              </span>
              <div class="min-w-0 flex-1">
                <p
                  class="text-[10px] font-semibold uppercase tracking-[0.15em] text-blueprint-blue"
                >
                  Décision recommandée
                </p>
                <h3 class="mt-1 text-sm font-semibold text-text-primary">
                  {recommendationTitle}
                </h3>
                <p class="mt-1 text-xs leading-5 text-text-subtle">
                  {recommendationDescription}
                </p>
              </div>
            </div>

            <div class="mt-3 grid grid-cols-2 gap-2">
              {#each decisionEvidence as item, i (i)}
                <div
                  class="rounded-lg border px-2 py-1.5 {item.severity === 'attention'
                    ? 'border-status-orange/25 bg-status-orange/5'
                    : item.severity === 'success'
                      ? 'border-accent-green/20 bg-accent-green/5'
                      : 'border-border-light bg-page-canvas'}"
                >
                  <span class="flex items-center gap-1 text-[10px] text-text-muted">
                    <Icon name={item.icon} size={11} />
                    {item.label}
                  </span>
                  <span
                    class="mt-0.5 block text-xs font-semibold tabular-nums {item.severity ===
                    'attention'
                      ? 'text-status-orange'
                      : item.severity === 'success'
                        ? 'text-text-primary'
                        : 'text-text-subtle'}"
                  >
                    {item.value}
                  </span>
                </div>
              {/each}
            </div>
          </div>
        </section>
      {/if}

      <!-- Titles row -->
      <div
        class="grid border-b border-border-light px-4 py-3"
        style="grid-template-columns: 90px repeat({missions.length}, 1fr)"
      >
        <div class="text-[11px] uppercase tracking-[0.15em] text-text-muted self-end">Mission</div>
        {#each missions as mission (mission.id)}
          <div class="px-2">
            <a
              href={mission.url}
              target="_blank"
              rel="noopener"
              class="text-xs font-semibold text-blueprint-blue hover:underline line-clamp-2"
            >
              {mission.title}
            </a>
          </div>
        {/each}
      </div>

      <!-- Stack row -->
      <div
        class="grid border-b border-border-light px-4 py-3"
        style="grid-template-columns: 90px repeat({missions.length}, 1fr)"
      >
        <div class="text-[11px] uppercase tracking-[0.15em] text-text-muted">Stack</div>
        {#each missions as mission (mission.id)}
          <div class="flex flex-wrap gap-1 px-2">
            {#each mission.stack.slice(0, 5) as tech (tech)}
              <span
                class="inline-flex rounded-full bg-blueprint-blue/10 px-1.5 py-0.5 text-[10px] text-blueprint-blue"
                >{tech}</span
              >
            {/each}
            {#if mission.stack.length > 5}
              <span class="text-[10px] text-text-muted">+{mission.stack.length - 5}</span>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Data rows -->
      {#each fields as field, i (i)}
        <div
          class="grid px-4 py-2.5 {i % 2 === 0 ? 'bg-page-canvas' : ''}"
          style="grid-template-columns: 90px repeat({missions.length}, 1fr)"
        >
          <div class="text-[11px] uppercase tracking-[0.15em] text-text-muted">{field.label}</div>
          {#each missions as mission (mission.id)}
            <div class="px-2 text-xs text-text-primary">{field.render(mission)}</div>
          {/each}
        </div>
      {/each}

      <!-- Actions -->
      <div
        class="grid px-4 py-3 border-t border-border-light"
        style="grid-template-columns: 90px repeat({missions.length}, 1fr)"
      >
        <div></div>
        {#each missions as mission (mission.id)}
          <div class="px-2">
            <a
              href={mission.url}
              target="_blank"
              rel="noopener"
              class="inline-flex items-center gap-1 rounded-lg bg-blueprint-blue/10 px-3 py-1.5 text-xs text-blueprint-blue hover:bg-blueprint-blue/20 transition-colors"
            >
              <Icon name="external-link" size={12} />
              Voir
            </a>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}
