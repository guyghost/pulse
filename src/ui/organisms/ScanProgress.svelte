<script lang="ts">
  let {
    progress = 0,
    isScanning = false,
    missionsFound = 0,
  }: {
    progress?: number;
    isScanning?: boolean;
    missionsFound?: number;
  } = $props();
</script>

{#if isScanning}
  <div class="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
    <div
      class="h-full rounded-full bg-gradient-to-r from-accent-blue via-accent-emerald to-accent-blue transition-all duration-500 ease-out"
      style:width="{Math.max(progress, 10)}%"
    ></div>
  </div>
  {#if missionsFound > 0}
    <p class="px-1 pt-2 text-[11px] text-text-secondary transition-opacity duration-300">
      {missionsFound} mission{missionsFound > 1 ? 's' : ''} reperee{missionsFound > 1 ? 's' : ''} pendant le scan
    </p>
  {/if}
{/if}
