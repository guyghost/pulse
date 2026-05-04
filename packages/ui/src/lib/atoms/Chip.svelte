<script lang="ts">
  type ChipSize = 'sm' | 'md' | 'lg';

  const {
    label,
    selected = false,
    size = 'md',
    disabled = false,
    class: className = '',
    onclick,
  }: {
    label: string;
    selected?: boolean;
    size?: ChipSize;
    disabled?: boolean;
    class?: string;
    onclick?: () => void;
  } = $props();

  const sizeClasses = $derived(
    size === 'sm'
      ? 'px-2 py-1 text-[10px]'
      : size === 'lg'
        ? 'px-4 py-2 text-sm'
        : 'px-3 py-1.5 text-xs'
  );
</script>

<button
  class="inline-flex items-center rounded-full font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed
    {selected
    ? 'border border-blueprint-blue/25 bg-blueprint-blue/14 text-blueprint-blue'
    : 'border border-border-light bg-surface-white text-text-secondary hover:bg-subtle-gray hover:text-text-primary'}
    {sizeClasses} {className}"
  {disabled}
  {onclick}
>
  {label}
</button>
