<script lang="ts">
  import { slide } from 'svelte/transition';
  import type { Mission } from '$lib/core/types/mission';
  import type { MissionDwellSignal } from '$lib/core/feed/mission-arrival-queue';
  import type { ApplicationStatus } from '$lib/core/types/tracking';
  import { STATUS_LABELS, STATUS_VARIANTS, VALID_TRANSITIONS } from '$lib/core/types/tracking';
  import { Badge } from '@pulse/ui';
  import { Icon } from '@pulse/ui';
  import { scoreToGrade } from '$lib/core/types/score';
  import { onVisible as onVisibleAction } from '../actions/on-visible';
  import Tooltip from '../atoms/Tooltip.svelte';

  const {
    mission,
    isSeen = true,
    isFavorite = false,
    isFavoritePending = false,
    isHidden = false,
    isCompared = false,
    compareDisabled = false,
    isVirtualized = false,
    showSeenStatus = false,
    tourHighlight = null,
    onVisible: onVisibleCallback,
    onReadSignal,
    onToggleFavorite,
    onHide,
    onToggleCompare,
    onCopyLink,
    onOpenLink,
    onInvestigate,
    trackingStatus = null as ApplicationStatus | null,
    trackingUpdatedAt = null as number | null,
    isStatusTransitionPending = false,
    onStatusTransition = null as ((status: ApplicationStatus) => void) | null,
  }: {
    mission: Mission;
    isSeen?: boolean;
    isFavorite?: boolean;
    isFavoritePending?: boolean;
    isHidden?: boolean;
    isCompared?: boolean;
    compareDisabled?: boolean;
    isVirtualized?: boolean;
    showSeenStatus?: boolean;
    tourHighlight?: 'score' | 'expand' | 'seen' | 'filters' | null;
    onVisible?: () => void;
    onReadSignal?: (signal: MissionDwellSignal) => void;
    onToggleFavorite?: () => void;
    onHide?: () => void;
    onToggleCompare?: () => void;
    onCopyLink?: () => void;
    onOpenLink?: (url: string) => void;
    onInvestigate?: () => void;
    trackingStatus?: ApplicationStatus | null;
    trackingUpdatedAt?: number | null;
    isStatusTransitionPending?: boolean;
    onStatusTransition?: ((status: ApplicationStatus) => void) | null;
  } = $props();

  let expanded = $state(false);
  let scoreDetailsOpen = $state(false);

  const seniorityLabels: Record<string, string> = {
    junior: 'Junior (0-2 ans)',
    confirmed: 'Confirmé (3-7 ans)',
    senior: 'Senior (7+ ans)',
  };

  const seniorityLabel = $derived(
    mission.seniority ? (seniorityLabels[mission.seniority] ?? mission.seniority) : null
  );

  const availableTransitions = $derived(
    trackingStatus ? (VALID_TRANSITIONS[trackingStatus] ?? []) : []
  );
  const trackingUpdatedLabel = $derived(formatTrackingTimestamp(trackingUpdatedAt));

  const scoreValue = $derived(mission.scoreBreakdown?.total ?? mission.score ?? 0);
  const scoreDisplayValue = $derived(
    mission.scoreBreakdown?.total ?? mission.score ?? mission.semanticScore
  );
  const semanticDisplayValue = $derived(mission.scoreBreakdown?.semantic ?? mission.semanticScore);
  const semanticReason = $derived(mission.scoreBreakdown?.semanticReason ?? mission.semanticReason);
  const hasScoreDetails = $derived(
    mission.scoreBreakdown !== null ||
      mission.score !== null ||
      mission.semanticScore !== null ||
      Boolean(semanticReason)
  );
  const scoreDetailsId = $derived(
    `mission-score-details-${mission.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  );

  function stableIdHash(value: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  const missionDetailsId = $derived(
    `mission-details-m-${
      mission.id
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 53) || 'mission'
    }-${stableIdHash(mission.id)}`
  );

  const decisionInsight = $derived.by(() => {
    if (scoreValue >= 80) {
      return {
        label: 'Action recommandée',
        text:
          mission.tjm !== null
            ? `À examiner en premier : score fort et TJM ${mission.tjm}€/j.`
            : 'À examiner en premier : score fort, TJM à vérifier dans l’annonce.',
        tone: 'border-accent-green/20 bg-accent-green/10 text-text-primary',
      };
    }

    if ((mission.scoreBreakdown?.criteria.tjm ?? 100) < 60) {
      return {
        label: 'Point de vigilance',
        text: 'TJM sous votre cible : gardez cette mission seulement si le contexte compense.',
        tone: 'border-status-orange/20 bg-status-orange/10 text-text-primary',
      };
    }

    if (scoreValue >= 60) {
      return {
        label: 'À comparer',
        text: 'Potentiel correct : comparez avec les missions 80+ avant de postuler.',
        tone: 'border-status-yellow/30 bg-status-yellow/12 text-text-primary',
      };
    }

    return {
      label: 'À qualifier',
      text: 'Priorité faible : ouvrez seulement si la source ou le client est stratégique.',
      tone: 'border-border-light bg-subtle-gray text-text-subtle',
    };
  });

  // Tier hue carried by the background tint; glyph stays neutral for WCAG AA.
  // Low tier is intentionally de-emphasized (subtle text on a calm neutral block).
  const scoreColor = $derived(
    scoreValue >= 80
      ? 'text-text-primary bg-accent-green/15'
      : scoreValue >= 50
        ? 'text-text-primary bg-accent-amber/15'
        : 'text-text-subtle bg-subtle-gray'
  );

  function barColor(value: number): string {
    const grade = scoreToGrade(value);
    return grade === 'A'
      ? 'bg-blueprint-blue'
      : grade === 'B'
        ? 'bg-accent-amber'
        : 'bg-status-red';
  }

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

  function toggleExpand() {
    expanded = !expanded;
  }

  function handleScoreDetailsToggle(e: MouseEvent) {
    e.stopPropagation();
    scoreDetailsOpen = !scoreDetailsOpen;
  }

  let copied = $state(false);

  function handleCopyLink(e: MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(mission.url).catch(() => {});
    copied = true;
    onCopyLink?.();
    setTimeout(() => {
      copied = false;
    }, 1500);
  }

  function handleToggleFavorite(e: MouseEvent) {
    e.stopPropagation();
    onToggleFavorite?.();
  }

  function handleHide(e: MouseEvent) {
    e.stopPropagation();
    onHide?.();
  }

  function handleToggleCompare(e: MouseEvent) {
    e.stopPropagation();
    if (compareDisabled && !isCompared) {
      return;
    }
    onToggleCompare?.();
  }

  function handleOpenLink(e: MouseEvent) {
    e.stopPropagation();
    onOpenLink?.(mission.url);
  }

  function handleInvestigate(e: MouseEvent) {
    e.stopPropagation();
    onInvestigate?.();
  }
</script>

<article
  use:onVisibleAction={{
    disabled: isSeen,
    onSignal: (signal) => {
      onReadSignal?.(signal);
      if (signal.type === 'elapsed' && !onReadSignal) {
        onVisibleCallback?.();
      }
    },
  }}
  class="group relative rounded-xl border border-border-light bg-surface-white p-5 transition-all duration-200 ease-out hover:border-disabled-gray {isSeen
    ? ''
    : 'border-blueprint-blue/20'} {isHidden ? 'opacity-50' : ''} {tourHighlight === 'seen'
    ? 'ring-2 ring-blueprint-blue/40 ring-offset-2 ring-offset-page-canvas'
    : ''}"
  style="contain: layout style paint;"
  aria-label={`Mission ${mission.title} chez ${mission.client || 'client non précisé'}`}
>
  <!-- Header row -->
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-1.5">
        <Badge label={mission.source} variant="source" />
        {#if trackingStatus}
          <Badge
            label={STATUS_LABELS[trackingStatus]}
            variant={STATUS_VARIANTS[trackingStatus] as 'source'}
          />
          {#if trackingUpdatedLabel}
            <span
              class="inline-flex items-center rounded-full bg-page-canvas px-2 py-0.5 text-[10px] font-medium text-text-muted"
            >
              Modifié {trackingUpdatedLabel}
            </span>
          {/if}
        {/if}
        {#if !isSeen}
          <span
            class="inline-flex items-center rounded-full bg-blueprint-blue/8 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-blueprint-blue"
          >
            Nouveau
          </span>
        {:else if showSeenStatus}
          <span
            class="inline-flex items-center rounded-full bg-subtle-gray px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-subtle"
          >
            Vu
          </span>
        {/if}
        {#if mission.remote}
          <span
            class="inline-flex items-center rounded-full border border-border-light px-2 py-0.5 text-[10px] capitalize text-text-subtle"
          >
            {mission.remote}
          </span>
        {/if}
      </div>
      <h3
        class="mt-2 line-clamp-2 break-words text-[0.9375rem] font-medium leading-snug text-text-primary"
        title={mission.title}
      >
        {mission.title}
      </h3>
      {#if mission.client}
        <p class="mt-1 line-clamp-1 break-words text-xs text-text-subtle" title={mission.client}>
          {mission.client}
        </p>
      {/if}
    </div>
    <div class="flex shrink-0 items-center gap-2">
      {#if mission.scoreBreakdown}
        <span
          class="inline-flex min-w-[2.25rem] items-center justify-center rounded-lg px-2.5 py-1 text-center text-[13px] font-mono font-bold tabular-nums leading-none {scoreColor} {tourHighlight ===
          'score'
            ? 'ring-2 ring-blueprint-blue/40 ring-offset-2 ring-offset-page-canvas'
            : ''}"
          >{mission.scoreBreakdown.grade}{#if mission.scoreBreakdown.semantic !== null}+{/if}</span
        >
      {:else if mission.score !== null}
        <span
          class="inline-flex min-w-[2.25rem] items-center justify-center rounded-lg px-2.5 py-1 text-center text-[13px] font-mono font-bold tabular-nums leading-none {scoreColor} {tourHighlight ===
          'score'
            ? 'ring-2 ring-blueprint-blue/40 ring-offset-2 ring-offset-page-canvas'
            : ''}">{mission.score}</span
        >
      {/if}
      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-subtle-gray hover:text-text-primary {tourHighlight ===
        'expand'
          ? 'ring-2 ring-blueprint-blue/40 ring-offset-2 ring-offset-page-canvas'
          : ''}"
        onclick={toggleExpand}
        aria-label={`${expanded ? 'Masquer' : 'Afficher'} les détails de la mission ${mission.title}`}
        aria-expanded={expanded}
        aria-controls={missionDetailsId}
      >
        <Icon
          name="chevron-down"
          size={12}
          class="transition-transform duration-200 {expanded ? 'rotate-180' : ''}"
        />
      </button>
    </div>
  </div>

  <!-- Tags -->
  <div class="mt-3 flex flex-wrap gap-1.5">
    {#each mission.stack.slice(0, 3) as tech (tech)}
      <Badge label={tech} variant="tech" />
    {/each}
    {#if mission.stack.length > 3}
      <Badge label="+{mission.stack.length - 3}" variant="source" />
    {/if}
    {#if semanticReason}
      <span
        class="inline-flex items-center gap-1 rounded-full border border-blueprint-blue/15 bg-blueprint-blue/5 px-2 py-0.5 text-[10px] text-blueprint-blue"
      >
        {semanticReason}
      </span>
    {/if}
  </div>

  {#if mission.description && !expanded}
    <p class="mt-3 line-clamp-2 text-xs leading-relaxed text-text-subtle">
      {mission.description}
    </p>
  {/if}

  <div class="mt-3 rounded-lg border px-3 py-2 {decisionInsight.tone}">
    <p class="text-[9px] font-semibold uppercase tracking-[0.13em]">{decisionInsight.label}</p>
    <p class="mt-1 text-[11px] leading-4 text-text-secondary">{decisionInsight.text}</p>
  </div>

  {#if hasScoreDetails}
    <button
      type="button"
      class="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-text-subtle transition-colors hover:bg-page-canvas hover:text-blueprint-blue"
      onclick={handleScoreDetailsToggle}
      onkeydown={(e) => e.stopPropagation()}
      aria-expanded={scoreDetailsOpen}
      aria-controls={scoreDetailsId}
    >
      <Icon name="help-circle" size={13} />
      <span>Pourquoi ce score ?</span>
      <Icon
        name="chevron-down"
        size={12}
        class="transition-transform duration-150 {scoreDetailsOpen ? 'rotate-180' : ''}"
      />
    </button>
  {/if}

  <!-- Score breakdown — explicit disclosure for quick scan state -->
  {#if scoreDetailsOpen && hasScoreDetails}
    <div
      id={scoreDetailsId}
      class="mt-3 rounded-lg border border-blueprint-blue/15 bg-blueprint-blue/5 p-3"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-blueprint-blue">
            Score expliqué
          </p>
          <p class="mt-1 text-[11px] leading-4 text-text-secondary">
            {#if scoreDisplayValue !== null}
              Score final {scoreDisplayValue}/100, calculé depuis le profil, l’annonce et les
              critères disponibles.
            {:else}
              L’explication disponible vient de l’analyse locale conservée sur l’appareil.
            {/if}
          </p>
        </div>
        {#if mission.scoreBreakdown}
          <span
            class="shrink-0 rounded-md bg-surface-white px-2 py-1 font-mono text-[10px] font-semibold text-text-primary"
          >
            Base {mission.scoreBreakdown.deterministic}
          </span>
        {/if}
      </div>
      <p class="mt-2 text-[10px] leading-4 text-text-subtle">
        Les critères sont calculés depuis l’annonce et votre profil. L’analyse locale, quand elle
        existe, ajoute une hypothèse courte et reste facultative.
      </p>

      {#if mission.scoreBreakdown}
        {@const lines = [
          { label: 'Compétences', value: mission.scoreBreakdown.criteria.stack },
          { label: 'TJM', value: mission.scoreBreakdown.criteria.tjm },
          { label: 'Localisation', value: mission.scoreBreakdown.criteria.location },
          { label: 'Mode de travail', value: mission.scoreBreakdown.criteria.remote },
        ]}
        <div class="mt-3 space-y-1.5">
          {#each lines as line, i (i)}
            {@const grade = scoreToGrade(line.value)}
            {@const color =
              grade === 'A'
                ? 'bg-accent-green text-[#0c0a09]'
                : grade === 'B'
                  ? 'bg-accent-amber text-[#0c0a09]'
                  : grade === 'C'
                    ? 'bg-status-orange text-[#0c0a09]'
                    : 'bg-disabled-gray text-text-secondary'}
            <div class="flex items-center gap-2.5 py-0.5">
              <span class="text-[11px] text-text-subtle flex-1">{line.label}</span>
              <span
                class="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold font-mono {color}"
              >
                {grade}
              </span>
            </div>
          {/each}
          {#if semanticDisplayValue !== null}
            {@const sg = scoreToGrade(semanticDisplayValue)}
            <div class="flex items-center gap-2.5 py-0.5">
              <span class="text-[11px] text-blueprint-blue flex-1">IA sémantique</span>
              <span
                class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blueprint-blue-strong text-white text-[10px] font-bold font-mono"
              >
                {sg}
              </span>
            </div>
          {/if}
        </div>
      {:else}
        <p
          class="mt-3 rounded-md bg-surface-white px-3 py-2 text-[10px] leading-4 text-text-subtle"
        >
          Score historique conservé sans détail par critère. Relancez un scan pour reconstruire les
          critères stack, TJM, localisation et remote.
        </p>
      {/if}

      {#if semanticReason}
        <p class="pt-2 text-[10px] leading-snug text-blueprint-blue">
          {semanticReason}
        </p>
      {/if}
    </div>
  {/if}

  <!-- Inline details controlled by the scoped disclosure. -->
  {#if expanded}
    <div
      id={missionDetailsId}
      role="region"
      aria-label={`Détails de la mission ${mission.title}`}
      class="mt-4 border-t border-border-light pt-4"
      transition:slide={{ duration: isVirtualized ? 0 : 200 }}
    >
      <div class="grid grid-cols-2 gap-2 text-xs">
        {#if mission.tjm !== null}
          <div class="rounded-lg bg-page-canvas px-3 py-2.5">
            <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">TJM</p>
            <p class="mt-1 font-mono font-semibold tabular-nums text-text-primary">
              {mission.tjm}€<span class="text-text-muted">/j</span>
            </p>
          </div>
        {/if}
        {#if mission.location}
          <div class="rounded-lg bg-page-canvas px-3 py-2.5">
            <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">Zone</p>
            <p class="mt-1 truncate text-text-primary">{mission.location}</p>
          </div>
        {/if}
        {#if mission.duration}
          <div class="rounded-lg bg-page-canvas px-3 py-2.5">
            <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">Durée</p>
            <p class="mt-1 truncate text-text-primary">{mission.duration}</p>
          </div>
        {/if}
        {#if mission.startDate}
          <div class="rounded-lg bg-page-canvas px-3 py-2.5">
            <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">Début</p>
            <p class="mt-1 truncate text-text-primary">{mission.startDate}</p>
          </div>
        {/if}
        {#if seniorityLabel}
          <div class="rounded-lg bg-page-canvas px-3 py-2.5">
            <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">
              Séniorité
            </p>
            <p class="mt-1 truncate text-text-primary">{seniorityLabel}</p>
          </div>
        {/if}
        <div class="rounded-lg bg-page-canvas px-3 py-2.5">
          <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">Source</p>
          <p class="mt-1 truncate text-text-primary">{mission.source}</p>
        </div>
      </div>
      {#if mission.description}
        <div class="mt-4 border-t border-border-light pt-4">
          <p class="text-xs leading-relaxed text-text-subtle">{mission.description}</p>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Actions — always visible, subtle until hover -->
  <div class="mt-3 flex items-center justify-between">
    <div class="flex gap-1">
      <Tooltip
        label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        description={isFavorite
          ? 'La mission ne sera plus priorisée dans vos vues.'
          : 'Gardez cette mission dans les opportunités à suivre.'}
      >
        <button
          class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-subtle-gray hover:text-text-primary {isFavorite
            ? 'text-blueprint-blue hover:text-blueprint-blue'
            : ''}"
          onclick={handleToggleFavorite}
          disabled={isFavoritePending}
          aria-label={isFavorite
            ? 'Retirer la mission des favoris'
            : 'Ajouter la mission aux favoris'}
          aria-pressed={isFavorite}
        >
          <Icon name="star" size={13} class={isFavorite ? 'fill-blueprint-blue' : ''} />
        </button>
      </Tooltip>
      <Tooltip
        label={isHidden ? 'Restaurer la mission' : 'Masquer la mission'}
        description={isHidden
          ? 'La mission reviendra dans le feed actif.'
          : 'Retirez cette opportunité du flux décisionnel.'}
      >
        <button
          class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-subtle-gray hover:text-status-red"
          onclick={handleHide}
          aria-label={isHidden ? 'Restaurer la mission masquée' : 'Masquer la mission'}
        >
          <Icon name={isHidden ? 'eye' : 'x-circle'} size={13} />
        </button>
      </Tooltip>
      <Tooltip
        label={isCompared ? 'Retirer de la comparaison' : 'Comparer cette mission'}
        description={compareDisabled && !isCompared
          ? 'Trois missions sont déjà sélectionnées. Retirez-en une pour comparer celle-ci.'
          : 'Ajoutez cette mission à la sélection pour départager les opportunités.'}
      >
        <button
          class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-subtle-gray hover:text-blueprint-blue disabled:cursor-not-allowed disabled:opacity-40 {isCompared
            ? 'bg-blueprint-blue/8 text-blueprint-blue'
            : ''}"
          onclick={handleToggleCompare}
          disabled={compareDisabled && !isCompared}
          aria-label={isCompared
            ? 'Retirer la mission de la comparaison'
            : 'Ajouter la mission à la comparaison'}
          aria-pressed={isCompared}
        >
          <Icon name="git-compare-arrows" size={13} />
        </button>
      </Tooltip>
      <Tooltip
        label={copied ? 'Lien copié' : 'Copier le lien'}
        description="Partagez ou archivez la mission sans ouvrir la plateforme."
      >
        <button
          class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-subtle-gray hover:text-text-primary"
          onclick={handleCopyLink}
          aria-label={copied ? 'Lien copié' : 'Copier le lien de la mission'}
        >
          <Icon
            name={copied ? 'check' : 'link'}
            size={13}
            class={copied ? 'text-blueprint-blue' : ''}
          />
        </button>
      </Tooltip>
      <Tooltip
        label="Ouvrir la mission"
        description="Passez à la plateforme source pour vérifier ou postuler."
      >
        <button
          class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-subtle-gray hover:text-text-primary"
          onclick={handleOpenLink}
          aria-label="Ouvrir la mission sur la plateforme source"
        >
          <Icon name="external-link" size={13} />
        </button>
      </Tooltip>
    </div>
    <button
      type="button"
      class="text-[11px] font-medium text-text-muted transition-colors hover:text-blueprint-blue"
      onclick={handleInvestigate}
    >
      Investiguer →
    </button>
  </div>

  {#if trackingStatus}
    <div
      class="mt-3 flex flex-wrap gap-1.5"
      role="group"
      aria-label={`Statut de la mission ${mission.title}`}
      aria-busy={isStatusTransitionPending}
    >
      <span
        role="status"
        aria-label={`Statut actuel : ${STATUS_LABELS[trackingStatus]}`}
        class="sr-only"
      >
        Statut actuel : {STATUS_LABELS[trackingStatus]}
      </span>
      {#each availableTransitions as nextStatus, i (i)}
        {@const label = STATUS_LABELS[nextStatus]}
        {#if onStatusTransition}
          <button
            class="inline-flex items-center gap-1 rounded-lg bg-page-canvas px-2.5 py-1 text-[11px] text-text-secondary transition-colors duration-150 hover:bg-subtle-gray hover:text-text-primary disabled:cursor-wait disabled:opacity-50"
            onclick={() => onStatusTransition?.(nextStatus)}
            aria-label={`Passer le statut à ${label}`}
            disabled={isStatusTransitionPending}
          >
            {label}
          </button>
        {/if}
      {/each}
    </div>
  {/if}
</article>
