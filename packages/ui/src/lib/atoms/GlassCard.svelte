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
    onclick?: (event: MouseEvent | KeyboardEvent) => void;
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

  function handleKeydown(event: KeyboardEvent) {
    if (!onclick || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }
    event.preventDefault();
    onclick(event);
  }
</script>

<div
  class="rounded-xl {variantClasses} {paddingClasses} {interactiveClasses} {className}"
  {onclick}
  role={onclick ? 'button' : undefined}
  tabindex={onclick ? 0 : undefined}
  aria-label={onclick ? ariaLabel : undefined}
  onkeydown={onclick ? handleKeydown : undefined}
>
  {@render children()}
</div>
