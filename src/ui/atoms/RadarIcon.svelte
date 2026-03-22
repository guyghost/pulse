<script context="module" lang="ts">
  let nextRadarIconId = 0;
</script>

<script lang="ts">

  type RadarState = 'idle' | 'scanning' | 'active';

  let {
    size = 48,
    state = 'idle',
    class: className = '',
  }: {
    size?: number;
    state?: RadarState;
    class?: string;
  } = $props();

  let isAnimating = $derived(state === 'scanning' || state === 'active');
  let primaryColor = $derived(
    state === 'active' ? '#22D3EE' : state === 'scanning' ? '#0E7490' : '#164E63'
  );
  let glowColor = $derived(
    state === 'active' ? 'rgba(34, 211, 238, 0.6)' : state === 'scanning' ? 'rgba(14, 116, 144, 0.4)' : 'rgba(22, 78, 99, 0.2)'
  );

  const gradientIdBase = `radar-icon-${nextRadarIconId++}`;
  const scanGradientId = `${gradientIdBase}-scan`;
  const sweepGradientId = `${gradientIdBase}-sweep`;
</script>

<div
  class="relative inline-flex items-center justify-center {className}"
  style="width: {size}px; height: {size}px;"
  data-testid="radar-icon"
  data-state={state}
>
  {#if isAnimating}
    <div
      class="absolute inset-0 rounded-full radar-ping"
      style="background: radial-gradient(circle, {glowColor}, transparent 70%);"
    ></div>
  {/if}

  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <circle
      cx="24"
      cy="24"
      r="20"
      stroke={primaryColor}
      stroke-opacity="0.2"
      stroke-width="1"
      fill="none"
    />
    <circle
      cx="24"
      cy="24"
      r="14"
      stroke={primaryColor}
      stroke-opacity="0.3"
      stroke-width="1"
      fill="none"
    />
    <circle
      cx="24"
      cy="24"
      r="8"
      stroke={primaryColor}
      stroke-opacity="0.4"
      stroke-width="1.5"
      fill="none"
    />

    <circle
      cx="24"
      cy="24"
      r="3"
      fill={primaryColor}
      class={isAnimating ? 'radar-pulse' : ''}
    />

    {#if isAnimating}
      <g class="radar-scan" style="transform-origin: 24px 24px;">
        <line
          x1="24"
          y1="24"
          x2="24"
          y2="4"
          stroke="url(#{scanGradientId})"
          stroke-width="2"
          stroke-linecap="round"
        />
        <path
          d="M 24 24 L 38 10 A 20 20 0 0 0 24 4 Z"
          fill="url(#{sweepGradientId})"
          opacity="0.3"
        />
      </g>
    {:else}
      <line
        x1="24"
        y1="24"
        x2="24"
        y2="8"
        stroke={primaryColor}
        stroke-opacity="0.6"
        stroke-width="2"
        stroke-linecap="round"
      />
    {/if}

    <defs>
      <linearGradient id={scanGradientId} x1="24" y1="24" x2="24" y2="4" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color={primaryColor} stop-opacity="0" />
        <stop offset="50%" stop-color={primaryColor} stop-opacity="0.8" />
        <stop offset="100%" stop-color="#22D3EE" stop-opacity="1" />
      </linearGradient>
      <radialGradient id={sweepGradientId} cx="24" cy="24" r="20" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color={primaryColor} stop-opacity="0.4" />
        <stop offset="100%" stop-color={primaryColor} stop-opacity="0" />
      </radialGradient>
    </defs>
  </svg>
</div>
