<script lang="ts">
  import type { Snippet } from 'svelte';
  import { pullToRefresh } from '../actions/pull-to-refresh';

  const {
    header,
    feed,
    sidebar,
    onRefresh,
  }: {
    header?: Snippet;
    feed: Snippet;
    sidebar?: Snippet;
    onRefresh?: () => void;
  } = $props();
</script>

<div class="flex h-full flex-col">
  {#if header}
    <div class="shrink-0 px-4 pt-4">
      {@render header()}
    </div>
  {/if}
  <div
    class="flex-1 overflow-y-auto px-4 pb-5 pt-4"
    use:pullToRefresh={{ onRefresh: () => onRefresh?.(), threshold: 60 }}
  >
    {@render feed()}
  </div>
  {#if sidebar}
    <div class="shrink-0 border-t border-border-light px-4 py-3">
      {@render sidebar()}
    </div>
  {/if}
</div>
