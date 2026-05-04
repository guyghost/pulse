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

  const sizeClasses = $derived(
    size === 'md'
      ? 'px-2 py-1 text-xs'
      : 'px-1.5 py-0.5 text-[10px]'
  );

  const variantClasses = $derived(
    variant === 'tech'
      ? 'border border-blueprint-blue/15 bg-blueprint-blue/6 text-blueprint-blue font-mono'
      : variant === 'status'
        ? 'border border-blueprint-blue/15 bg-blueprint-blue/6 text-blueprint-blue'
        : variant === 'success'
          ? 'border border-accent-green/15 bg-accent-green/6 text-accent-green'
          : variant === 'warning'
            ? 'border border-accent-amber/15 bg-accent-amber/6 text-accent-amber'
            : variant === 'error'
              ? 'border border-status-red/15 bg-status-red/6 text-status-red'
              : 'border border-border-light bg-page-canvas text-text-subtle'
  );
</script>

<span class="inline-flex items-center rounded-md {sizeClasses} {variantClasses} {className}">
  {label}
</span>
