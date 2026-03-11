<script lang="ts">
  import Icon from '../atoms/Icon.svelte';

  let {
    currentConnector = null,
    progress = 0,
    missionsFound = 0,
    isScanning = false,
  }: {
    currentConnector?: string | null;
    progress?: number;
    missionsFound?: number;
    isScanning?: boolean;
  } = $props();
</script>

{#if isScanning}
  <div class="bg-surface border border-border rounded-lg p-3 space-y-2">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Icon name="loader" size={14} class="text-accent-blue animate-spin" />
        <span class="text-sm text-text-primary font-medium">Scan en cours</span>
      </div>
      <span class="text-xs text-text-secondary">{Math.round(progress)}%</span>
    </div>

    <div class="w-full h-1.5 bg-navy-700 rounded-full overflow-hidden">
      <div
        class="h-full bg-accent-blue rounded-full transition-all duration-300"
        style:width="{progress}%"
      ></div>
    </div>

    <div class="flex justify-between text-[10px] text-text-muted">
      {#if currentConnector}
        <span>{currentConnector}</span>
      {/if}
      <span>{missionsFound} mission{missionsFound > 1 ? 's' : ''} trouv\u00e9e{missionsFound > 1 ? 's' : ''}</span>
    </div>
  </div>
{/if}
