<script lang="ts">
  type SkeletonVariant = 'text' | 'circle' | 'card';

  const {
    variant = 'text',
    width = '100%',
    height,
    class: className = '',
  }: {
    variant?: SkeletonVariant;
    width?: string;
    height?: string;
    class?: string;
  } = $props();

  const defaultHeight = $derived(
    height ?? (variant === 'circle' ? width : variant === 'card' ? '80px' : '1rem')
  );

  const variantClasses = $derived(
    variant === 'circle'
      ? 'rounded-full'
      : variant === 'card'
        ? 'rounded-xl'
        : 'rounded-md'
  );
</script>

<div
  class="animate-pulse bg-subtle-gray {variantClasses} {className}"
  style:width={width}
  style:height={defaultHeight}
  aria-hidden="true"
></div>
