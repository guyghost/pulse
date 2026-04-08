<script module lang="ts">
  let nextLogoHorizontalId = 0;
</script>

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

  const gradientIdBase = `logo-horizontal-${nextLogoHorizontalId++}`;
  const centerGlowId = `${gradientIdBase}-center-glow`;
  const scanLineId = `${gradientIdBase}-scan-line`;
</script>

<div class="flex items-center {dimensions.gap} {className}" data-testid="logo-horizontal">
  <div
    class="relative flex-shrink-0"
    style="width: {dimensions.icon}px; height: {dimensions.icon}px;"
  >
    <svg
      width={dimensions.icon}
      height={dimensions.icon}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle
        cx="16"
        cy="16"
        r="14"
        stroke="#0E7490"
        stroke-opacity="0.3"
        stroke-width="1"
        fill="none"
      />
      <circle
        cx="16"
        cy="16"
        r="10"
        stroke="#0E7490"
        stroke-opacity="0.4"
        stroke-width="1"
        fill="none"
      />
      <circle
        cx="16"
        cy="16"
        r="6"
        stroke="#0E7490"
        stroke-opacity="0.5"
        stroke-width="1.5"
        fill="none"
      />

      <circle cx="16" cy="16" r="2.5" fill="url(#{centerGlowId})" />

      <line
        x1="16"
        y1="16"
        x2="16"
        y2="3"
        stroke="url(#{scanLineId})"
        stroke-width="2"
        stroke-linecap="round"
      />

      <circle cx="16" cy="2" r="1.5" fill="#22D3EE" />

      <defs>
        <radialGradient id={centerGlowId} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stop-color="#22D3EE" />
          <stop offset="100%" stop-color="#0E7490" />
        </radialGradient>
        <linearGradient
          id={scanLineId}
          x1="16"
          y1="16"
          x2="16"
          y2="3"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stop-color="#0E7490" stop-opacity="0.3" />
          <stop offset="100%" stop-color="#22D3EE" />
        </linearGradient>
      </defs>
    </svg>
  </div>

  {#if showText}
    <div class="flex items-baseline">
      <span class="text-text-secondary text-sm tracking-wide"> Mission </span>
      <span class="{dimensions.fontSize} font-bold tracking-wide gradient-text"> Pulse </span>
    </div>
  {/if}
</div>
