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
    onVisible: onVisibleCallback,
    onToggleFavorite,
    onHide,
    onCopyLink,
  }: {
    mission: Mission;
    isSeen?: boolean;
    isFavorite?: boolean;
    isHidden?: boolean;
    onVisible?: () => void;
    onToggleFavorite?: () => void;
    onHide?: () => void;
    onCopyLink?: () => void;
  } = $props();

  let expanded = $state(false);

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
    setTimeout(() => { copied = false; }, 1500);
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
  class="bg-white/[0.07] backdrop-blur-md border border-white/10 border-t-white/15 rounded-xl {glowClass} hover:bg-white/[0.12] hover:scale-[1.01] transition-all duration-500 ease-out cursor-pointer p-3 active:scale-[0.99] {isSeen ? '' : 'border-l-2 border-l-accent-blue shadow-[inset_2px_0_8px_rgba(59,130,246,0.1)]'} {isHidden ? 'opacity-50' : ''}"
  onclick={toggleExpand}
  role="button"
  tabindex="0"
  onkeydown={(e) => { if (e.key === 'Enter') toggleExpand(); }}
>
  <div class="flex items-start justify-between gap-2">
    <div class="flex-1 min-w-0">
      <h3 class="text-sm font-semibold text-text-primary truncate">{mission.title}</h3>
      {#if mission.client}
        <p class="text-xs text-text-secondary mt-0.5">{mission.client}</p>
      {/if}
    </div>
    <div class="flex items-center gap-1">
      {#if mission.score !== null}
        <span class="text-xs font-mono font-bold px-2 py-0.5 rounded-full {scoreColor}">{mission.score}</span>
      {/if}
      <Icon name="chevron-down" size={14} class="text-text-muted transition-transform duration-200 {expanded ? 'rotate-180' : ''}" />
    </div>
  </div>

  <div class="flex flex-wrap gap-1 mt-2">
    {#each mission.stack.slice(0, 3) as tech}
      <Badge label={tech} variant="tech" />
    {/each}
    {#if mission.stack.length > 3}
      <Badge label="+{mission.stack.length - 3}" variant="source" />
    {/if}
  </div>

  <div class="flex items-center gap-3 mt-2 text-xs text-text-secondary">
    {#if mission.tjm !== null}
      <span class="font-mono text-accent-blue font-semibold">{mission.tjm}€/j</span>
    {/if}
    {#if mission.location}
      <span>{mission.location}</span>
    {/if}
    {#if mission.remote}
      <span class="capitalize">{mission.remote}</span>
    {/if}
    {#if mission.duration}
      <span>{mission.duration}</span>
    {/if}
    <Badge label={mission.source} variant="source" />
  </div>

  <div class="flex justify-end gap-1 mt-2">
    <button
      class="p-1 rounded-md transition-all duration-200 {isFavorite ? 'text-accent-amber' : 'text-text-muted hover:text-text-primary'}"
      onclick={handleToggleFavorite}
      title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
    >
      <Icon name="star" size={14} class={isFavorite ? 'fill-accent-amber' : ''} />
    </button>
    <button
      class="p-1 rounded-md text-text-muted hover:text-accent-red transition-all duration-200"
      onclick={handleHide}
      title={isHidden ? 'Restaurer' : 'Masquer'}
    >
      <Icon name={isHidden ? 'eye' : 'x-circle'} size={14} />
    </button>
    <button
      class="p-1 rounded-md text-text-muted hover:text-text-primary transition-all duration-200"
      onclick={handleCopyLink}
      title="Copier le lien"
    >
      <Icon name={copied ? 'check' : 'link'} size={14} class={copied ? 'text-accent-emerald' : ''} />
    </button>
    <button
      class="p-1 rounded-md text-text-muted hover:text-text-primary transition-all duration-200"
      onclick={handleOpenLink}
      title="Ouvrir"
    >
      <Icon name="external-link" size={14} />
    </button>
  </div>

  {#if expanded && mission.description}
    <div transition:slide={{ duration: 200 }}>
      <p class="mt-3 text-xs text-text-secondary leading-relaxed border-t border-white/5 pt-3">{mission.description}</p>
      <a
        href={mission.url}
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-1 mt-2 text-xs text-accent-blue hover:underline"
        onclick={(e) => e.stopPropagation()}
      >
        Voir la mission <Icon name="arrow-right" size={12} />
      </a>
    </div>
  {/if}
</div>
