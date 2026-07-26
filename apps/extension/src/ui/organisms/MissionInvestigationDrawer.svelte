<script lang="ts">
  import { Icon, type IconName } from '@pulse/ui';
  import type { Mission } from '$lib/core/types/mission';
  import type { ApplicationStatus } from '$lib/core/types/tracking';
  import { STATUS_LABELS } from '$lib/core/types/tracking';
  import { scoreToGrade } from '$lib/core/types/score';
  import { modalFocus, requestModalClose } from '$lib/shell/ui/modal-focus';
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
    trackingState = 'loading',
    trackingError = null,
    onClose,
    onOpenLink,
    onToggleCompare,
    onHide,
    onSelectForTracking,
    onRetryTracking,
  }: {
    mission: Mission;
    isCompared?: boolean;
    compareDisabled?: boolean;
    isHidden?: boolean;
    trackingStatus?: ApplicationStatus | null;
    trackingUpdatedAt?: number | null;
    trackingState?: 'idle' | 'loading' | 'loaded' | 'error';
    trackingError?: string | null;
    onClose?: () => void;
    onOpenLink?: (url: string) => void;
    onToggleCompare?: () => void;
    onHide?: () => void;
    onSelectForTracking?: () => void;
    onRetryTracking?: () => void;
  } = $props();

  let modalRoot = $state<HTMLElement | null>(null);
  let dialogElement = $state<HTMLElement | null>(null);

  function handleClose(): void {
    if (!requestModalClose(modalRoot, 'explicit')) {
      onClose?.();
    }
  }

  type MissionFact = {
    label: string;
    value: string;
    icon: IconName;
  };

  const score = $derived(mission.scoreBreakdown?.total ?? mission.score ?? 0);
  const criteria = $derived(mission.scoreBreakdown?.criteria ?? null);
  const formattedStartDate = $derived(formatMissionDate(mission.startDate));
  const formattedPublishedAt = $derived(formatMissionDate(mission.publishedAt));
  const visibleStack = $derived(mission.stack.slice(0, 10));
  const missionFacts = $derived<MissionFact[]>([
    {
      label: 'Client',
      value: mission.client || 'Non précisé',
      icon: 'briefcase',
    },
    {
      label: 'Zone',
      value: mission.location || 'Non précisée',
      icon: 'radar',
    },
    {
      label: 'Durée',
      value: mission.duration || 'Non précisée',
      icon: 'clock',
    },
    {
      label: 'Début',
      value: formattedStartDate ?? 'Non précisé',
      icon: 'calendar-clock',
    },
  ]);
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

  const trackingReady = $derived(trackingState === 'loaded');
  const canSelectForTracking = $derived(
    trackingReady && (trackingStatus === null || trackingStatus === 'detected')
  );
  const trackingBadgeLabel = $derived(
    trackingState === 'error'
      ? 'Suivi indisponible'
      : trackingState === 'loading'
        ? 'Chargement du suivi'
        : trackingStatus
          ? STATUS_LABELS[trackingStatus]
          : 'Non suivie'
  );
  const trackingActionLabel = $derived(
    trackingState === 'error'
      ? 'Réessayer le suivi'
      : trackingState === 'loading'
        ? 'Chargement du suivi'
        : canSelectForTracking
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

  function formatMissionDate(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }

  function handleSelectForTracking(): void {
    if (trackingState === 'error') {
      onRetryTracking?.();
      return;
    }
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

<div
  bind:this={modalRoot}
  use:modalFocus={{
    surface: 'mission_investigation',
    variant: 'investigation',
    ownerScopePath: ['feed', 'mission_investigation'],
    onBeforeClose: () => {
      onClose?.();
      return 'accepted';
    },
    onRejected: () => onClose?.(),
  }}
  class="fixed inset-0 z-50 bg-page-canvas"
  role="presentation"
>
  <div
    bind:this={dialogElement}
    class="absolute inset-0 flex w-full flex-col bg-page-canvas"
    role="dialog"
    tabindex="-1"
    aria-label="Investigation mission"
  >
    <div
      class="shrink-0 border-b border-border-light bg-surface-white/92 px-4 py-4 sm:px-6 lg:px-8"
    >
      <div class="mx-auto flex w-full max-w-6xl items-start justify-between gap-4">
        <div class="min-w-0 flex-1">
          <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
            Investigation
          </p>
          <h2 class="mt-1 max-w-4xl text-xl font-semibold leading-tight text-text-primary">
            {mission.title}
          </h2>
          <div class="mt-3 flex flex-wrap gap-2">
            <span
              class="inline-flex items-center gap-1 rounded-lg border border-border-light bg-page-canvas px-2.5 py-1 text-[11px] font-medium text-text-secondary"
            >
              <Icon name="database" size={12} />
              {mission.source}
            </span>
            <span
              class="inline-flex items-center gap-1 rounded-lg border border-border-light bg-page-canvas px-2.5 py-1 text-[11px] font-medium text-text-secondary"
            >
              <Icon name="badge-euro" size={12} />
              {mission.tjm !== null ? `${mission.tjm}€/j` : 'TJM à vérifier'}
            </span>
            {#if formattedPublishedAt}
              <span
                class="inline-flex items-center gap-1 rounded-lg border border-border-light bg-page-canvas px-2.5 py-1 text-[11px] font-medium text-text-secondary"
              >
                <Icon name="calendar-clock" size={12} />
                Publiée {formattedPublishedAt}
              </span>
            {/if}
          </div>
        </div>
        <button
          type="button"
          class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-subtle-gray hover:text-text-primary"
          onclick={handleClose}
          aria-label="Fermer l'investigation"
          data-modal-close
        >
          <Icon name="x" size={18} />
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
      <div
        class="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[minmax(20rem,0.85fr)_minmax(0,1.15fr)] lg:items-start"
      >
        <div class="space-y-4 lg:sticky lg:top-4">
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

          <section
            class="section-card-strong rounded-xl p-4 sm:p-5"
            aria-label="Actions rapides mission"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="text-base font-semibold text-text-primary">Transformer la décision</h3>
                <p class="mt-1 text-sm leading-6 text-text-subtle">
                  Gardez le contrôle avant de sortir vers la plateforme source.
                </p>
              </div>
              <div class="shrink-0 text-right">
                <span
                  class="inline-flex rounded-lg border border-border-light bg-page-canvas px-2.5 py-1.5 text-[11px] font-medium text-text-subtle"
                >
                  {trackingBadgeLabel}
                </span>
                {#if trackingReady && trackingUpdatedLabel}
                  <p class="mt-1 text-[10px] text-text-muted">Modifié {trackingUpdatedLabel}</p>
                {/if}
              </div>
            </div>

            <div class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <button
                type="button"
                class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-blueprint-blue/25 bg-blueprint-blue/8 px-3 text-sm font-semibold text-blueprint-blue transition-colors hover:border-blueprint-blue/40 hover:bg-blueprint-blue/12 disabled:cursor-not-allowed disabled:opacity-45"
                onclick={handleSelectForTracking}
                disabled={trackingState === 'loading' || (trackingReady && !canSelectForTracking)}
                aria-label={trackingActionLabel}
              >
                <Icon name="list-checks" size={14} />
                {trackingActionLabel}
              </button>
              <button
                type="button"
                class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border-light bg-surface-white px-3 text-sm font-semibold text-text-primary transition-colors hover:bg-subtle-gray"
                onclick={handleOpenForTracking}
              >
                <Icon name="external-link" size={14} />
                Ouvrir pour postuler
              </button>
              <button
                type="button"
                class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border-light bg-surface-white px-3 text-sm font-semibold text-text-primary transition-colors hover:bg-subtle-gray disabled:cursor-not-allowed disabled:opacity-45 {isCompared
                  ? 'border-blueprint-blue/25 bg-blueprint-blue/8 text-blueprint-blue'
                  : ''}"
                onclick={handleToggleCompare}
                disabled={compareDisabled && !isCompared}
                aria-pressed={isCompared}
              >
                <Icon name="git-compare-arrows" size={14} />
                {isCompared ? 'Retirer comparaison' : 'Comparer'}
              </button>
              <button
                type="button"
                class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border-light bg-surface-white px-3 text-sm font-semibold text-text-primary transition-colors hover:bg-subtle-gray hover:text-status-red"
                onclick={() => onHide?.()}
                aria-pressed={isHidden}
              >
                <Icon name={isHidden ? 'eye' : 'x-circle'} size={14} />
                {isHidden ? 'Restaurer' : 'Masquer'}
              </button>
            </div>
            {#if trackingState === 'error' && trackingError}
              <p class="mt-2 text-xs leading-5 text-status-red" role="status">{trackingError}</p>
            {/if}
          </section>
        </div>

        <div class="space-y-4">
          <section class="section-card-strong rounded-xl p-4 sm:p-5">
            <h3 class="text-base font-semibold text-text-primary">Preuves principales</h3>
            <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {#each missionFacts as fact, i (i)}
                <div class="rounded-lg bg-page-canvas px-3 py-3">
                  <p
                    class="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.13em] text-text-muted"
                  >
                    <Icon name={fact.icon} size={11} />
                    {fact.label}
                  </p>
                  <p class="mt-1.5 break-words text-sm font-medium text-text-primary">
                    {fact.value}
                  </p>
                </div>
              {/each}
            </div>
          </section>

          {#if visibleStack.length > 0}
            <section class="section-card rounded-xl p-4 sm:p-5">
              <h3 class="text-base font-semibold text-text-primary">Compétences détectées</h3>
              <div class="mt-3 flex flex-wrap gap-2">
                {#each visibleStack as skill (skill)}
                  <span
                    class="rounded-lg border border-border-light bg-surface-white px-2.5 py-1.5 text-xs font-medium text-text-secondary"
                  >
                    {skill}
                  </span>
                {/each}
              </div>
            </section>
          {/if}

          {#if scoreLines.length > 0}
            <section class="section-card rounded-xl p-4 sm:p-5">
              <details
                class="rounded-lg border border-blueprint-blue/15 bg-blueprint-blue/5 px-3 py-2"
              >
                <summary class="cursor-pointer text-sm font-semibold text-blueprint-blue">
                  Pourquoi ce score ?
                </summary>
                <p class="mt-2 text-sm leading-6 text-text-secondary">
                  Score final {mission.scoreBreakdown?.total ?? score}/100, calculé depuis le
                  profil, l’annonce et les critères ci-dessous.
                </p>
                {#if mission.scoreBreakdown}
                  <p class="mt-2 text-xs leading-5 text-text-subtle">
                    Base de score {mission.scoreBreakdown.deterministic}/100. L’analyse locale,
                    quand elle existe, ajoute une hypothèse non bloquante.
                  </p>
                  {#if mission.scoreBreakdown.semanticReason}
                    <p class="mt-2 text-xs leading-5 text-blueprint-blue">
                      {mission.scoreBreakdown.semanticReason}
                    </p>
                  {/if}
                {/if}
              </details>
              <h3 class="mt-5 text-base font-semibold text-text-primary">Score par critère</h3>
              <div class="mt-3 grid gap-2 sm:grid-cols-2">
                {#each scoreLines as line, i (i)}
                  {@const grade = scoreToGrade(line.value)}
                  <div
                    class="flex items-center justify-between gap-3 rounded-lg bg-page-canvas px-3 py-3"
                  >
                    <span class="text-sm text-text-subtle">{line.label}</span>
                    <span class="font-mono text-sm font-semibold text-text-primary">
                      {grade} · {line.value}
                    </span>
                  </div>
                {/each}
              </div>
            </section>
          {/if}

          {#if mission.description}
            <section class="section-card rounded-xl p-4 sm:p-5">
              <h3 class="text-base font-semibold text-text-primary">Détails techniques</h3>
              <p class="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-subtle">
                {mission.description}
              </p>
            </section>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>
