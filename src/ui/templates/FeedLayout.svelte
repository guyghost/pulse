<script lang="ts">
  import type { Snippet } from 'svelte';

  let { header, feed, sidebar }: {
    header?: Snippet;
    feed: Snippet;
    sidebar?: Snippet;
  } = $props();
</script>

<div class="flex flex-col h-full">
  {#if header}
    <div class="shrink-0">
      {@render header()}
    </div>
  {/if}
  <div class="flex-1 overflow-y-auto px-3 pb-3">
    {@render feed()}
  </div>
  {#if sidebar}
    <div class="shrink-0 border-t border-white/5 p-3">
      {@render sidebar()}
    </div>
  {/if}
</div>
