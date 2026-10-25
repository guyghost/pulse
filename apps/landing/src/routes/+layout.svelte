<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';
  import { theme } from '#lib/theme.svelte.js';

  let { children }: { children: Snippet } = $props();

  $effect(() => {
    theme.init();
  });
</script>

{@render children()}
