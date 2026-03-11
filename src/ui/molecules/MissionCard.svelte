<script lang="ts">
  import type { Mission } from '$lib/core/types/mission';
  import Badge from '../atoms/Badge.svelte';
  import Icon from '../atoms/Icon.svelte';

  let { mission }: { mission: Mission } = $props();

  let expanded = $state(false);

  let borderColor = $derived(
    (mission.score ?? 0) >= 80
      ? 'border-l-accent-emerald'
      : (mission.score ?? 0) >= 50
      ? 'border-l-accent-amber'
      : 'border-l-navy-600'
  );

  let scoreColor = $derived(
    (mission.score ?? 0) >= 80
      ? 'text-accent-emerald'
      : (mission.score ?? 0) >= 50
      ? 'text-accent-amber'
      : 'text-text-muted'
  );

  function toggleExpand() {
    expanded = !expanded;
  }
</script>

<div
  class="bg-surface rounded-lg border-l-4 {borderColor} shadow-card hover:shadow-card-hover transition-shadow cursor-pointer p-3"
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
    {#if mission.score !== null}
      <span class="text-xs font-mono font-bold {scoreColor}">{mission.score}</span>
    {/if}
  </div>

  <div class="flex flex-wrap gap-1 mt-2">
    {#each mission.stack.slice(0, 5) as tech}
      <Badge label={tech} variant="tech" />
    {/each}
    {#if mission.stack.length > 5}
      <Badge label="+{mission.stack.length - 5}" variant="source" />
    {/if}
  </div>

  <div class="flex items-center gap-3 mt-2 text-xs text-text-secondary">
    {#if mission.tjm !== null}
      <span class="font-mono text-accent-blue font-medium">{mission.tjm}€/j</span>
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

  {#if expanded && mission.description}
    <p class="mt-2 text-xs text-text-secondary leading-relaxed">{mission.description}</p>
    <a
      href={mission.url}
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1 mt-2 text-xs text-accent-blue hover:underline"
      onclick={(e) => e.stopPropagation()}
    >
      Voir la mission <Icon name="arrow-right" size={12} />
    </a>
  {/if}
</div>
