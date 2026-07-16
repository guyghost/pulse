<script lang="ts">
  export type OperationalSeverity = 'success' | 'attention' | 'incident' | 'critical' | 'neutral';

  const {
    label,
    severity = 'neutral',
  }: {
    label: string;
    severity?: OperationalSeverity;
  } = $props();

  // Approach B: neutral text on hue tint. Severity hue is carried by the
  // background tint + border (stronger color signal than tiny colored text),
  // keeping every label at AA contrast regardless of severity.
  const toneClass = $derived(
    severity === 'success'
      ? 'border-accent-green/25 bg-accent-green/15 text-text-primary'
      : severity === 'attention'
        ? 'border-status-yellow/30 bg-status-yellow/20 text-text-primary'
        : severity === 'incident'
          ? 'border-status-orange/30 bg-status-orange/15 text-text-primary'
          : severity === 'critical'
            ? 'border-status-red/30 bg-status-red/15 text-text-primary'
            : 'border-border-light bg-page-canvas text-text-subtle'
  );
</script>

<span
  class="inline-flex items-center whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-medium {toneClass}"
>
  {label}
</span>
