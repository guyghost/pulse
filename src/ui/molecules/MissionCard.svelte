<script lang="ts">
  import { slide } from 'svelte/transition';
  import type { Mission } from '$lib/core/types/mission';
  import Badge from '../atoms/Badge.svelte';
  import Icon from '../atoms/Icon.svelte';
  import { ripple } from '../actions/ripple';
  import { onVisible as onVisibleAction } from '../actions/on-visible';

  let {
    mission,
    isSeen = true,
    isFavorite = false,
    isHidden = false,
    isVirtualized = false,
    onVisible: onVisibleCallback,
    onToggleFavorite,
    onHide,
    onCopyLink,
  }: {
    mission: Mission;
    isSeen?: boolean;
    isFavorite?: boolean;
    isHidden?: boolean;
    isVirtualized?: boolean;
    onVisible?: () => void;
    onToggleFavorite?: () => void;
    onHide?: () => void;
    onCopyLink?: () => void;
  } = $props();

  let expanded = $state(false);

  const seniorityLabels: Record<string, string> = {
    junior: 'Junior (0-2 ans)',
    confirmed: 'Confirmé (3-7 ans)',
    senior: 'Senior (7+ ans)',
  };

  let seniorityLabel = $derived(
    mission.seniority ? seniorityLabels[mission.seniority] ?? mission.seniority : null
  );

  let scoreColor = $derived(
    (mission.score ?? 0) >= 80
      ? 'text-accent-emerald bg-accent-emerald/15'
      : (mission.score ?? 0) >= 50
        ? 'text-accent-amber bg-accent-amber/15'
        : 'text-text-muted bg-white/5'
  );

  let glowClass = $derived(
    (mission.score ?? 0) >= 80
      ? 'shadow-glow-emerald'
      : (mission.score ?? 0) >= 50
        ? 'shadow-glow-blue'
        : ''
  );

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
  class="section-card relative cursor-pointer rounded-[1.65rem] p-4 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-white/[0.07] active:scale-[0.99] {glowClass} {isSeen
    ? ''
    : 'border-accent-blue/30 shadow-[inset_0_0_0_1px_rgba(89,198,255,0.2),0_18px_36px_rgba(1,7,12,0.26)]'} {isHidden
    ? 'opacity-55'
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
  <div
    class="pointer-events-none absolute right-4 top-4 h-20 w-20 rounded-full bg-accent-blue/8 blur-2xl"
  ></div>
  <div class="relative flex items-start justify-between gap-3">
    <div class="min-w-0 flex-1">
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <Badge label={mission.source} variant="source" />
        {#if !isSeen}
          <span
            class="inline-flex items-center rounded-full border border-accent-blue/18 bg-accent-blue/12 px-2 py-1 text-[11px] font-medium text-accent-blue"
          >
            Nouveau
          </span>
        {/if}
        {#if mission.remote}
          <span
            class="inline-flex items-center rounded-full border border-white/8 bg-white/[0.04] px-2 py-1 text-[11px] capitalize text-text-secondary"
          >
            {mission.remote}
          </span>
        {/if}
      </div>
      <h3 class="truncate text-[1rem] font-semibold text-text-primary">{mission.title}</h3>
      {#if mission.client}
        <p class="mt-1 text-xs text-text-secondary">{mission.client}</p>
      {/if}
    </div>
    <div class="flex items-center gap-2">
      {#if mission.score !== null}
        <span class="rounded-full px-2.5 py-1 text-xs font-mono font-bold {scoreColor}"
          >{mission.score}</span
        >
      {/if}
      <div class="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.04]">
        <Icon
          name="chevron-down"
          size={14}
          class="text-text-muted transition-transform duration-200 {expanded ? 'rotate-180' : ''}"
        />
      </div>
    </div>
  </div>

  <div class="mt-3 flex flex-wrap gap-2">
    {#each mission.stack.slice(0, 3) as tech}
      <Badge label={tech} variant="tech" />
    {/each}
    {#if mission.stack.length > 3}
      <Badge label="+{mission.stack.length - 3}" variant="source" />
    {/if}
    {#if mission.semanticReason}
      <span
        class="inline-flex items-center gap-1 rounded-full border border-accent-blue/20 bg-accent-blue/8 px-2 py-0.5 text-[11px] text-accent-blue"
      >
        {mission.semanticReason}
      </span>
    {/if}
  </div>

  {#if mission.description}
    <p class="mt-3 line-clamp-2 text-xs leading-relaxed text-text-secondary">
      {mission.description}
    </p>
  {/if}

  <div class="mt-4 grid grid-cols-2 gap-2 text-xs text-text-secondary">
    {#if mission.tjm !== null}
      <div class="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
        <p class="text-[10px] uppercase tracking-[0.18em] text-text-muted">TJM</p>
        <p class="mt-1 font-mono font-semibold text-accent-blue">{mission.tjm}€/j</p>
      </div>
    {/if}
    {#if mission.location}
      <div class="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
        <p class="text-[10px] uppercase tracking-[0.18em] text-text-muted">Zone</p>
        <p class="mt-1 truncate text-text-primary">{mission.location}</p>
      </div>
    {/if}
    {#if mission.duration}
      <div class="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
        <p class="text-[10px] uppercase tracking-[0.18em] text-text-muted">Durée</p>
        <p class="mt-1 truncate text-text-primary">{mission.duration}</p>
      </div>
    {/if}
    {#if mission.startDate}
      <div class="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
        <p class="text-[10px] uppercase tracking-[0.18em] text-text-muted">Début</p>
        <p class="mt-1 truncate text-text-primary">{mission.startDate}</p>
      </div>
    {/if}
    {#if seniorityLabel}
      <div class="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
        <p class="text-[10px] uppercase tracking-[0.18em] text-text-muted">Séniorité</p>
        <p class="mt-1 truncate text-text-primary">{seniorityLabel}</p>
      </div>
    {/if}
    <div class="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
      <p class="text-[10px] uppercase tracking-[0.18em] text-text-muted">Source</p>
      <p class="mt-1 truncate text-text-primary">{mission.source}</p>
    </div>
  </div>

  <div class="mt-4 flex justify-end gap-2">
    <button
      class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] transition-all duration-200 {isFavorite
        ? 'text-accent-amber'
        : 'text-text-muted hover:text-text-primary'}"
      onclick={handleToggleFavorite}
      title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
    >
      <Icon name="star" size={14} class={isFavorite ? 'fill-accent-amber' : ''} />
    </button>
    <button
      class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-text-muted transition-all duration-200 hover:text-accent-red"
      onclick={handleHide}
      title={isHidden ? 'Restaurer' : 'Masquer'}
    >
      <Icon name={isHidden ? 'eye' : 'x-circle'} size={14} />
    </button>
    <button
      class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-text-muted transition-all duration-200 hover:text-text-primary"
      onclick={handleCopyLink}
      title="Copier le lien"
    >
      <Icon
        name={copied ? 'check' : 'link'}
        size={14}
        class={copied ? 'text-accent-emerald' : ''}
      />
    </button>
    <button
      class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-text-muted transition-all duration-200 hover:text-text-primary"
      onclick={handleOpenLink}
      title="Ouvrir"
    >
      <Icon name="external-link" size={14} />
    </button>
  </div>

  {#if expanded && mission.description}
    <!-- Les animations sont désactivées en mode virtualisé car elles conflit avec le absolute positioning -->
    {#if isVirtualized}
      <div>
        <div class="mt-4 border-t border-white/6 pt-4 max-h-32 overflow-y-auto">
          <p class="text-xs leading-relaxed text-text-secondary">{mission.description}</p>
        </div>
        <a
          href={mission.url}
          target="_blank"
          rel="noopener noreferrer"
          class="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent-blue hover:underline"
          onclick={(e) => e.stopPropagation()}
        >
          Voir la mission <Icon name="arrow-right" size={12} />
        </a>
      </div>
    {:else}
      <div transition:slide={{ duration: 200 }}>
        <div class="mt-4 border-t border-white/6 pt-4">
          <p class="text-xs leading-relaxed text-text-secondary">{mission.description}</p>
        </div>
        <a
          href={mission.url}
          target="_blank"
          rel="noopener noreferrer"
          class="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent-blue hover:underline"
          onclick={(e) => e.stopPropagation()}
        >
          Voir la mission <Icon name="arrow-right" size={12} />
        </a>
      </div>
    {/if}
  {/if}
</div>
