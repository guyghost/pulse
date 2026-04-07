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
      ? 'border border-accent-blue/30 bg-accent-blue/88 text-navy-900 shadow-[0_16px_28px_rgba(89,198,255,0.22)] hover:bg-accent-blue-hover'
      : variant === 'secondary'
      ? 'border border-white/10 bg-white/[0.05] text-text-primary hover:bg-white/[0.1]'
      : variant === 'glass'
      ? 'border border-white/10 bg-white/[0.07] text-text-primary hover:bg-white/[0.12] backdrop-blur-md'
      : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
  );
</script>

<button
  class="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[1rem] px-4 py-2.5 text-sm font-semibold transition-all duration-200 ease-out disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.985] {classes}"
  {disabled}
  {onclick}
>
  {@render children()}
</button>
