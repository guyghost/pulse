<script lang="ts">
  /**
   * GaugeArc — jauge demi-cercle SVG (atome, props only).
   * L'arc de fond est gris clair, l'arc de valeur couvre `ratio` (0..1)
   * du demi-cercle. La couleur est pilotée par la prop `color`.
   */
  const {
    ratio,
    color = 'gray',
    title,
  }: {
    /** Longueur de l'arc de valeur, entre 0 et 1 */
    ratio: number;
    /** 'blue' = blueprint-blue (ligne préoccupante), 'gray' = neutre */
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
