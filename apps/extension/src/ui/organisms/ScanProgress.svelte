<script lang="ts">
  const {
    progress = 0,
    isScanning = false,
    missionsFound = 0,
    connectorName = '',
    current = 0,
    total = 0,
  }: {
    progress?: number;
    isScanning?: boolean;
    missionsFound?: number;
    connectorName?: string;
    current?: number;
    total?: number;
  } = $props();
</script>

{#if isScanning}
  <div class="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-subtle-gray">
    <div
      class="h-full rounded-full bg-gradient-to-r from-blueprint-blue via-blueprint-blue to-blueprint-blue transition-all duration-500 ease-out"
      style:width="{Math.max(progress, 5)}%"
    ></div>
  </div>
  <p class="px-1 pt-2 text-[11px] text-text-secondary transition-opacity duration-300">
    {#if connectorName}
      Scraping {connectorName}... ({current}/{total})
    {:else if missionsFound > 0}
      {missionsFound} mission{missionsFound > 1 ? 's' : ''} reperee{missionsFound > 1 ? 's' : ''} pendant
      le scan
    {:else}
      Demarrage du scan...
    {/if}
  </p>
{/if}
