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

  // Hue carried by border + background tint; text neutral for WCAG AA.
  const variantClasses = $derived(
    variant === 'tech'
      ? 'border border-blueprint-blue/15 bg-blueprint-blue/8 text-text-primary font-mono'
      : variant === 'status'
        ? 'border border-status-violet/15 bg-status-violet/10 text-text-primary'
        : variant === 'success'
          ? 'border border-accent-green/15 bg-accent-green/10 text-text-primary'
          : variant === 'warning'
            ? 'border border-accent-amber/15 bg-accent-amber/10 text-text-primary'
            : variant === 'error'
              ? 'border border-status-red/15 bg-status-red/10 text-text-primary'
              : 'border border-border-light bg-page-canvas text-text-subtle'
  );
</script>

<span
  class="inline-flex items-center rounded-md font-system font-medium leading-[1.3] {sizeClasses} {variantClasses} {className}"
>
  {label}
</span>
