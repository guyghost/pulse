<script lang="ts">
  import Icon from '../atoms/Icon.svelte';

  let { value = '', onSearch }: {
    value?: string;
    onSearch?: (query: string) => void;
  } = $props();

  let localValue = $state('');
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Sync with external value prop
  $effect(() => {
    localValue = value;
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
  <div class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted">
    <Icon name="search" size={14} />
  </div>
  <input
    type="text"
    placeholder="Rechercher..."
    class="w-full bg-surface border border-border rounded-lg pl-8 pr-8 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue transition-colors"
    value={localValue}
    oninput={handleInput}
  />
  {#if localValue}
    <button
      class="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
      onclick={clear}
    >
      <Icon name="x" size={14} />
    </button>
  {/if}
</div>
