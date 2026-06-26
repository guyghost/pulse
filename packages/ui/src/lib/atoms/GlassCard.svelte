<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type GlassVariant = 'default' | 'elevated' | 'glow';
  type GlassPadding = 'none' | 'sm' | 'md' | 'lg';
  type GlassCardProps = Omit<HTMLButtonAttributes, 'class' | 'onclick'> & {
    variant?: GlassVariant;
    padding?: GlassPadding;
    class?: string;
    ariaLabel?: string;
    onclick?: HTMLButtonAttributes['onclick'];
    children: Snippet;
  };

  let {
    variant = 'default',
    padding = 'md',
    class: className = '',
    ariaLabel,
    onclick,
    children,
    type = 'button',
    ...rest
  }: GlassCardProps = $props();

  const paddingClasses = $derived(
    padding === 'none' ? '' : padding === 'sm' ? 'p-3' : padding === 'lg' ? 'p-5' : 'p-4'
  );

  const variantClasses = $derived(
    variant === 'elevated'
      ? 'bg-surface-white border border-border-light shadow-sm'
      : variant === 'glow'
        ? 'bg-surface-white border border-blueprint-blue/20 shadow-subtle'
        : 'bg-surface-white border border-border-light shadow-subtle-2'
  );

  const interactiveClasses = $derived(
    onclick
      ? 'cursor-pointer transition-colors duration-150 hover:border-blueprint-blue/20 hover:bg-page-canvas/40 active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blueprint-blue'
      : ''
  );
</script>

{#if onclick}
  <button
    {...rest}
    {type}
    class="block w-full rounded-md text-left {variantClasses} {paddingClasses} {interactiveClasses} {className}"
    {onclick}
    aria-label={ariaLabel}
  >
    {@render children()}
  </button>
{:else}
  <div class="rounded-md {variantClasses} {paddingClasses} {className}">
    {@render children()}
  </div>
{/if}
