<script lang="ts">
  /**
   * Segmented confidence gauge: small vertical bars, blue = confidence,
   * light gray = remainder, plus the numeric 0.xx value in blue mono.
   * Pure atom — props only, no state-module access.
   */
  const {
    value,
    segments = 10,
    showValue = true,
  }: {
    /** Confidence in [0, 1]. */
    value: number;
    /** Number of vertical segments. */
    segments?: number;
    showValue?: boolean;
  } = $props();

  const clamped = $derived(Math.min(1, Math.max(0, value)));
  const filledCount = $derived(Math.round(clamped * segments));
  const label = $derived(`Confiance d'extraction ${clamped.toFixed(2)}`);

  const filledSegments = $derived(
    Array.from({ length: segments }, (_, index) => index < filledCount)
  );
</script>

<span class="inline-flex items-center gap-1.5" title={label} aria-label={label}>
  <span class="flex items-end gap-[2px]" aria-hidden="true">
    {#each filledSegments as filled, index (index)}
      <span
        class="w-[3px] rounded-[1px] {filled ? 'bg-blueprint-blue' : 'bg-subtle-gray'}"
        style="height: {6 + (index % 3) * 2}px"
      ></span>
    {/each}
  </span>
  {#if showValue}
    <span class="font-mono text-[10px] leading-none text-blueprint-blue tabular-nums">
      {clamped.toFixed(2)}
    </span>
  {/if}
</span>
