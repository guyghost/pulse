<script lang="ts">
  import type { Snippet } from 'svelte';

  type GlowVariant = 'primary' | 'secondary' | 'glass';
  type ButtonSize = 'sm' | 'md' | 'lg';

  const {
    variant = 'primary',
    size = 'md',
    disabled = false,
    loading = false,
    onclick,
    children,
    class: className = '',
  }: {
    variant?: GlowVariant;
    size?: ButtonSize;
    disabled?: boolean;
    loading?: boolean;
    onclick?: () => void;
    children: Snippet;
    class?: string;
  } = $props();

  const sizeClasses = $derived(
    size === 'sm'
      ? 'h-11 px-3 text-sm gap-1.5'
      : size === 'lg'
        ? 'h-12 px-6 text-base gap-2.5'
        : 'h-11 px-4 text-sm gap-2'
  );

  const variantClasses = $derived(
    variant === 'primary'
      ? 'glow-button font-semibold'
      : variant === 'secondary'
        ? 'border border-primary/30 bg-primary/10 text-text-primary hover:bg-primary/20 hover:border-primary/50 transition-all duration-200'
        : 'glass-button font-medium'
  );

  const isDisabled = $derived(disabled || loading);
</script>

<button
  type="button"
  class="inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200 ease-out disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] {sizeClasses} {variantClasses} {className}"
  disabled={isDisabled}
  {onclick}
  aria-busy={loading}
  data-testid="glow-button"
  data-variant={variant}
>
  {#if loading}
    <svg
      class="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  {/if}
  {@render children()}
</button>
