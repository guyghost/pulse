<script lang="ts">
  import { Icon } from '@pulse/ui';
  import type { Mission } from '$lib/core/types/mission';
  import { scoreToGrade } from '$lib/core/types/score';
  import OperationalStoryCard, {
    type OperationalEvidence,
  } from '../molecules/OperationalStoryCard.svelte';

  const {
    mission,
    onClose,
    onOpenLink,
  }: {
    mission: Mission;
    onClose?: () => void;
    onOpenLink?: (url: string) => void;
  } = $props();

  const score = $derived(mission.scoreBreakdown?.total ?? mission.score ?? 0);
  const criteria = $derived(mission.scoreBreakdown?.criteria ?? null);
  const storyEvidence = $derived<OperationalEvidence[]>([
    {
      label: 'Score',
      value: score,
      icon: 'target',
      severity: score >= 80 ? 'success' : score >= 60 ? 'attention' : 'neutral',
    },
    {
      label: 'TJM',
      value: mission.tjm !== null ? `${mission.tjm}€/j` : 'A verifier',
      icon: 'badge-euro',
      severity: mission.tjm !== null ? 'success' : 'attention',
    },
    {
      label: 'Source',
      value: mission.source,
      icon: 'database',
      severity: 'neutral',
    },
  ]);

  const story = $derived.by(() => {
    if (score >= 80) {
      return {
        severity: 'success' as const,
        statusLabel: 'Prioritaire',
        title: 'Cette mission merite une qualification rapide',
        description:
          'Le score global indique un bon alignement. Verifiez les points faibles ci-dessous avant de postuler.',
      };
    }

    if ((criteria?.tjm ?? 100) < 60) {
      return {
        severity: 'attention' as const,
        statusLabel: 'A negocier',
        title: 'Le principal risque est le TJM',
        description:
          'Gardez cette mission si le client ou le contexte compense, sinon priorisez une opportunite mieux alignee.',
      };
    }

    return {
      severity: score >= 60 ? ('attention' as const) : ('neutral' as const),
      statusLabel: score >= 60 ? 'A comparer' : 'Faible priorite',
      title: score >= 60 ? 'Mission a comparer avant action' : 'Mission a garder en observation',
      description:
        'Utilisez le detail des criteres pour comprendre pourquoi elle ne remonte pas plus haut.',
    };
  });

  const scoreLines = $derived(
    criteria
      ? [
          { label: 'Compétences', value: criteria.stack },
          { label: 'TJM', value: criteria.tjm },
          { label: 'Localisation', value: criteria.location },
          { label: 'Remote', value: criteria.remote },
        ]
      : []
  );
</script>

<div class="fixed inset-0 z-50 bg-text-primary/20 backdrop-blur-sm" role="presentation">
  <div
    class="absolute bottom-0 right-0 top-0 flex w-full max-w-md flex-col border-l border-border-light bg-page-canvas shadow-xl"
    role="dialog"
    aria-modal="true"
    aria-label="Investigation mission"
  >
    <div class="flex items-center justify-between border-b border-border-light px-4 py-3">
      <div class="min-w-0">
        <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
          Investigation
        </p>
        <h2 class="truncate text-sm font-semibold text-text-primary">{mission.title}</h2>
      </div>
      <button
        type="button"
        class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-subtle-gray hover:text-text-primary"
        onclick={onClose}
        aria-label="Fermer l'investigation"
      >
        <Icon name="x" size={15} />
      </button>
    </div>

    <div class="flex-1 space-y-4 overflow-y-auto p-4">
      <OperationalStoryCard
        eyebrow="Decision"
        title={story.title}
        description={story.description}
        severity={story.severity}
        statusLabel={story.statusLabel}
        evidence={storyEvidence}
        primaryActionLabel="Ouvrir la mission"
        primaryActionIcon="external-link"
        onPrimaryAction={() => onOpenLink?.(mission.url)}
      />

      <section class="section-card rounded-xl p-4">
        <h3 class="text-sm font-semibold text-text-primary">Preuves principales</h3>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <div class="rounded-lg bg-page-canvas px-3 py-2">
            <p class="text-[10px] uppercase tracking-[0.13em] text-text-muted">Client</p>
            <p class="mt-1 truncate text-xs font-medium text-text-primary">
              {mission.client || 'Non precise'}
            </p>
          </div>
          <div class="rounded-lg bg-page-canvas px-3 py-2">
            <p class="text-[10px] uppercase tracking-[0.13em] text-text-muted">Zone</p>
            <p class="mt-1 truncate text-xs font-medium text-text-primary">
              {mission.location || 'Non precisee'}
            </p>
          </div>
          <div class="rounded-lg bg-page-canvas px-3 py-2">
            <p class="text-[10px] uppercase tracking-[0.13em] text-text-muted">Durée</p>
            <p class="mt-1 truncate text-xs font-medium text-text-primary">
              {mission.duration || 'Non precisee'}
            </p>
          </div>
          <div class="rounded-lg bg-page-canvas px-3 py-2">
            <p class="text-[10px] uppercase tracking-[0.13em] text-text-muted">Début</p>
            <p class="mt-1 truncate text-xs font-medium text-text-primary">
              {mission.startDate || 'Non precise'}
            </p>
          </div>
        </div>
      </section>

      {#if scoreLines.length > 0}
        <section class="section-card rounded-xl p-4">
          <h3 class="text-sm font-semibold text-text-primary">Score par critère</h3>
          <div class="mt-3 space-y-2">
            {#each scoreLines as line}
              {@const grade = scoreToGrade(line.value)}
              <div
                class="flex items-center justify-between gap-3 rounded-lg bg-page-canvas px-3 py-2"
              >
                <span class="text-xs text-text-subtle">{line.label}</span>
                <span class="font-mono text-xs font-semibold text-text-primary">
                  {grade} · {line.value}
                </span>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if mission.description}
        <section class="section-card rounded-xl p-4">
          <h3 class="text-sm font-semibold text-text-primary">Détails techniques</h3>
          <p class="mt-3 whitespace-pre-wrap text-xs leading-5 text-text-subtle">
            {mission.description}
          </p>
        </section>
      {/if}
    </div>
  </div>
</div>
