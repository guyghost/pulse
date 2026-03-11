<script lang="ts">
  import type { Snippet } from 'svelte';

  let { content }: {
    content: Snippet;
  } = $props();
</script>

<div class="flex flex-col h-full items-center justify-center p-6">
  <div class="w-full max-w-sm">
    <div class="text-center mb-6">
      <h1 class="text-xl font-bold text-accent-blue">MissionPulse</h1>
      <p class="text-xs text-text-secondary mt-1">Configuration initiale</p>
    </div>
    {@render content()}
  </div>
</div>
