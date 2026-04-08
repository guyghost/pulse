<script lang="ts">
  import Icon from '../atoms/Icon.svelte';

  const {
    lastScanAt,
    missionCount,
  }: {
    lastScanAt: number | null;
    missionCount: number;
  } = $props();

  const timeAgo = $derived.by(() => {
    if (!lastScanAt) {
      return null;
    }
    const diff = Date.now() - lastScanAt;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) {
      return "à l'instant";
    }
    if (minutes < 60) {
      return `il y a ${minutes}min`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `il y a ${hours}h`;
    }
    return `il y a ${Math.floor(hours / 24)}j`;
  });
</script>

{#if timeAgo}
  <div class="flex items-center gap-1.5 text-[11px] text-text-muted">
    <Icon name="clock" size={11} />
    <span>Dernier scan {timeAgo}</span>
    {#if missionCount > 0}
      <span class="text-text-secondary">· {missionCount} missions</span>
    {/if}
  </div>
{/if}
