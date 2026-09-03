<script lang="ts">
  import { slide } from 'svelte/transition';
  import type { Mission } from '$lib/core/types/mission';
  import type { MissionDwellSignal } from '$lib/core/feed/mission-arrival-queue';
  import type { ApplicationStatus } from '$lib/core/types/tracking';
  import { STATUS_LABELS, STATUS_VARIANTS, VALID_TRANSITIONS } from '$lib/core/types/tracking';
  import { Badge } from '@pulse/ui';
  import { Icon } from '@pulse/ui';
  import { getMissionGrade } from '$lib/core/scoring/mission-grade';
  import { scoreToGrade } from '$lib/core/types/score';
  import { formatAbsoluteDate, formatTJMValue, formatTimestamp } from '$lib/core/utils/format';
  import { parseIsoDateTimeToEpochMs } from '$lib/core/utils/iso-time';
  import { onVisible as onVisibleAction } from '../actions/on-visible';
  import { swipe } from '../actions/swipe';
  import Tooltip, { type TooltipTriggerState } from '../atoms/Tooltip.svelte';

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

  // Replié par défaut : le scan rapide du feed prime. Densité compacte :
  // paddings et marges verticales réduits, cible d'action 32px. La barre
  // d'actions unique garde les six actions visibles même replié ; déplier
  // n'ajoute que la description (localisation, séniorité et date de
  // publication vivent dans la ligne de scan rapide, la source en badge
  // d'en-tête).
  let expanded = $state(false);
  let scoreDetailsOpen = $state(false);

  // Swipe-to-triage (models/mission-card-swipe.model.md): presentation
  // shortcut over the existing favorite/hide callbacks — never a new workflow.
  const swipeParams = $derived({
    onSwipeRight: () => onToggleFavorite?.(),
    onSwipeLeft: () => onHide?.(),
    enabled: Boolean(onToggleFavorite) && Boolean(onHide) && !isCompared,
  });

  const seniorityLabels: Record<string, string> = {
    junior: 'Junior (0-2 ans)',
    confirmed: 'Confirmé (3-7 ans)',
    senior: 'Senior (7+ ans)',
  };

  const seniorityLabel = $derived(
    mission.seniority ? (seniorityLabels[mission.seniority] ?? mission.seniority) : null
  );

  const tjmValue = $derived(formatTJMValue(mission.tjm));

  // Publication date — same disclosure rule as seniority: omitted (never
  // "null"/"Invalid Date") when missing or not ISO-parsable. Pure core
  // formatting keeps the card mock-free testable.
  const publishedLabel = $derived(formatPublishedDate(mission.publishedAt));

  const availableTransitions = $derived(
    trackingStatus ? (VALID_TRANSITIONS[trackingStatus] ?? []) : []
  );
  const trackingUpdatedLabel = $derived(formatTrackingTimestamp(trackingUpdatedAt));

  const missionGrade = $derived(getMissionGrade(mission));
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

  // Tier hue carried by the background tint; glyph stays neutral for WCAG AA.
  // Low tier is intentionally de-emphasized (subtle text on a calm neutral block).
  const scoreColor = $derived(
    missionGrade === 'A'
      ? 'bg-accent-green/15 ring-1 ring-inset ring-accent-green/40'
      : missionGrade === 'B'
        ? 'bg-accent-amber/15 ring-1 ring-inset ring-accent-amber/40'
        : 'bg-subtle-gray ring-1 ring-inset ring-disabled-gray/50'
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
    return formatTimestamp(timestamp);
  }

  function formatPublishedDate(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }
    const epochMs = parseIsoDateTimeToEpochMs(value);
    if (epochMs === null) {
      return null;
    }
    return formatAbsoluteDate(epochMs, { style: 'medium' });
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
    navigator.clipboard
      .writeText(mission.url)
      .then(() => {
        copied = true;
        onCopyLink?.();
        setTimeout(() => {
          copied = false;
        }, 1500);
      })
      .catch(() => {
        // Clipboard write rejected (permissions/focus): stay silent, no false "copied".
      });
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
  use:swipe={swipeParams}
  use:onVisibleAction={{
    disabled: isSeen,
    onSignal: (signal) => {
      onReadSignal?.(signal);
      if (signal.type === 'elapsed' && !onReadSignal) {
        onVisibleCallback?.();
      }
    },
  }}
  class="group relative rounded-xl border border-border-light bg-surface-white px-3 py-2.5 transition-all duration-200 ease-out hover:border-disabled-gray {isSeen
    ? ''
    : 'border-blueprint-blue/20'} {isHidden ? 'opacity-50' : ''} {tourHighlight === 'seen'
    ? 'ring-2 ring-blueprint-blue/40 ring-offset-2 ring-offset-page-canvas'
    : ''}"
  style="contain: layout style paint;"
  aria-label={`Mission ${mission.title || 'sans titre'} chez ${mission.client || 'client non précisé'}`}
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
              class="inline-flex items-center rounded-full bg-page-canvas px-2 py-0.5 text-micro font-medium text-text-subtle"
            >
              Modifié {trackingUpdatedLabel}
            </span>
          {/if}
        {/if}
        {#if !isSeen}
          <span
            class="inline-flex items-center rounded-full bg-blueprint-blue/8 px-2 py-0.5 eyebrow text-blueprint-blue-on-tint"
          >
            Nouveau
          </span>
        {:else if showSeenStatus}
          <span
            class="inline-flex items-center rounded-full bg-subtle-gray px-2 py-0.5 eyebrow eyebrow--subtle"
          >
            Vu
          </span>
        {/if}
        {#if mission.remote}
          <span
            class="inline-flex items-center rounded-full border border-border-light px-2 py-0.5 text-micro capitalize text-text-subtle"
          >
            {mission.remote}
          </span>
        {/if}
      </div>
      <h3
        class="mt-1 line-clamp-2 break-words text-subheading font-medium leading-snug text-text-primary"
        title={mission.title}
      >
        {mission.title}
      </h3>
      {#if mission.client}
        <p
          class="mt-0.5 line-clamp-1 break-words text-meta text-text-subtle"
          title={mission.client}
        >
          {mission.client}
        </p>
      {/if}
    </div>
    <div class="flex shrink-0 items-center gap-1.5">
      {#if missionGrade !== null}
        <span
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-heading font-bold leading-none text-text-primary {scoreColor} {tourHighlight ===
          'score'
            ? 'ring-2 ring-blueprint-blue/40 ring-offset-2 ring-offset-page-canvas'
            : ''}"
          aria-label={`Note ${missionGrade}`}
          title={`Note ${missionGrade}`}
        >
          {missionGrade}
        </span>
      {/if}
      {#if mission.description}
        <button
          type="button"
          class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-subtle-gray hover:text-text-primary {tourHighlight ===
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
      {/if}
    </div>
  </div>

  <!-- Tags -->
  <div class="mt-1.5 flex flex-wrap gap-1.5">
    {#each mission.stack.slice(0, 3) as tech (tech)}
      <Badge label={tech} variant="tech" />
    {/each}
    {#if mission.stack.length > 3}
      <Badge label="+{mission.stack.length - 3}" variant="source" />
    {/if}
    {#if semanticReason}
      <span
        class="inline-flex items-center gap-1 rounded-full border border-blueprint-blue/15 bg-blueprint-blue/5 px-2 py-0.5 text-micro text-blueprint-blue"
      >
        {semanticReason}
      </span>
    {/if}
  </div>

  <!-- Quick-scan line: TJM (scoring driver) + location + seniority + publication date, visible from collapse -->
  <div class="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 text-body">
    {#if tjmValue !== null}
      <span class="font-mono font-bold tabular-nums text-text-primary">
        {tjmValue}<span class="text-text-muted">/j</span>
      </span>
    {:else}
      <span class="text-text-muted">TJM à vérifier</span>
    {/if}
    {#if mission.location}
      <span class="text-text-muted" aria-hidden="true">•</span>
      <span class="text-text-secondary">{mission.location}</span>
    {/if}
    {#if seniorityLabel}
      <span class="text-text-muted" aria-hidden="true">•</span>
      <span class="text-text-secondary">{seniorityLabel}</span>
    {/if}
    {#if publishedLabel}
      <span class="text-text-muted" aria-hidden="true">•</span>
      <span class="text-text-secondary">
        Publiée {publishedLabel}
      </span>
    {/if}
  </div>

  {#if hasScoreDetails}
    <button
      type="button"
      class="mt-1 -mb-0.5 inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-caption text-text-subtle transition-colors hover:text-blueprint-blue"
      onclick={handleScoreDetailsToggle}
      onkeydown={(e) => e.stopPropagation()}
      aria-expanded={scoreDetailsOpen}
      aria-controls={scoreDetailsId}
    >
      <Icon name="help-circle" size={12} />
      <span>Pourquoi cette note ?</span>
      <Icon
        name="chevron-down"
        size={11}
        class="transition-transform duration-200 {scoreDetailsOpen ? 'rotate-180' : ''}"
      />
    </button>
  {/if}

  <!-- Score breakdown — explicit disclosure for quick scan state -->
  {#if scoreDetailsOpen && hasScoreDetails}
    <div
      id={scoreDetailsId}
      class="mt-2 rounded-lg border border-blueprint-blue/15 bg-blueprint-blue/5 p-2.5"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="eyebrow eyebrow--strong eyebrow--blue">Note expliquée</p>
          <p class="mt-1 text-caption leading-4 text-text-secondary">
            {#if missionGrade !== null}
              Note finale {missionGrade}, calculée depuis le profil, l’annonce et les critères
              disponibles.
            {:else}
              L’explication disponible vient de l’analyse locale conservée sur l’appareil.
            {/if}
          </p>
        </div>
        {#if mission.scoreBreakdown}
          <span
            class="shrink-0 rounded-md bg-surface-white px-2 py-1 font-mono text-micro font-semibold text-text-primary"
          >
            Base {scoreToGrade(mission.scoreBreakdown.deterministic)}
          </span>
        {/if}
      </div>
      <p class="mt-2 text-micro leading-4 text-text-subtle">
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
                ? 'bg-accent-green text-text-on-bright'
                : grade === 'B'
                  ? 'bg-accent-amber text-text-on-bright'
                  : grade === 'C'
                    ? 'bg-status-orange text-text-on-bright'
                    : 'bg-disabled-gray text-text-secondary'}
            <div class="flex items-center gap-2.5 py-0.5">
              <span class="text-caption text-text-subtle flex-1">{line.label}</span>
              <span
                class="inline-flex items-center justify-center w-5 h-5 rounded-full text-micro font-bold font-mono {color}"
              >
                {grade}
              </span>
            </div>
          {/each}
          {#if semanticDisplayValue !== null}
            {@const sg = scoreToGrade(semanticDisplayValue)}
            <div class="flex items-center gap-2.5 py-0.5">
              <span class="text-caption text-blueprint-blue flex-1">IA sémantique</span>
              <span
                class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blueprint-blue-strong text-white text-micro font-bold font-mono"
              >
                {sg}
              </span>
            </div>
          {/if}
        </div>
      {:else}
        <p class="mt-3 rounded-md bg-surface-white px-3 py-2 text-micro leading-4 text-text-subtle">
          Note historique conservée sans détail par critère. Relancez un scan pour reconstruire les
          critères stack, TJM, localisation et remote.
        </p>
      {/if}

      {#if semanticReason}
        <p class="pt-2 text-micro leading-snug text-blueprint-blue">
          {semanticReason}
        </p>
      {/if}
    </div>
  {/if}

  <!-- Inline details controlled by the scoped disclosure. -->
  {#if expanded && mission.description}
    <div
      id={missionDetailsId}
      role="region"
      aria-label={`Détails de la mission ${mission.title}`}
      class="mt-2 border-t border-border-light pt-2"
      transition:slide={{ duration: isVirtualized ? 0 : 200 }}
    >
      <p class="line-clamp-2 text-meta leading-relaxed text-text-subtle">
        {mission.description}
      </p>
    </div>
  {/if}

  {#if trackingStatus}
    <div
      class="mt-2 flex flex-wrap gap-1.5"
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
            class="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg border border-transparent bg-page-canvas px-2.5 text-caption text-text-secondary transition-colors duration-150 hover:border-border-light hover:bg-subtle-gray hover:text-text-primary active:border-transparent disabled:cursor-wait disabled:opacity-50"
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

  <!-- Action bar — single row, all actions in both card states. Wraps only
       on very narrow side panels rather than overflowing. -->
  <div class="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border-light pt-2">
    <Tooltip
      label={copied ? 'Lien copié' : 'Copier le lien'}
      description="Partagez ou archivez la mission sans ouvrir la plateforme."
    >
      {#snippet children(tooltip: TooltipTriggerState)}
        <button
          class="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-subtle-gray hover:text-text-primary active:bg-page-canvas"
          onclick={handleCopyLink}
          onkeydown={tooltip.onKeydown}
          aria-label={copied ? 'Lien copié' : 'Copier le lien de la mission'}
          aria-describedby={tooltip.isOpen ? tooltip.id : undefined}
        >
          <Icon
            name={copied ? 'check' : 'link'}
            size={13}
            class={copied ? 'text-blueprint-blue' : ''}
          />
        </button>
      {/snippet}
    </Tooltip>
    <Tooltip
      label="Ouvrir la mission"
      description="Passez à la plateforme source pour vérifier ou postuler."
    >
      {#snippet children(tooltip: TooltipTriggerState)}
        <button
          class="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-subtle-gray hover:text-text-primary active:bg-page-canvas"
          onclick={handleOpenLink}
          onkeydown={tooltip.onKeydown}
          aria-label="Ouvrir la mission sur la plateforme source"
          aria-describedby={tooltip.isOpen ? tooltip.id : undefined}
        >
          <Icon name="external-link" size={13} />
        </button>
      {/snippet}
    </Tooltip>
    <Tooltip
      label={isHidden ? 'Restaurer la mission' : 'Masquer la mission'}
      description={isHidden
        ? 'La mission reviendra dans le feed actif.'
        : 'Retirez cette mission du flux de décision.'}
    >
      {#snippet children(tooltip: TooltipTriggerState)}
        <button
          class="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-subtle-gray hover:text-status-red active:bg-page-canvas"
          onclick={handleHide}
          onkeydown={tooltip.onKeydown}
          aria-label={isHidden ? 'Restaurer la mission masquée' : 'Masquer la mission'}
          aria-describedby={tooltip.isOpen ? tooltip.id : undefined}
        >
          <Icon name={isHidden ? 'eye' : 'x-circle'} size={13} />
        </button>
      {/snippet}
    </Tooltip>
    <Tooltip
      label={isCompared ? 'Retirer de la comparaison' : 'Comparer cette mission'}
      description={compareDisabled && !isCompared
        ? 'Trois missions sont déjà sélectionnées. Retirez-en une pour comparer celle-ci.'
        : 'Ajoutez cette mission à la sélection pour départager les missions.'}
    >
      {#snippet children(tooltip: TooltipTriggerState)}
        <!-- aria-disabled (et non disabled) : le bouton reste focalisable pour
             que l'explication du blocage soit atteignable au clavier ; le
             handler garde l'action inactive. -->
        <button
          class="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-subtle-gray hover:text-blueprint-blue active:bg-page-canvas aria-disabled:cursor-not-allowed aria-disabled:opacity-40 {isCompared
            ? 'bg-blueprint-blue/8 text-blueprint-blue'
            : ''}"
          onclick={handleToggleCompare}
          onkeydown={tooltip.onKeydown}
          aria-disabled={compareDisabled && !isCompared ? 'true' : undefined}
          aria-label={isCompared
            ? 'Retirer la mission de la comparaison'
            : 'Ajouter la mission à la comparaison'}
          aria-pressed={isCompared}
          aria-describedby={tooltip.isOpen ? tooltip.id : undefined}
        >
          <Icon name="git-compare-arrows" size={13} />
        </button>
      {/snippet}
    </Tooltip>
    <Tooltip
      label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      description={isFavorite
        ? 'La mission quitte le fil des favoris.'
        : 'Épinglez la mission pour la retrouver dans le fil des favoris.'}
    >
      {#snippet children(tooltip: TooltipTriggerState)}
        <button
          type="button"
          class="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-subtle-gray hover:text-text-primary active:bg-page-canvas disabled:cursor-wait {isFavorite
            ? 'text-blueprint-blue hover:text-blueprint-blue'
            : ''}"
          onclick={handleToggleFavorite}
          onkeydown={tooltip.onKeydown}
          disabled={isFavoritePending}
          aria-label={isFavorite
            ? 'Retirer la mission des favoris'
            : 'Ajouter la mission aux favoris'}
          aria-pressed={isFavorite}
          aria-describedby={tooltip.isOpen ? tooltip.id : undefined}
        >
          <Icon name="star" size={13} class={isFavorite ? 'fill-blueprint-blue' : ''} />
        </button>
      {/snippet}
    </Tooltip>
    <button
      type="button"
      class="ml-auto inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-blueprint-blue-strong px-3 text-body font-medium text-white shadow-subtle-2 transition-colors duration-150 ease-out hover:bg-blueprint-blue-strong/90 active:translate-y-px"
      onclick={handleInvestigate}
    >
      <span>Analyser</span>
      <Icon name="arrow-right" size={13} />
    </button>
  </div>
</article>
