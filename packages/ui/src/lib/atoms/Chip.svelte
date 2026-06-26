<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type ChipSize = 'sm' | 'md' | 'lg';
  type ChipProps = Omit<HTMLButtonAttributes, 'class' | 'disabled' | 'onclick'> & {
    label: string;
    selected?: boolean;
    size?: ChipSize;
    disabled?: boolean;
    class?: string;
    onclick?: HTMLButtonAttributes['onclick'];
  };

  let {
    label,
    selected = false,
    size = 'md',
    disabled = false,
    class: className = '',
    onclick,
    type = 'button',
    ...rest
  }: ChipProps = $props();

  const sizeClasses = $derived(
    size === 'sm' ? 'h-7 px-2 text-[10px]' : size === 'lg' ? 'h-9 px-4 text-sm' : 'h-8 px-3 text-xs'
  );
</script>

<button
  {...rest}
  {type}
  class="inline-flex items-center rounded-full font-system font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blueprint-blue disabled:cursor-not-allowed disabled:opacity-40
    {selected
    ? 'border border-blueprint-blue/30 bg-blueprint-blue/10 text-blueprint-blue'
    : 'border border-border-light bg-surface-white text-text-secondary hover:bg-subtle-gray hover:text-text-primary'}
    {sizeClasses} {className}"
  {disabled}
  {onclick}
  aria-pressed={selected}
>
  {label}
</button>
