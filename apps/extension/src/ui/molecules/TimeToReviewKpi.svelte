<script lang="ts">
  /**
   * Atomic KPI of the "Time to review" card.
   * Molecule: props only, no state, no shell dependency.
   * `improved` drives the delta color (blue = improvement), null = neutral.
   */
  const {
    label,
    value,
    delta = null,
    improved = null,
  }: {
    label: string;
    value: string;
    delta?: string | null;
    improved?: boolean | null;
  } = $props();
</script>

<div class="flex min-w-0 flex-col gap-0.5">
  <span class="eyebrow">{label}</span>
  <span class="truncate font-mono text-[15px] leading-tight tabular-nums text-text-primary">
    {value}
  </span>
  {#if delta !== null}
    <span
      class="text-micro font-medium tabular-nums {improved === true
        ? 'text-blueprint-blue'
        : 'text-text-muted'}"
    >
      {delta}
    </span>
  {/if}
</div>
