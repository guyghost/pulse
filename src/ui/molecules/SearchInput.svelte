<script lang="ts">
  import Icon from '../atoms/Icon.svelte';

  let { value = '', onSearch }: {
    value?: string;
    onSearch?: (query: string) => void;
  } = $props();

  let localValue = $state('');
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    localValue = value;
  });

  $effect(() => {
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  });

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    localValue = target.value;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      onSearch?.(localValue);
    }, 300);
  }

  function clear() {
    localValue = '';
    onSearch?.('');
  }
</script>

<div class="relative">
  <div class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">
    <Icon name="search" size={14} />
  </div>
  <input
    type="text"
    placeholder="Rechercher une mission, une stack, un client..."
    class="soft-ring w-full rounded-[1.1rem] border border-white/8 bg-white/[0.04] pl-10 pr-10 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/30 focus:bg-white/[0.06] focus:ring-2 focus:ring-accent-blue/15 transition-all duration-200"
    value={localValue}
    oninput={handleInput}
  />
  {#if localValue}
    <button
      class="absolute right-3 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/[0.06] text-text-muted transition-colors duration-200 hover:text-text-primary"
      onclick={clear}
    >
      <Icon name="x" size={14} />
    </button>
  {/if}
</div>
