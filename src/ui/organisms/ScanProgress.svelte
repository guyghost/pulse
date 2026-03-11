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
  <div class="w-full h-0.5 bg-white/5 overflow-hidden">
    <div
      class="h-full bg-accent-blue/70 transition-all duration-500 ease-out"
      style:width="{Math.max(progress, 10)}%"
    ></div>
  </div>
  {#if missionsFound > 0}
    <p class="text-[10px] text-text-muted px-3 py-1 transition-opacity duration-300">{missionsFound} mission{missionsFound > 1 ? 's' : ''} trouvee{missionsFound > 1 ? 's' : ''}...</p>
  {/if}
{/if}
