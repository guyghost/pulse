<script lang="ts">
  import type { Snippet } from 'svelte';
  import { pullToRefresh } from '../actions/pull-to-refresh';

  let { header, feed, sidebar, onRefresh }: {
    header?: Snippet;
    feed: Snippet;
    sidebar?: Snippet;
    onRefresh?: () => void;
  } = $props();
</script>

<div class="flex flex-col h-full">
  {#if header}
    <div class="shrink-0">
      {@render header()}
    </div>
  {/if}
  <div
    class="flex-1 overflow-y-auto px-3 pb-3"
    use:pullToRefresh={{ onRefresh: () => onRefresh?.(), threshold: 60 }}
  >
    {@render feed()}
  </div>
  {#if sidebar}
    <div class="shrink-0 border-t border-white/5 p-3">
      {@render sidebar()}
    </div>
  {/if}
</div>
