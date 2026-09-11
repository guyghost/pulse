<script lang="ts">
  import { Icon } from '@pulse/ui';
  import type { ReviewQueueEntry } from '$lib/core/types/parsing-confidence';
  import ReviewQueueItem from '../molecules/ReviewQueueItem.svelte';

  /**
   * « À vérifier » card: flagged missions with low extraction confidence.
   * Props-only organism — the page feeds entries and callbacks from the
   * review-queue state module. Renders nothing when the queue is empty.
   */
  const {
    entries,
    onKeep,
    onDismiss,
    maxVisible = 5,
  }: {
    entries: readonly ReviewQueueEntry[];
    onKeep: (missionId: string) => void;
    onDismiss: (missionId: string) => void;
    /** Items visible before the overflow note. */
    maxVisible?: number;
  } = $props();

  const visibleEntries = $derived(entries.slice(0, maxVisible));
  const overflowCount = $derived(Math.max(0, entries.length - maxVisible));
</script>

{#if entries.length > 0}
  <section
    class="rounded-xl border border-border-light bg-surface-white p-4"
    aria-label="Missions à vérifier"
  >
    <div class="flex items-center gap-2.5">
      <span
        class="flex size-7 shrink-0 items-center justify-center rounded-full bg-subtle-gray text-text-secondary"
        aria-hidden="true"
      >
        <Icon name="triangle-alert" size={14} />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-caption font-semibold text-text-primary">À vérifier</p>
        <p class="text-micro text-text-muted">Confiance d'extraction faible</p>
      </div>
      <span
        class="shrink-0 rounded-full bg-blueprint-blue/10 px-2 py-0.5 font-mono text-caption font-semibold text-blueprint-blue tabular-nums"
        title="{entries.length} missions à vérifier"
      >
        {entries.length}
      </span>
    </div>

    <ul class="mt-3 flex flex-col gap-2">
      {#each visibleEntries as entry (entry.mission.id)}
        <ReviewQueueItem {entry} {onKeep} {onDismiss} />
      {/each}
    </ul>

    {#if overflowCount > 0}
      <p class="mt-2 text-micro text-text-muted">
        + {overflowCount} autre{overflowCount > 1 ? 's' : ''} mission{overflowCount > 1 ? 's' : ''} à
        vérifier
      </p>
    {/if}
  </section>
{/if}
