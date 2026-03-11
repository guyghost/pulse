<script lang="ts">
  import type { Snippet } from 'svelte';

  type ButtonVariant = 'primary' | 'secondary' | 'ghost';

  let {
    variant = 'primary',
    disabled = false,
    onclick,
    children,
  }: {
    variant?: ButtonVariant;
    disabled?: boolean;
    onclick?: () => void;
    children: Snippet;
  } = $props();

  let classes = $derived(
    variant === 'primary'
      ? 'bg-accent-blue hover:bg-accent-blue-hover text-white'
      : variant === 'secondary'
      ? 'bg-surface hover:bg-surface-hover text-text-primary border border-border'
      : 'hover:bg-surface-hover text-text-secondary hover:text-text-primary'
  );
</script>

<button
  class="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed {classes}"
  {disabled}
  {onclick}
>
  {@render children()}
</button>
