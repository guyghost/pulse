<script lang="ts">
  import { Icon } from '@pulse/ui';
  import { formatTJMValue } from '$lib/core/utils/format';
  import type { ReviewQueueEntry } from '$lib/core/types/parsing-confidence';
  import ConfidenceGauge from '../atoms/ConfidenceGauge.svelte';

  /**
   * One « À vérifier » item: status icon (blue alert when the source parser
   * is suspect, gray dot otherwise), title, short reason, TJM in mono,
   * confidence gauge and Garder / Ignorer actions.
   * Pure molecule — props and callbacks only.
   */
  const {
    entry,
    onKeep,
    onDismiss,
  }: {
    entry: ReviewQueueEntry;
    onKeep: (missionId: string) => void;
    onDismiss: (missionId: string) => void;
  } = $props();

  const tjmLabel = $derived(formatTJMValue(entry.mission.tjm) ?? '—');
</script>

<li class="rounded-lg border border-border-light bg-surface-white p-3">
  <div class="flex items-start gap-2.5">
    {#if entry.parserSuspect}
      <span class="mt-[1px] shrink-0 text-blueprint-blue" title="Parser de la source suspect">
        <Icon name="circle-alert" size={14} />
      </span>
    {:else}
      <span
        class="mt-[4px] size-2 shrink-0 rounded-full bg-disabled-gray"
        title="Champs d'extraction incomplets"
        aria-hidden="true"
      ></span>
    {/if}

    <div class="min-w-0 flex-1">
      <div class="flex items-baseline justify-between gap-2">
        <p class="truncate text-caption font-medium text-text-primary" title={entry.mission.title}>
          {entry.mission.title}
        </p>
        <span class="shrink-0 font-mono text-caption text-text-primary tabular-nums">
          {tjmLabel}
        </span>
      </div>

      {#if entry.primaryReasonLabel}
        <p class="mt-0.5 text-micro text-text-muted">{entry.primaryReasonLabel}</p>
      {/if}

      <div class="mt-2 flex items-center justify-between gap-2">
        <ConfidenceGauge value={entry.confidence} />
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="rounded-md border border-border-light px-2 py-1 text-micro font-medium text-text-secondary transition-colors hover:bg-subtle-gray"
            onclick={() => onKeep(entry.mission.id)}
          >
            Garder
          </button>
          <button
            type="button"
            class="rounded-md px-2 py-1 text-micro font-medium text-text-muted transition-colors hover:bg-subtle-gray"
            onclick={() => onDismiss(entry.mission.id)}
          >
            Ignorer
          </button>
        </div>
      </div>
    </div>
  </div>
</li>
