<script lang="ts">
  import type { Snippet } from 'svelte';

  type ButtonVariant = 'primary' | 'secondary' | 'ghost';
  type ButtonSize = 'sm' | 'md' | 'lg';

  const {
    variant = 'primary',
    size = 'md',
    disabled = false,
    loading = false,
    class: className = '',
    onclick,
    children,
  }: {
    variant?: ButtonVariant;
    size?: ButtonSize;
    disabled?: boolean;
    loading?: boolean;
    class?: string;
    onclick?: () => void;
    children: Snippet;
  } = $props();

  const isDisabled = $derived(disabled || loading);

  const sizeClasses = $derived(
    size === 'sm'
      ? 'h-8 px-3 text-xs gap-1'
      : size === 'lg'
        ? 'h-12 px-6 text-base gap-2.5'
        : 'h-10 px-4 text-sm gap-1.5'
  );

  const variantClasses = $derived(
    variant === 'primary'
      ? 'border border-blueprint-blue/30 bg-blueprint-blue text-surface-white hover:bg-blueprint-blue/90'
      : variant === 'secondary'
        ? 'border border-border-light bg-surface-white text-text-primary hover:bg-subtle-gray'
        : 'text-text-subtle hover:bg-page-canvas hover:text-text-primary'
  );
</script>

<button
  class="inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150 ease-out disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] {sizeClasses} {variantClasses} {className}"
  disabled={isDisabled}
  {onclick}
  aria-busy={loading}
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
