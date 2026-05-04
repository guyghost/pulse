<script lang="ts">
  const {
    size = 'md',
    showText = true,
    class: className = '',
  }: {
    size?: 'sm' | 'md' | 'lg';
    showText?: boolean;
    class?: string;
  } = $props();

  const dimensions = $derived(
    size === 'sm'
      ? { icon: 24, fontSize: 'text-base', gap: 'gap-2' }
      : size === 'lg'
        ? { icon: 40, fontSize: 'text-2xl', gap: 'gap-3' }
        : { icon: 32, fontSize: 'text-xl', gap: 'gap-2.5' }
  );
</script>

<div class="flex items-center {dimensions.gap} {className}" data-testid="logo-horizontal">
  <div
    class="relative flex-shrink-0"
    style="width: {dimensions.icon}px; height: {dimensions.icon}px;"
  >
    <!-- Unified ECG Polyline Logo — same as landing page nav/footer/favicon -->
    <svg
      width={dimensions.icon}
      height={dimensions.icon}
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <polyline
        points="18,64 38,64 46,44 54,84 64,38 74,78 82,52 90,64 110,64"
        fill="none"
        stroke="var(--color-text-primary)"
        stroke-width="8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </div>

  {#if showText}
    <div class="flex items-baseline">
      <span class="text-text-secondary text-sm tracking-wide">Mission</span>
      <span class="{dimensions.fontSize} font-bold tracking-wide text-blueprint-blue">Pulse</span>
    </div>
  {/if}
</div>
