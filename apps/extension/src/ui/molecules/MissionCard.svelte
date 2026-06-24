<script lang="ts">
  import { slide } from 'svelte/transition';
  import type { Mission } from '$lib/core/types/mission';
  import type { ApplicationStatus } from '$lib/core/types/tracking';
  import { STATUS_LABELS, STATUS_VARIANTS, VALID_TRANSITIONS } from '$lib/core/types/tracking';
  import { Badge } from '@pulse/ui';
  import { Icon } from '@pulse/ui';
  import { scoreToGrade } from '$lib/core/types/score';
  import { ripple } from '../actions/ripple';
  import { onVisible as onVisibleAction } from '../actions/on-visible';
  import Tooltip from '../atoms/Tooltip.svelte';

  const {
    mission,
    isSeen = true,
    isFavorite = false,
    isHidden = false,
    isCompared = false,
    compareDisabled = false,
    isVirtualized = false,
    tourHighlight = null,
    onVisible: onVisibleCallback,
    onToggleFavorite,
    onHide,
    onToggleCompare,
    onCopyLink,
    onOpenLink,
    onInvestigate,
    trackingStatus = null as ApplicationStatus | null,
    onStatusTransition = null as ((status: ApplicationStatus) => void) | null,
  }: {
    mission: Mission;
    isSeen?: boolean;
    isFavorite?: boolean;
    isHidden?: boolean;
    isCompared?: boolean;
    compareDisabled?: boolean;
    isVirtualized?: boolean;
    tourHighlight?: 'score' | 'expand' | 'seen' | 'filters' | null;
    onVisible?: () => void;
    onToggleFavorite?: () => void;
    onHide?: () => void;
    onToggleCompare?: () => void;
    onCopyLink?: () => void;
    onOpenLink?: (url: string) => void;
    onInvestigate?: () => void;
    trackingStatus?: ApplicationStatus | null;
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

  const decisionInsight = $derived.by(() => {
    if (scoreValue >= 80) {
      return {
        label: 'Action recommandee',
        text:
          mission.tjm !== null
            ? `Qualifier en priorite: score fort et TJM ${mission.tjm}€/j.`
            : 'Qualifier en priorite: score fort, TJM a verifier dans l annonce.',
        tone: 'border-accent-green/20 bg-accent-green/8 text-accent-green',
      };
    }

    if ((mission.scoreBreakdown?.criteria.tjm ?? 100) < 60) {
      return {
        label: 'Point de vigilance',
        text: 'TJM sous votre cible: gardez cette mission seulement si le contexte compense.',
        tone: 'border-status-orange/20 bg-status-orange/8 text-status-orange',
      };
    }

    if (scoreValue >= 60) {
      return {
        label: 'A comparer',
        text: 'Potentiel correct: comparez avec les missions 80+ avant de postuler.',
        tone: 'border-status-yellow/30 bg-status-yellow/12 text-status-orange',
      };
    }

    return {
      label: 'A qualifier',
      text: 'Priorite faible: ouvrez seulement si la source ou le client est strategique.',
      tone: 'border-border-light bg-page-canvas text-text-subtle',
    };
  });

  const scoreColor = $derived(
    scoreValue >= 80
      ? 'text-accent-green bg-accent-green/10'
      : scoreValue >= 50
        ? 'text-accent-amber bg-accent-amber/10'
        : 'text-text-muted bg-page-canvas'
  );

  function barColor(value: number): string {
    const grade = scoreToGrade(value);
    return grade === 'A'
      ? 'bg-blueprint-blue'
      : grade === 'B'
        ? 'bg-accent-amber'
        : 'bg-status-red';
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

<div
  use:ripple
  use:onVisibleAction={() => onVisibleCallback?.()}
  class="group relative cursor-pointer rounded-xl border border-border-light bg-surface-white p-5 transition-all duration-200 ease-out hover:border-disabled-gray {isSeen
    ? ''
    : 'border-blueprint-blue/20'} {isHidden ? 'opacity-50' : ''} {tourHighlight === 'seen'
    ? 'ring-2 ring-blueprint-blue/40 ring-offset-2 ring-offset-page-canvas'
    : ''}"
  style="contain: layout style paint;"
  onclick={toggleExpand}
  role="button"
  tabindex="0"
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleExpand();
    }
  }}
>
  <!-- Header row -->
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-1.5">
        <Badge label={mission.source} variant="source" />
        {#if trackingStatus}
          <Badge label={STATUS_LABELS[trackingStatus]} variant={STATUS_VARIANTS[trackingStatus]} />
        {/if}
        {#if !isSeen}
          <span
            class="inline-flex items-center rounded-full bg-blueprint-blue/8 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-blueprint-blue"
          >
            Nouveau
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
      <h3 class="mt-2 text-[0.9375rem] font-medium leading-snug text-text-primary">
        {mission.title}
      </h3>
      {#if mission.client}
        <p class="mt-1 text-xs text-text-subtle">{mission.client}</p>
      {/if}
    </div>
    <div class="flex shrink-0 items-center gap-2">
      {#if mission.scoreBreakdown}
        <span
          class="rounded-lg px-2 py-1 text-[11px] font-mono font-semibold {scoreColor} {tourHighlight ===
          'score'
            ? 'ring-2 ring-blueprint-blue/40 ring-offset-2 ring-offset-page-canvas'
            : ''}"
          >{mission.scoreBreakdown.grade}{#if mission.scoreBreakdown.semantic !== null}+{/if}</span
        >
      {:else if mission.score !== null}
        <span
          class="rounded-lg px-2 py-1 text-[11px] font-mono font-semibold {scoreColor} {tourHighlight ===
          'score'
            ? 'ring-2 ring-blueprint-blue/40 ring-offset-2 ring-offset-page-canvas'
            : ''}">{mission.score}</span
        >
      {/if}
      <div
        class="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors group-hover:text-text-primary {tourHighlight ===
        'expand'
          ? 'ring-2 ring-blueprint-blue/40 ring-offset-2 ring-offset-page-canvas'
          : ''}"
      >
        <Icon
          name="chevron-down"
          size={14}
          class="transition-transform duration-200 {expanded ? 'rotate-180' : ''}"
        />
      </div>
    </div>
  </div>

  <!-- Tags -->
  <div class="mt-3 flex flex-wrap gap-1.5">
    {#each mission.stack.slice(0, 3) as tech}
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
              Score final {scoreDisplayValue}/100, calculé depuis le profil, l'annonce et les
              critères disponibles.
            {:else}
              L'explication disponible vient du signal sémantique conservé localement.
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
        Les critères sont des faits calculés. L'IA sémantique, quand elle existe, ajoute une
        hypothèse locale et reste non bloquante.
      </p>

      {#if mission.scoreBreakdown}
        {@const lines = [
          { label: 'Compétences', value: mission.scoreBreakdown.criteria.stack },
          { label: 'TJM', value: mission.scoreBreakdown.criteria.tjm },
          { label: 'Localisation', value: mission.scoreBreakdown.criteria.location },
          { label: 'Mode de travail', value: mission.scoreBreakdown.criteria.remote },
        ]}
        <div class="mt-3 space-y-1.5">
          {#each lines as line}
            {@const grade = scoreToGrade(line.value)}
            {@const color =
              grade === 'A'
                ? 'bg-accent-green text-surface-white'
                : grade === 'B'
                  ? 'bg-accent-amber text-surface-white'
                  : grade === 'C'
                    ? 'bg-status-orange text-surface-white'
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
                class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blueprint-blue text-surface-white text-[10px] font-bold font-mono"
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

  <!-- Detail grid -->
  {#if expanded}
    <div class="mt-4 border-t border-border-light pt-4">
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
    </div>
  {/if}

  <!-- Actions — always visible, subtle until hover -->
  <div class="mt-3 flex items-center justify-between">
    <div class="flex gap-1">
      <Tooltip
        label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        description={isFavorite
          ? 'La mission ne sera plus priorisee dans vos vues.'
          : 'Gardez cette mission dans les opportunites a suivre.'}
      >
        <button
          class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-subtle-gray hover:text-text-primary {isFavorite
            ? 'text-blueprint-blue hover:text-blueprint-blue'
            : ''}"
          onclick={handleToggleFavorite}
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
          : 'Retirez cette opportunite du flux decisionnel.'}
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
        label={copied ? 'Lien copie' : 'Copier le lien'}
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
        description="Passez a la plateforme source pour verifier ou postuler."
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

  {#if trackingStatus && availableTransitions.length > 0 && onStatusTransition}
    <div class="mt-3 flex flex-wrap gap-1.5">
      {#each availableTransitions as nextStatus}
        {@const label = STATUS_LABELS[nextStatus]}
        {@const variant = STATUS_VARIANTS[nextStatus]}
        <button
          class="inline-flex items-center gap-1 rounded-lg bg-page-canvas px-2.5 py-1 text-[11px] text-text-secondary transition-colors duration-150 hover:bg-subtle-gray hover:text-text-primary"
          onclick={(e) => {
            e.stopPropagation();
            onStatusTransition?.(nextStatus);
          }}
        >
          {label}
        </button>
      {/each}
    </div>
  {/if}

  {#if expanded && mission.description}
    {#if isVirtualized}
      <div class="mt-4 border-t border-border-light pt-4">
        <p class="text-xs leading-relaxed text-text-subtle">{mission.description}</p>
      </div>
    {:else}
      <div transition:slide={{ duration: 200 }}>
        <div class="mt-4 border-t border-border-light pt-4">
          <p class="text-xs leading-relaxed text-text-subtle">{mission.description}</p>
        </div>
      </div>
    {/if}
  {/if}
</div>
