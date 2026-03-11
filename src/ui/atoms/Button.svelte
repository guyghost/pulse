<script lang="ts">
  import type { Snippet } from 'svelte';

  type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'glass';

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
      ? 'bg-accent-blue hover:bg-accent-blue-hover text-white shadow-glow-blue'
      : variant === 'secondary'
      ? 'bg-white/5 hover:bg-white/10 text-text-primary border border-white/10'
      : variant === 'glass'
      ? 'bg-white/[0.07] hover:bg-white/[0.12] text-text-primary border border-white/10 backdrop-blur-md'
      : 'hover:bg-white/5 text-text-secondary hover:text-text-primary'
  );
</script>

<button
  class="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ease-out disabled:opacity-50 disabled:cursor-not-allowed {classes}"
  {disabled}
  {onclick}
>
  {@render children()}
</button>
