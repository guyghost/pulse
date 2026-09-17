<script lang="ts">
  /**
   * GaugeArc — SVG half-circle gauge (atom, props only).
   * The background arc is light gray; the value arc covers `ratio` (0..1)
   * of the half-circle. Color is driven by the `color` prop.
   */
  const {
    ratio,
    color = 'gray',
    title,
  }: {
    /** Value arc length, between 0 and 1 */
    ratio: number;
    /** 'blue' = blueprint-blue (concerning line), 'gray' = neutral */
    color?: 'blue' | 'gray';
    /** Accessible description of the gauge value */
    title?: string;
  } = $props();

  const clamped = $derived(Math.min(1, Math.max(0, ratio)));
  const dash = $derived(clamped * 100);
  const strokeClass = $derived(color === 'blue' ? 'text-blueprint-blue' : 'text-text-muted');
</script>

<svg
  width="48"
  height="26"
  viewBox="0 0 48 26"
  fill="none"
  class="shrink-0 {strokeClass}"
  role="img"
  aria-label={title}
>
  <path
    d="M 4 24 A 20 20 0 0 1 44 24"
    stroke="currentColor"
    class="text-disabled-gray/60"
    stroke-width="4"
    stroke-linecap="round"
  />
  {#if clamped > 0}
    <path
      d="M 4 24 A 20 20 0 0 1 44 24"
      stroke="currentColor"
      stroke-width="4"
      stroke-linecap="round"
      pathLength="100"
      stroke-dasharray="{dash} 100"
    />
  {/if}
</svg>
