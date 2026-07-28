<script lang="ts">
  import { Icon } from '@pulse/ui';
  import { formatRelativeTime } from '$lib/core/utils/format';

  const {
    lastScanAt,
    missionCount,
  }: {
    lastScanAt: number | null;
    missionCount: number;
  } = $props();

  const timeAgo = $derived(formatRelativeTime(lastScanAt, Date.now()));
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
