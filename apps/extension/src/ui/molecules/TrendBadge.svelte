<script lang="ts">
  import type { TJMTrend } from '$lib/core/types/tjm';
  import { Icon } from '@pulse/ui';

  const { trend }: { trend: TJMTrend } = $props();

  const config = $derived(
    trend === 'up'
      ? {
          icon: 'trending-up' as const,
          label: 'Hausse',
          class: 'text-text-primary bg-blueprint-blue/15',
        }
      : trend === 'down'
        ? {
            icon: 'trending-down' as const,
            label: 'Baisse',
            class: 'text-text-primary bg-status-red/15',
          }
        : {
            icon: 'minus' as const,
            label: 'Stable',
            class: 'text-text-primary bg-text-muted/15',
          }
  );
</script>

<span
  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium {config.class}"
>
  <Icon name={config.icon} size={12} />
  {config.label}
</span>
