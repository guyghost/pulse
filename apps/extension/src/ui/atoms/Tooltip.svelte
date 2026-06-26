<script module lang="ts">
  let tooltipIdCounter = 0;
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fade } from 'svelte/transition';

  type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

  const {
    label,
    description = null,
    side = 'top',
    disabled = false,
    children,
  }: {
    label: string;
    description?: string | null;
    side?: TooltipSide;
    disabled?: boolean;
    children: Snippet;
  } = $props();

  const tooltipId = `tooltip-${++tooltipIdCounter}`;
  let isOpen = $state(false);

  const placementClass = $derived.by(() => {
    if (side === 'bottom') {
      return 'left-1/2 top-[calc(100%+0.5rem)] -translate-x-1/2';
    }
    if (side === 'left') {
      return 'right-[calc(100%+0.5rem)] top-1/2 -translate-y-1/2';
    }
    if (side === 'right') {
      return 'left-[calc(100%+0.5rem)] top-1/2 -translate-y-1/2';
    }
    return 'bottom-[calc(100%+0.5rem)] left-1/2 -translate-x-1/2';
  });

  function open() {
    if (!disabled) {
      isOpen = true;
    }
  }

  function close() {
    isOpen = false;
  }
</script>

<span
  class="relative inline-flex"
  role="group"
  aria-describedby={isOpen ? tooltipId : undefined}
  onmouseenter={open}
  onmouseleave={close}
  onfocusin={open}
  onfocusout={close}
>
  {@render children()}

  {#if isOpen}
    <span
      id={tooltipId}
      role="tooltip"
      class="pointer-events-none absolute z-50 w-max max-w-52 rounded-lg border border-border-light bg-text-primary px-2.5 py-2 text-left font-geist text-[11px] leading-4 text-white shadow-subtle-3 {placementClass}"
      transition:fade={{ duration: 100 }}
    >
      <span class="block font-semibold">{label}</span>
      {#if description}
        <span class="mt-0.5 block text-white/75">{description}</span>
      {/if}
    </span>
  {/if}
</span>
