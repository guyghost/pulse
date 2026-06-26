<script lang="ts">
  type BadgeVariant = 'tech' | 'status' | 'source' | 'success' | 'warning' | 'error';
  type BadgeSize = 'sm' | 'md';

  const {
    label,
    variant = 'tech',
    size = 'sm',
    class: className = '',
  }: {
    label: string;
    variant?: BadgeVariant;
    size?: BadgeSize;
    class?: string;
  } = $props();

  const sizeClasses = $derived(size === 'md' ? 'px-2 py-1 text-xs' : 'px-1.5 py-0.5 text-[10px]');

  const variantClasses = $derived(
    variant === 'tech'
      ? 'border border-blueprint-blue/15 bg-blueprint-blue/6 text-blueprint-blue font-mono'
      : variant === 'status'
        ? 'border border-status-violet/15 bg-status-violet/8 text-status-violet'
        : variant === 'success'
          ? 'border border-accent-green/15 bg-accent-green/8 text-accent-green'
          : variant === 'warning'
            ? 'border border-accent-amber/15 bg-accent-amber/8 text-accent-amber'
            : variant === 'error'
              ? 'border border-status-red/15 bg-status-red/8 text-status-red'
              : 'border border-border-light bg-page-canvas text-text-subtle'
  );
</script>

<span
  class="inline-flex items-center rounded-md font-system font-medium leading-[1.3] {sizeClasses} {variantClasses} {className}"
>
  {label}
</span>
