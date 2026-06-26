<script lang="ts">
  export type OperationalSeverity = 'success' | 'attention' | 'incident' | 'critical' | 'neutral';

  const {
    label,
    severity = 'neutral',
  }: {
    label: string;
    severity?: OperationalSeverity;
  } = $props();

  const toneClass = $derived(
    severity === 'success'
      ? 'border-accent-green/25 bg-accent-green/10 text-accent-green'
      : severity === 'attention'
        ? 'border-status-yellow/30 bg-status-yellow/15 text-status-orange'
        : severity === 'incident'
          ? 'border-status-orange/30 bg-status-orange/10 text-status-orange'
          : severity === 'critical'
            ? 'border-status-red/30 bg-status-red/10 text-status-red'
            : 'border-border-light bg-page-canvas text-text-subtle'
  );
</script>

<span
  class="inline-flex items-center rounded-md border px-2 py-1 text-[10px] font-medium {toneClass}"
>
  {label}
</span>
