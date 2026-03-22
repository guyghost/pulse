<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../atoms/Icon.svelte';

  let { content, onBack }: {
    content: Snippet;
    onBack?: () => void;
  } = $props();
</script>

<div class="flex h-full flex-col px-4 pb-5 pt-4">
  <div class="flex-1 overflow-y-auto pt-4">
    {@render content()}
  </div>
</div>
