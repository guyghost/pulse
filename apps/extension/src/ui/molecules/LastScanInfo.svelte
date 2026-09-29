<script lang="ts">
  import { Icon } from '@pulse/ui';
  import { formatRelativeTime } from '$lib/core/utils/format';
  import { createClock } from '$lib/state/clock.svelte';

  const {
    lastScanAt,
    missionCount,
  }: {
    lastScanAt: number | null;
    missionCount: number;
  } = $props();

  const clock = createClock();
  const timeAgo = $derived(formatRelativeTime(lastScanAt, clock.now));
</script>

{#if timeAgo}
  <div class="flex items-center gap-1.5 text-caption text-text-muted">
    <Icon name="clock" size={11} />
    <span>Dernier scan {timeAgo}</span>
    {#if missionCount > 0}
      <span class="text-text-secondary">· {missionCount} missions</span>
    {/if}
  </div>
{/if}
