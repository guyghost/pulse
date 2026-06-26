<script lang="ts">
  const {
    size = 'md',
    class: className = '',
  }: {
    size?: 'sm' | 'md' | 'lg';
    class?: string;
  } = $props();

  const dimensions = $derived(
    size === 'sm'
      ? { icon: 48, fontSize: 'text-lg', gap: 'gap-2' }
      : size === 'lg'
        ? { icon: 80, fontSize: 'text-3xl', gap: 'gap-3' }
        : { icon: 64, fontSize: 'text-2xl', gap: 'gap-2.5' }
  );
</script>

<div class="flex flex-col items-center {dimensions.gap} {className}" data-testid="logo-vertical">
  <div class="relative" style="width: {dimensions.icon}px; height: {dimensions.icon}px;">
    <!-- Unified ECG Polyline Logo — same as landing page -->
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

  <div class="flex flex-col items-center">
    <span class="text-text-secondary text-xs tracking-[0.35em] uppercase font-medium">
      Mission
    </span>
    <span class="{dimensions.fontSize} font-bold tracking-wide text-blueprint-blue">PULSE</span>
  </div>
</div>
