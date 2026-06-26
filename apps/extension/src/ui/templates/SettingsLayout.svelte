<script lang="ts">
  import type { Snippet } from 'svelte';

  const {
    content,
  }: {
    content: Snippet;
  } = $props();
</script>

<div class="flex h-full flex-col overflow-y-auto px-4 pb-5 pt-4">
  {@render content()}
</div>
