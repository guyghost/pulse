<script lang="ts">
  import type { CircuitState } from '$lib/core/types/health';

  const {
    state,
    size = 'sm',
    showLabel = false,
  }: {
    state: CircuitState;
    /** 'sm' = 8px dot, 'md' = 10px dot */
    size?: 'sm' | 'md';
    showLabel?: boolean;
  } = $props();

  const config = $derived.by(() => {
    switch (state) {
      case 'closed':
        return {
          dotClass: 'bg-accent-emerald shadow-[0_0_6px_theme(colors.accent-emerald/60%)]',
          labelClass: 'text-accent-emerald',
          label: 'Opérationnel',
          title: 'Connecteur opérationnel',
        };
      case 'half-open':
        return {
          dotClass: 'bg-accent-amber shadow-[0_0_6px_theme(colors.accent-amber/60%)]',
          labelClass: 'text-accent-amber',
          label: 'Sonde...',
          title: 'Connecteur en cours de récupération',
        };
      case 'open':
        return {
          dotClass: 'bg-red-400 shadow-[0_0_6px_theme(colors.red-400/60%)]',
          labelClass: 'text-red-400',
          label: 'Suspendu',
          title: 'Connecteur suspendu — trop d\'erreurs',
        };
    }
  });

  const dotSize = $derived(size === 'md' ? 'size-2.5' : 'size-2');
</script>

<span
  class="inline-flex items-center gap-1.5"
  title={config.title}
  aria-label={config.title}
>
  <span
    class="shrink-0 rounded-full {dotSize} {config.dotClass}"
    aria-hidden="true"
  ></span>
  {#if showLabel}
    <span class="text-[10px] font-medium {config.labelClass}">{config.label}</span>
  {/if}
</span>
