<script lang="ts">
  import { Icon } from '@pulse/ui';

  const {
    title = 'Mode hors ligne',
    description,
    action = null,
  }: {
    title?: string;
    description: string;
    action?: string | null;
  } = $props();
</script>

<aside
  class="rounded-xl border border-status-orange/25 bg-status-orange/8 px-3 py-2.5"
  role="status"
  aria-live="polite"
>
  <div class="flex items-start gap-2">
    <Icon name="wifi-off" size={14} class="mt-0.5 shrink-0 text-status-orange" />
    <div class="min-w-0">
      <p class="text-xs font-semibold text-text-primary">{title}</p>
      <p class="mt-0.5 text-[11px] leading-4 text-text-subtle">{description}</p>
      {#if action}
        <p class="mt-1 text-[11px] font-medium text-status-orange">{action}</p>
      {/if}
    </div>
  </div>
</aside>
