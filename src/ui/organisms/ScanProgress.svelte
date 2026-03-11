<script lang="ts">
  let {
    progress = 0,
    isScanning = false,
  }: {
    progress?: number;
    isScanning?: boolean;
  } = $props();
</script>

{#if isScanning}
  <div class="w-full h-0.5 bg-white/5 overflow-hidden">
    <div
      class="h-full bg-accent-blue/70 transition-all duration-500 ease-out"
      style:width="{Math.max(progress, 10)}%"
    ></div>
  </div>
{/if}
