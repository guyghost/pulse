<script lang="ts">
  import type { Snippet } from 'svelte';

  type GlassVariant = 'default' | 'elevated' | 'glow';

  let {
    variant = 'default',
    padding = 'md',
    class: className = '',
    ariaLabel,
    onclick,
    children,
  }: {
    variant?: GlassVariant;
    padding?: 'none' | 'sm' | 'md' | 'lg';
    class?: string;
    ariaLabel?: string;
    onclick?: (event: MouseEvent | KeyboardEvent) => void;
    children: Snippet;
  } = $props();

  let paddingClasses = $derived(
    padding === 'none'
      ? ''
      : padding === 'sm'
        ? 'p-3'
        : padding === 'lg'
          ? 'p-6'
          : 'p-4'
  );

  let variantClasses = $derived(
    variant === 'elevated'
      ? 'glass-card-elevated'
      : variant === 'glow'
        ? 'glass-card-glow'
        : 'glass-card'
  );

  let interactiveClasses = $derived(
    onclick ? 'cursor-pointer transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]' : ''
  );

  const handleKeydown = (event: KeyboardEvent) => {
    if (!onclick || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }

    event.preventDefault();
    onclick(event);
  };
</script>

<div
  class="{variantClasses} {paddingClasses} {interactiveClasses} {className}"
  onclick={onclick}
  role={onclick ? 'button' : undefined}
  tabindex={onclick ? 0 : undefined}
  aria-label={onclick ? ariaLabel : undefined}
  onkeydown={onclick ? handleKeydown : undefined}
  data-testid="glass-card"
>
  {@render children()}
</div>
