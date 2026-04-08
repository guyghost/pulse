<script module lang="ts">
  let nextLogoVerticalId = 0;
</script>

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

  const gradientIdBase = `logo-vertical-${nextLogoVerticalId++}`;
  const centerGlowId = `${gradientIdBase}-center-glow`;
  const scanLineGradientId = `${gradientIdBase}-scan-line`;
</script>

<div class="flex flex-col items-center {dimensions.gap} {className}" data-testid="logo-vertical">
  <div class="relative" style="width: {dimensions.icon}px; height: {dimensions.icon}px;">
    <div
      class="absolute inset-0 rounded-full opacity-40"
      style="background: radial-gradient(circle, rgba(14, 116, 144, 0.4), transparent 70%);"
    ></div>

    <svg
      width={dimensions.icon}
      height={dimensions.icon}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle
        cx="32"
        cy="32"
        r="28"
        stroke="#0E7490"
        stroke-opacity="0.3"
        stroke-width="1.5"
        fill="none"
      />

      <circle
        cx="32"
        cy="32"
        r="20"
        stroke="#0E7490"
        stroke-opacity="0.4"
        stroke-width="1.5"
        fill="none"
      />

      <circle
        cx="32"
        cy="32"
        r="12"
        stroke="#0E7490"
        stroke-opacity="0.5"
        stroke-width="2"
        fill="none"
      />

      <circle cx="32" cy="32" r="6" fill="url(#{centerGlowId})" />

      <line
        x1="32"
        y1="32"
        x2="32"
        y2="6"
        stroke="url(#{scanLineGradientId})"
        stroke-width="3"
        stroke-linecap="round"
      />

      <circle cx="32" cy="4" r="2.5" fill="#22D3EE" />
      <circle cx="52" cy="18" r="2" fill="#22D3EE" opacity="0.6" />
      <circle cx="56" cy="36" r="1.5" fill="#22D3EE" opacity="0.4" />

      <defs>
        <radialGradient id={centerGlowId} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stop-color="#22D3EE" />
          <stop offset="100%" stop-color="#0E7490" />
        </radialGradient>
        <linearGradient
          id={scanLineGradientId}
          x1="32"
          y1="32"
          x2="32"
          y2="6"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stop-color="#0E7490" stop-opacity="0.3" />
          <stop offset="50%" stop-color="#0E7490" stop-opacity="0.8" />
          <stop offset="100%" stop-color="#22D3EE" />
        </linearGradient>
      </defs>
    </svg>
  </div>

  <div class="flex flex-col items-center">
    <span class="text-text-secondary text-xs tracking-[0.35em] uppercase font-medium">
      Mission
    </span>
    <span class="{dimensions.fontSize} font-bold tracking-wide gradient-text"> PULSE </span>
  </div>
</div>
