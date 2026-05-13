<script lang="ts">
  import type { Snippet } from 'svelte';

  type GlassVariant = 'default' | 'elevated' | 'glow';
  type GlassPadding = 'none' | 'sm' | 'md' | 'lg';

  const {
    variant = 'default',
    padding = 'md',
    class: className = '',
    ariaLabel,
    onclick,
    children,
  }: {
    variant?: GlassVariant;
    padding?: GlassPadding;
    class?: string;
    ariaLabel?: string;
    onclick?: (event: MouseEvent) => void;
    children: Snippet;
  } = $props();

  const paddingClasses = $derived(
    padding === 'none' ? '' : padding === 'sm' ? 'p-3' : padding === 'lg' ? 'p-6' : 'p-4'
  );

  const variantClasses = $derived(
    variant === 'elevated'
      ? 'bg-surface-white border border-border-light shadow-sm'
      : variant === 'glow'
        ? 'bg-surface-white border border-blueprint-blue/10 shadow-subtle-3'
        : 'bg-surface-white border border-border-light shadow-subtle-2'
  );

  const interactiveClasses = $derived(
    onclick
      ? 'cursor-pointer transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]'
      : ''
  );
</script>

{#if onclick}
  <button
    type="button"
    class="block w-full rounded-xl text-left {variantClasses} {paddingClasses} {interactiveClasses} {className}"
    {onclick}
    aria-label={ariaLabel}
  >
    {@render children()}
  </button>
{:else}
  <div class="rounded-xl {variantClasses} {paddingClasses} {className}">
    {@render children()}
  </div>
{/if}
