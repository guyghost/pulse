<script lang="ts">
  import type { SessionTriageProgress } from '$lib/core/feed/session-triage';
  import { Icon } from '@pulse/ui';

  const {
    progress,
  }: {
    progress: SessionTriageProgress;
  } = $props();
</script>

{#if progress.totalCount > 0}
  <div
    class="inline-flex items-center gap-2 rounded-full border border-border-light bg-surface-white px-2.5 py-1 text-micro text-text-muted shadow-subtle"
    data-testid="session-triage-gauge"
    title={`Progression du tri : ${progress.label} (${progress.percent}%)`}
  >
    {#if progress.isInboxZero}
      <span class="inline-flex items-center gap-1 font-medium text-accent-green">
        <Icon name="check-circle" size={11} />
        <span>Veille à jour</span>
      </span>
    {:else}
      <div class="h-1.5 w-12 overflow-hidden rounded-full bg-subtle-gray" aria-hidden="true">
        <div
          class="h-full rounded-full bg-blueprint-blue transition-all duration-300 ease-out"
          style="width: {progress.percent}%"
        ></div>
      </div>
      <span class="font-mono font-medium text-text-secondary">{progress.label}</span>
    {/if}
  </div>
{/if}
