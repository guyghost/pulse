<script lang="ts">
  // Wrapper for lucide-svelte icons
  // Usage: <Icon name="search" size={16} />
  // Note: Actual icon rendering will use dynamic import of lucide-svelte icons

  let { name, size = 16, class: className = '' }: {
    name: string;
    size?: number;
    class?: string;
  } = $props();
</script>

<svg
  class="inline-block {className}"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <!-- Placeholder: actual icons loaded from lucide-svelte -->
  {#if name === 'search'}
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
  {:else if name === 'x'}
    <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
  {:else if name === 'check'}
    <path d="M20 6 9 17l-5-5"/>
  {:else if name === 'chevron-right'}
    <path d="m9 18 6-6-6-6"/>
  {:else if name === 'chevron-left'}
    <path d="m15 18-6-6 6-6"/>
  {:else if name === 'refresh-cw'}
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
  {:else if name === 'settings'}
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>
  {:else if name === 'briefcase'}
    <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>
  {:else if name === 'trending-up'}
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
  {:else if name === 'trending-down'}
    <polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>
  {:else if name === 'minus'}
    <path d="M5 12h14"/>
  {:else if name === 'plus'}
    <path d="M12 5v14"/><path d="M5 12h14"/>
  {:else if name === 'arrow-right'}
    <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
  {:else if name === 'loader'}
    <path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/>
  {:else if name === 'star'}
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  {:else if name === 'chevron-down'}
    <path d="m6 9 6 6 6-6"/>
  {:else if name === 'x-circle'}
    <circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>
  {:else if name === 'link'}
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  {:else if name === 'external-link'}
    <path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
  {:else if name === 'eye'}
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>
  {:else if name === 'eye-off'}
    <path d="m2 2 20 20"/><path d="M10.58 10.58a2 2 0 1 0 2.84 2.84"/><path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c5 0 9.27 3.11 11 7-.49 1.12-1.17 2.14-2 3"/><path d="M6.61 6.61C4.62 8 3 9.94 2 12c1.73 3.89 6 7 10 7 1.61 0 3.16-.4 4.53-1.11"/>
  {/if}
</svg>
