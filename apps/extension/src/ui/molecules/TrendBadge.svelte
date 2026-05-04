<script lang="ts">
  import type { TJMTrend } from '$lib/core/types/tjm';
  import { Icon } from '@pulse/ui';

  const { trend }: { trend: TJMTrend } = $props();

  const config = $derived(
    trend === 'up'
      ? {
          icon: 'trending-up' as const,
          label: 'Hausse',
          class: 'text-blueprint-blue bg-blueprint-blue/10',
        }
      : trend === 'down'
        ? {
            icon: 'trending-down' as const,
            label: 'Baisse',
            class: 'text-status-red bg-status-red/10',
          }
        : { icon: 'minus' as const, label: 'Stable', class: 'text-blueprint-blue bg-blueprint-blue/10' }
  );
</script>

<span
  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium {config.class}"
>
  <Icon name={config.icon} size={12} />
  {config.label}
</span>
