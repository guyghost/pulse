<script lang="ts">
  import { Icon } from '@pulse/ui';
  import type { Mission } from '$lib/core/types/mission';
  import type { ApplicationStatus } from '$lib/core/types/tracking';
  import { STATUS_LABELS } from '$lib/core/types/tracking';
  import { scoreToGrade } from '$lib/core/types/score';
  import OperationalStoryCard, {
    type OperationalEvidence,
  } from '../molecules/OperationalStoryCard.svelte';

  const {
    mission,
    isCompared = false,
    compareDisabled = false,
    isHidden = false,
    trackingStatus = null,
    trackingUpdatedAt = null,
    onClose,
    onOpenLink,
    onToggleCompare,
    onHide,
    onSelectForTracking,
  }: {
    mission: Mission;
    isCompared?: boolean;
    compareDisabled?: boolean;
    isHidden?: boolean;
    trackingStatus?: ApplicationStatus | null;
    trackingUpdatedAt?: number | null;
    onClose?: () => void;
    onOpenLink?: (url: string) => void;
    onToggleCompare?: () => void;
    onHide?: () => void;
    onSelectForTracking?: () => void;
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
      value: mission.tjm !== null ? `${mission.tjm}€/j` : 'À vérifier',
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
        title: 'Cette mission mérite une qualification rapide',
        description:
          'Le score global indique un bon alignement. Vérifiez les points faibles ci-dessous avant de postuler.',
      };
    }

    if ((criteria?.tjm ?? 100) < 60) {
      return {
        severity: 'attention' as const,
        statusLabel: 'À négocier',
        title: 'Le principal risque est le TJM',
        description:
          'Gardez cette mission si le client ou le contexte compense, sinon priorisez une opportunité mieux alignée.',
      };
    }

    return {
      severity: score >= 60 ? ('attention' as const) : ('neutral' as const),
      statusLabel: score >= 60 ? 'À comparer' : 'Faible priorité',
      title: score >= 60 ? 'Mission à comparer avant action' : 'Mission à garder en observation',
      description:
        'Utilisez le détail des critères pour comprendre pourquoi elle ne remonte pas plus haut.',
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

  const canSelectForTracking = $derived(trackingStatus === null || trackingStatus === 'detected');
  const trackingActionLabel = $derived(
    canSelectForTracking
      ? 'Mettre en suivi'
      : `Suivi: ${STATUS_LABELS[trackingStatus ?? 'detected']}`
  );
  const trackingUpdatedLabel = $derived(formatTrackingTimestamp(trackingUpdatedAt));

  function formatTrackingTimestamp(timestamp: number | null | undefined): string | null {
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
      return null;
    }

    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));
  }

  function handleSelectForTracking(): void {
    if (!canSelectForTracking) {
      return;
    }
    onSelectForTracking?.();
  }

  function handleToggleCompare(): void {
    if (compareDisabled && !isCompared) {
      return;
    }
    onToggleCompare?.();
  }

  function handleOpenForTracking(): void {
    onOpenLink?.(mission.url);
  }
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
        eyebrow="Décision"
        title={story.title}
        description={story.description}
        severity={story.severity}
        statusLabel={story.statusLabel}
        evidence={storyEvidence}
        primaryActionLabel="Ouvrir la mission"
        primaryActionIcon="external-link"
        onPrimaryAction={() => onOpenLink?.(mission.url)}
      />

      <section class="section-card rounded-xl p-4" aria-label="Actions rapides mission">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-sm font-semibold text-text-primary">Transformer la décision</h3>
            <p class="mt-1 text-xs leading-5 text-text-subtle">
              Gardez le contrôle avant de sortir vers la plateforme source.
            </p>
          </div>
          <div class="shrink-0 text-right">
            <span
              class="inline-flex rounded-lg border border-border-light bg-page-canvas px-2 py-1 text-[10px] font-medium text-text-subtle"
            >
              {trackingStatus ? STATUS_LABELS[trackingStatus] : 'Non suivie'}
            </span>
            {#if trackingUpdatedLabel}
              <p class="mt-1 text-[10px] text-text-muted">Modifié {trackingUpdatedLabel}</p>
            {/if}
          </div>
        </div>

        <div class="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-blueprint-blue/25 bg-blueprint-blue/8 px-3 text-xs font-semibold text-blueprint-blue transition-colors hover:border-blueprint-blue/40 hover:bg-blueprint-blue/12 disabled:cursor-not-allowed disabled:opacity-45"
            onclick={handleSelectForTracking}
            disabled={!canSelectForTracking}
            aria-label={trackingActionLabel}
          >
            <Icon name="list-checks" size={13} />
            {trackingActionLabel}
          </button>
          <button
            type="button"
            class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border-light bg-surface-white px-3 text-xs font-semibold text-text-primary transition-colors hover:bg-subtle-gray"
            onclick={handleOpenForTracking}
          >
            <Icon name="external-link" size={13} />
            Ouvrir pour postuler
          </button>
          <button
            type="button"
            class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border-light bg-surface-white px-3 text-xs font-semibold text-text-primary transition-colors hover:bg-subtle-gray disabled:cursor-not-allowed disabled:opacity-45 {isCompared
              ? 'border-blueprint-blue/25 bg-blueprint-blue/8 text-blueprint-blue'
              : ''}"
            onclick={handleToggleCompare}
            disabled={compareDisabled && !isCompared}
            aria-pressed={isCompared}
          >
            <Icon name="git-compare-arrows" size={13} />
            {isCompared ? 'Retirer comparaison' : 'Comparer'}
          </button>
          <button
            type="button"
            class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border-light bg-surface-white px-3 text-xs font-semibold text-text-primary transition-colors hover:bg-subtle-gray hover:text-status-red"
            onclick={() => onHide?.()}
            aria-pressed={isHidden}
          >
            <Icon name={isHidden ? 'eye' : 'x-circle'} size={13} />
            {isHidden ? 'Restaurer' : 'Masquer'}
          </button>
        </div>
      </section>

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
          <details class="rounded-lg border border-blueprint-blue/15 bg-blueprint-blue/5 px-3 py-2">
            <summary class="cursor-pointer text-xs font-semibold text-blueprint-blue">
              Pourquoi ce score ?
            </summary>
            <p class="mt-2 text-xs leading-5 text-text-secondary">
              Score final {mission.scoreBreakdown?.total ?? score}/100, calculé depuis le profil,
              l’annonce et les critères ci-dessous.
            </p>
            {#if mission.scoreBreakdown}
              <p class="mt-2 text-[11px] leading-5 text-text-subtle">
                Base de score {mission.scoreBreakdown.deterministic}/100. L’analyse locale, quand
                elle existe, ajoute une hypothèse non bloquante.
              </p>
              {#if mission.scoreBreakdown.semanticReason}
                <p class="mt-2 text-[11px] leading-5 text-blueprint-blue">
                  {mission.scoreBreakdown.semanticReason}
                </p>
              {/if}
            {/if}
          </details>
          <h3 class="mt-4 text-sm font-semibold text-text-primary">Score par critère</h3>
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
