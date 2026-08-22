<script lang="ts">
  import type { Mission } from '$lib/core/types/mission';
  import { getMissionGrade, getMissionScore } from '$lib/core/scoring/mission-grade';
  import { formatTJM } from '$lib/core/utils/format';
  import { modalFocus, requestModalClose } from '$lib/shell/ui/modal-focus';
  import { Icon } from '@pulse/ui';

  const {
    missions,
    onClose,
  }: {
    missions: Mission[];
    onClose: () => void;
  } = $props();

  let modalRoot = $state<HTMLElement | null>(null);
  let dialogElement = $state<HTMLElement | null>(null);
  let showFullDetails = $state(false);

  function handleClose(): void {
    if (!requestModalClose(modalRoot, 'explicit')) {
      onClose();
    }
  }

  function toggleDetails(): void {
    showFullDetails = !showFullDetails;
  }

  const remoteLabels: Record<string, string> = {
    full: 'Full remote',
    hybrid: 'Hybride',
    onsite: 'Sur site',
  };

  // High-signal fields — always visible (collapsed default view)
  const primaryFields: { label: string; key: string; render: (m: Mission) => string }[] = [
    {
      label: 'Note',
      key: 'score',
      render: (m) => getMissionGrade(m) ?? '—',
    },
    { label: 'TJM', key: 'tjm', render: (m) => (m.tjm ? formatTJM(m.tjm) : '—') },
  ];

  // Detail fields — behind toggle
  const detailFields: { label: string; key: string; render: (m: Mission) => string }[] = [
    { label: 'Localisation', key: 'location', render: (m) => m.location ?? '—' },
    {
      label: 'Remote',
      key: 'remote',
      render: (m) => (m.remote ? (remoteLabels[m.remote] ?? m.remote) : '—'),
    },
    { label: 'Durée', key: 'duration', render: (m) => m.duration ?? '—' },
    { label: 'Début', key: 'startDate', render: (m) => m.startDate ?? '—' },
    { label: 'Séniorité', key: 'seniority', render: (m) => m.seniority ?? '—' },
    { label: 'Source', key: 'source', render: (m) => m.source },
    { label: 'Client', key: 'client', render: (m) => m.client ?? '—' },
  ];

  const rankedMissions = $derived(
    [...missions].sort((a, b) => (getMissionScore(b) ?? 0) - (getMissionScore(a) ?? 0))
  );
  const recommendedMission = $derived(rankedMissions[0] ?? null);
  const runnerUpMission = $derived(rankedMissions[1] ?? null);
  const recommendedGrade = $derived(
    recommendedMission ? getMissionGrade(recommendedMission) : null
  );
  const runnerUpGrade = $derived(runnerUpMission ? getMissionGrade(runnerUpMission) : null);
  const scoreGap = $derived(
    recommendedMission && runnerUpMission
      ? (getMissionScore(recommendedMission) ?? 0) - (getMissionScore(runnerUpMission) ?? 0)
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

    if (recommendedGrade !== null && recommendedGrade !== runnerUpGrade) {
      return `${recommendedMission.title} obtient une meilleure note que la suivante. La prochaine action est d’ouvrir cette mission ou de la mettre en suivi.`;
    }

    if (scoreGap > 0) {
      return 'Les missions partagent la même note. Départagez-les avec le TJM, le remote et la source avant de postuler.';
    }

    return 'Les notes sont à égalité. Utilisez le TJM, le remote et le client pour trancher.';
  });

  /**
   * Compact decision evidence — a single high-signal value (the recommended
   * mission's fused score) rendered inline inside the recommendation box.
   * Not the old 2×2 grid; this stays decision-first and unobtrusive.
   */
  type DecisionEvidence = {
    label: string;
    value: string;
  };

  const decisionEvidence = $derived.by<DecisionEvidence[]>(() => {
    if (!recommendedMission) {
      return [];
    }
    return [
      {
        label: 'Note',
        value: getMissionGrade(recommendedMission) ?? 'Non notée',
      },
    ];
  });
</script>

{#if missions.length >= 2}
  <div
    bind:this={modalRoot}
    use:modalFocus={{
      surface: 'mission_comparison',
      variant: 'comparison',
      ownerScopePath: ['feed', 'mission_comparison'],
      onBeforeClose: () => {
        onClose();
        return 'accepted';
      },
      onRejected: onClose,
    }}
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
  >
    <div
      bind:this={dialogElement}
      class="w-full max-w-lg animate-slide-up rounded-t-3xl bg-surface-white border border-border-light max-h-[85vh] overflow-y-auto"
      role="dialog"
      tabindex="-1"
      aria-labelledby="mission-comparison-title"
    >
      <!-- Header -->
      <div
        class="sticky top-0 z-10 flex items-center justify-between border-b border-border-light bg-surface-white/95 backdrop-blur-sm px-4 py-3"
      >
        <h2 id="mission-comparison-title" class="text-body-lg font-semibold text-text-primary">
          Comparaison ({missions.length} missions)
        </h2>
        <button
          class="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-subtle-gray hover:text-text-primary transition-colors"
          onclick={handleClose}
          aria-label="Fermer"
          data-modal-close
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
                <p class="eyebrow eyebrow--strong eyebrow--blue">Décision recommandée</p>
                <h3 class="mt-1 text-body-lg font-semibold text-text-primary">
                  {recommendationTitle}
                </h3>
                {#if decisionEvidence.length > 0}
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    {#each decisionEvidence as evidence (evidence.label)}
                      <span
                        class="inline-flex items-baseline gap-1 rounded-md bg-blueprint-blue/10 px-2 py-0.5 text-meta text-blueprint-blue"
                      >
                        <span class="eyebrow eyebrow--inherit opacity-70">{evidence.label}</span>
                        <span class="font-semibold tabular-nums">{evidence.value}</span>
                      </span>
                    {/each}
                  </div>
                {/if}
                <p class="mt-1 text-meta leading-5 text-text-subtle">
                  {recommendationDescription}
                </p>
              </div>
            </div>
          </div>
        </section>
      {/if}

      <!-- Titles row -->
      <div
        class="grid border-b border-border-light px-4 py-3"
        style="grid-template-columns: 90px repeat({missions.length}, 1fr)"
      >
        <div class="eyebrow eyebrow--caption self-end">Mission</div>
        {#each missions as mission (mission.id)}
          <div
            class="px-2 {mission.id === recommendedMission?.id
              ? 'bg-blueprint-blue/5 -mx-2 px-4 pt-2 border-t border-t-blueprint-blue/30'
              : ''}"
          >
            <a
              data-modal-mission-link
              href={mission.url}
              target="_blank"
              rel="noopener"
              class="text-meta font-semibold text-blueprint-blue hover:underline line-clamp-2"
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
        <div class="eyebrow eyebrow--caption">Stack</div>
        {#each missions as mission (mission.id)}
          <div
            class="flex flex-wrap gap-1 px-2 {mission.id === recommendedMission?.id
              ? 'bg-blueprint-blue/5 -mx-2 px-4'
              : ''}"
          >
            {#each mission.stack.slice(0, 5) as tech (tech)}
              <span
                class="inline-flex rounded-full bg-blueprint-blue/10 px-1.5 py-0.5 text-micro text-blueprint-blue"
                >{tech}</span
              >
            {/each}
            {#if mission.stack.length > 5}
              <span class="text-micro text-text-muted">+{mission.stack.length - 5}</span>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Primary fields (always visible) -->
      {#each primaryFields as field, i (i)}
        <div
          class="grid px-4 py-2.5 {i % 2 === 0 ? 'bg-page-canvas' : ''}"
          style="grid-template-columns: 90px repeat({missions.length}, 1fr)"
        >
          <div class="eyebrow eyebrow--caption">{field.label}</div>
          {#each missions as mission (mission.id)}
            <div
              class="px-2 text-meta text-text-primary {mission.id === recommendedMission?.id
                ? 'bg-blueprint-blue/5 -mx-2 px-4'
                : ''}"
            >
              {field.render(mission)}
            </div>
          {/each}
        </div>
      {/each}

      <!-- Toggle button -->
      <div class="border-y border-border-light bg-page-canvas px-4 py-2">
        <button
          class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-meta text-text-secondary hover:bg-subtle-gray hover:text-text-primary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blueprint-blue focus-visible:outline-offset-2"
          onclick={toggleDetails}
          aria-expanded={showFullDetails}
          aria-controls="comparison-details"
        >
          <Icon
            name="chevron-down"
            size={14}
            class="transition-transform motion-reduce:transition-none {showFullDetails
              ? 'rotate-180'
              : ''}"
          />
          {showFullDetails ? 'Masquer les détails' : 'Afficher tous les détails'}
        </button>
      </div>

      <!-- Detail fields (expandable) -->
      {#if showFullDetails}
        <div id="comparison-details" class="details-container overflow-hidden">
          {#each detailFields as field, i (i)}
            <div
              class="grid px-4 py-2.5 {i % 2 === 0 ? 'bg-page-canvas' : ''}"
              style="grid-template-columns: 90px repeat({missions.length}, 1fr)"
            >
              <div class="eyebrow eyebrow--caption">
                {field.label}
              </div>
              {#each missions as mission (mission.id)}
                <div
                  class="px-2 text-meta text-text-primary {mission.id === recommendedMission?.id
                    ? 'bg-blueprint-blue/5 -mx-2 px-4'
                    : ''}"
                >
                  {field.render(mission)}
                </div>
              {/each}
            </div>
          {/each}
        </div>
      {/if}

      <!-- Actions -->
      <div
        class="grid px-4 py-3 border-t border-border-light"
        style="grid-template-columns: 90px repeat({missions.length}, 1fr)"
      >
        <div></div>
        {#each missions as mission (mission.id)}
          <div class="px-2">
            <a
              data-modal-action
              href={mission.url}
              target="_blank"
              rel="noopener"
              class="inline-flex items-center gap-1 rounded-lg bg-blueprint-blue/10 px-3 py-1.5 text-meta text-blueprint-blue hover:bg-blueprint-blue/20 transition-colors"
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

<style>
  @keyframes slideDown {
    from {
      opacity: 0;
      max-height: 0;
    }
    to {
      opacity: 1;
      max-height: 1000px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    @keyframes slideDown {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
  }

  .details-container {
    animation: slideDown 200ms ease-out;
  }

  @media (prefers-reduced-motion: reduce) {
    .details-container {
      animation-duration: 0.01ms;
    }
  }
</style>
