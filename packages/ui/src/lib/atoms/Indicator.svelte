<script lang="ts">
  type IndicatorStatus = 'online' | 'offline' | 'error' | 'idle';
  type IndicatorSize = 'sm' | 'md' | 'lg';

  const {
    status,
    size = 'sm',
    pulse = false,
    class: className = '',
  }: {
    status: IndicatorStatus;
    size?: IndicatorSize;
    pulse?: boolean;
    class?: string;
  } = $props();

  const colorClass = $derived(
    status === 'online'
      ? 'bg-blueprint-blue'
      : status === 'error'
        ? 'bg-status-red'
        : status === 'offline'
          ? 'bg-status-orange'
          : 'bg-disabled-gray'
  );

  const sizeClass = $derived(
    size === 'lg' ? 'size-3' : size === 'md' ? 'size-2.5' : 'size-2'
  );
</script>

<span class="inline-block rounded-full {sizeClass} {colorClass} {className}" aria-hidden="true">
  {#if pulse}
    <span class="inline-block size-full rounded-full animate-ping opacity-75 {colorClass}"></span>
  {/if}
</span>
