<script lang="ts">
  import type { Snippet } from 'svelte';

  let { header, filters, feed, sidebar }: {
    header?: Snippet;
    filters?: Snippet;
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
  {#if filters}
    <div class="shrink-0 px-3">
      {@render filters()}
    </div>
  {/if}
  <div class="flex-1 overflow-y-auto px-3 pb-3">
    {@render feed()}
  </div>
  {#if sidebar}
    <div class="shrink-0 border-t border-border p-3">
      {@render sidebar()}
    </div>
  {/if}
</div>
