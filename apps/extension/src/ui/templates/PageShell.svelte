<script lang="ts">
  import type { Snippet } from 'svelte';

  const {
    ariaBusy = false,
    children,
  }: {
    ariaBusy?: boolean;
    children: Snippet;
  } = $props();
</script>

<div
  class="flex h-full min-w-0 flex-col gap-4 overflow-x-hidden overflow-y-auto px-4 pb-5 pt-4 [&>*]:shrink-0"
  aria-busy={ariaBusy}
>
  {@render children()}
</div>
