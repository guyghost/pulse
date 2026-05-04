<script lang="ts">
  import { slide } from 'svelte/transition';
  import type { Mission } from '$lib/core/types/mission';
  import type { ApplicationStatus } from '$lib/core/types/tracking';
  import { STATUS_LABELS, STATUS_VARIANTS, VALID_TRANSITIONS } from '$lib/core/types/tracking';
  import { Badge } from '@pulse/ui';
  import { Icon } from '@pulse/ui';
  import { ripple } from '../actions/ripple';
  import { onVisible as onVisibleAction } from '../actions/on-visible';

  const {
    mission,
    isSeen = true,
    isFavorite = false,
    isHidden = false,
    isVirtualized = false,
    tourHighlight = null,
    onVisible: onVisibleCallback,
    onToggleFavorite,
    onHide,
    onCopyLink,
    trackingStatus = null as ApplicationStatus | null,
    onStatusTransition = null as ((status: ApplicationStatus) => void) | null,
  }: {
    mission: Mission;
    isSeen?: boolean;
    isFavorite?: boolean;
    isHidden?: boolean;
    isVirtualized?: boolean;
    tourHighlight?: 'score' | 'expand' | 'seen' | 'filters' | null;
    onVisible?: () => void;
    onToggleFavorite?: () => void;
    onHide?: () => void;
    onCopyLink?: () => void;
    trackingStatus?: ApplicationStatus | null;
    onStatusTransition?: ((status: ApplicationStatus) => void) | null;
  } = $props();

  let expanded = $state(false);

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

  const scoreColor = $derived(
    scoreValue >= 80
      ? 'text-accent-green bg-accent-green/10'
      : scoreValue >= 50
        ? 'text-accent-amber bg-accent-amber/10'
        : 'text-text-muted bg-page-canvas'
  );

  function barColor(value: number): string {
    return value >= 70 ? 'bg-blueprint-blue' : value >= 40 ? 'bg-accent-amber' : 'bg-status-red';
  }

  function toggleExpand() {
    expanded = !expanded;
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

  function handleOpenLink(e: MouseEvent) {
    e.stopPropagation();
    window.open(mission.url, '_blank');
  }
</script>

<div
  use:ripple
  use:onVisibleAction={() => onVisibleCallback?.()}
  class="group relative cursor-pointer rounded-xl border border-border-light bg-surface-white p-5 transition-all duration-200 ease-out hover:border-disabled-gray {isSeen
    ? ''
    : 'border-blueprint-blue/20'} {isHidden
    ? 'opacity-50'
    : ''} {tourHighlight === 'seen'
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
      <h3 class="mt-2 text-[0.9375rem] font-medium leading-snug text-text-primary">{mission.title}</h3>
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
    {#if mission.scoreBreakdown?.semanticReason ?? mission.semanticReason}
      <span
        class="inline-flex items-center gap-1 rounded-full border border-blueprint-blue/15 bg-blueprint-blue/5 px-2 py-0.5 text-[10px] text-blueprint-blue"
      >
        {mission.scoreBreakdown?.semanticReason ?? mission.semanticReason}
      </span>
    {/if}
  </div>

  {#if mission.description}
    <p class="mt-3 line-clamp-2 text-xs leading-relaxed text-text-subtle">
      {mission.description}
    </p>
  {/if}

  <!-- Detail grid -->
  {#if expanded}
    <div class="mt-4 border-t border-border-light pt-4">
      <div class="grid grid-cols-2 gap-2 text-xs">
        {#if mission.tjm !== null}
          <div class="rounded-lg bg-page-canvas px-3 py-2.5">
            <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">TJM</p>
            <p class="mt-1 font-mono font-semibold tabular-nums text-text-primary">{mission.tjm}€<span class="text-text-muted">/j</span></p>
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
            <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">Séniorité</p>
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

  <!-- Score breakdown (expanded only) -->
  {#if expanded && mission.scoreBreakdown}
    <div class="mt-4 border-t border-border-light pt-4">
      <div class="grid grid-cols-2 gap-2">
        <div class="rounded-lg bg-page-canvas px-3 py-2">
          <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">Compétences</p>
          <div class="mt-1.5 flex items-center gap-2">
            <div class="flex-1 h-2 rounded-full bg-border-light overflow-hidden">
              <div class="h-full rounded-full {barColor(mission.scoreBreakdown.criteria.stack)} transition-all" style:width="{mission.scoreBreakdown.criteria.stack}%"></div>
            </div>
            <span class="text-[11px] font-mono font-semibold tabular-nums text-text-primary">{mission.scoreBreakdown.criteria.stack}</span>
          </div>
        </div>
        <div class="rounded-lg bg-page-canvas px-3 py-2">
          <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">TJM</p>
          <div class="mt-1.5 flex items-center gap-2">
            <div class="flex-1 h-2 rounded-full bg-border-light overflow-hidden">
              <div class="h-full rounded-full {barColor(mission.scoreBreakdown.criteria.tjm)} transition-all" style:width="{mission.scoreBreakdown.criteria.tjm}%"></div>
            </div>
            <span class="text-[11px] font-mono font-semibold tabular-nums text-text-primary">{mission.scoreBreakdown.criteria.tjm}</span>
          </div>
        </div>
        <div class="rounded-lg bg-page-canvas px-3 py-2">
          <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">Localisation</p>
          <div class="mt-1.5 flex items-center gap-2">
            <div class="flex-1 h-2 rounded-full bg-border-light overflow-hidden">
              <div class="h-full rounded-full {barColor(mission.scoreBreakdown.criteria.location)} transition-all" style:width="{mission.scoreBreakdown.criteria.location}%"></div>
            </div>
            <span class="text-[11px] font-mono font-semibold tabular-nums text-text-primary">{mission.scoreBreakdown.criteria.location}</span>
          </div>
        </div>
        <div class="rounded-lg bg-page-canvas px-3 py-2">
          <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">Remote</p>
          <div class="mt-1.5 flex items-center gap-2">
            <div class="flex-1 h-2 rounded-full bg-border-light overflow-hidden">
              <div class="h-full rounded-full {barColor(mission.scoreBreakdown.criteria.remote)} transition-all" style:width="{mission.scoreBreakdown.criteria.remote}%"></div>
            </div>
            <span class="text-[11px] font-mono font-semibold tabular-nums text-text-primary">{mission.scoreBreakdown.criteria.remote}</span>
          </div>
        </div>
        {#if mission.scoreBreakdown.semantic !== null}
          <div class="rounded-lg border border-blueprint-blue/15 bg-blueprint-blue/5 px-3 py-2">
            <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-blueprint-blue">IA sémantique</p>
            <div class="mt-1.5 flex items-center gap-2">
              <div class="flex-1 h-2 rounded-full bg-border-light overflow-hidden">
                <div class="h-full rounded-full bg-blueprint-blue transition-all" style:width="{mission.scoreBreakdown.semantic}%"></div>
              </div>
              <span class="text-[11px] font-mono font-semibold tabular-nums text-blueprint-blue">{mission.scoreBreakdown.semantic}</span>
            </div>
          </div>
        {/if}
        {#if mission.scoreBreakdown.semanticReason}
          <div class="col-span-2 rounded-lg border border-blueprint-blue/15 bg-blueprint-blue/5 px-3 py-2 text-[11px] text-blueprint-blue">
            {mission.scoreBreakdown.semanticReason}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Actions — always visible, subtle until hover -->
  <div class="mt-3 flex items-center justify-between">
    <div class="flex gap-1">
      <button
        class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-subtle-gray hover:text-text-primary {isFavorite
          ? 'text-blueprint-blue hover:text-blueprint-blue'
          : ''}"
        onclick={handleToggleFavorite}
        title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      >
        <Icon name="star" size={13} class={isFavorite ? 'fill-blueprint-blue' : ''} />
      </button>
      <button
        class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-subtle-gray hover:text-status-red"
        onclick={handleHide}
        title={isHidden ? 'Restaurer' : 'Masquer'}
      >
        <Icon name={isHidden ? 'eye' : 'x-circle'} size={13} />
      </button>
      <button
        class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-subtle-gray hover:text-text-primary"
        onclick={handleCopyLink}
        title="Copier le lien"
      >
        <Icon
          name={copied ? 'check' : 'link'}
          size={13}
          class={copied ? 'text-blueprint-blue' : ''}
        />
      </button>
      <button
        class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-subtle-gray hover:text-text-primary"
        onclick={handleOpenLink}
        title="Ouvrir"
      >
        <Icon name="external-link" size={13} />
      </button>
    </div>
    <a
      href={mission.url}
      target="_blank"
      rel="noopener noreferrer"
      class="text-[11px] font-medium text-text-muted transition-colors hover:text-blueprint-blue"
      onclick={(e) => e.stopPropagation()}
    >
      Voir →
    </a>
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
