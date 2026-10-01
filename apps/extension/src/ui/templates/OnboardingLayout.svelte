<script lang="ts">
  import type { Snippet } from 'svelte';
  const { content, showHeader = true }: { content: Snippet; showHeader?: boolean } = $props();
</script>

<div class="flex h-full min-h-0 flex-col px-4 py-4">
  <div class="section-card-strong flex h-full min-h-0 w-full flex-col rounded-xl p-4">
    {#if showHeader}
      <p class="mb-3 shrink-0 text-caption font-medium text-text-subtle">
        MissionPulse · Configuration
      </p>
    {/if}
    <div class="min-h-0 flex-1">
      {@render content()}
    </div>
  </div>
</div>
