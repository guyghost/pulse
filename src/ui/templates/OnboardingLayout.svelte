<script lang="ts">
  import type { Snippet } from 'svelte';

  let { content }: {
    content: Snippet;
  } = $props();
</script>

<div class="flex flex-col h-full items-center justify-center p-6">
  <div class="w-full max-w-sm">
    <div class="text-center mb-8">
      <h1 class="text-2xl font-bold text-white">MissionPulse</h1>
      <p class="text-sm text-text-secondary mt-1.5">Configurez en 30 secondes</p>
    </div>
    {@render content()}
  </div>
</div>
