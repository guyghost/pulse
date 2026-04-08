<script lang="ts">
  const {
    width = '100%',
    height = '1rem',
    rounded = 'md',
  }: {
    width?: string;
    height?: string;
    rounded?: 'sm' | 'md' | 'lg' | 'full';
  } = $props();

  const roundedClass = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full',
  };
</script>

<div class="animate-pulse bg-navy-700 {roundedClass[rounded]}" style:width style:height></div>
