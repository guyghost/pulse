<script lang="ts">
  import { Icon } from '@pulse/ui';
  import { useDebouncedSearch } from '$lib/shell/utils/debounce-svelte.svelte';

  let {
    value = '',
    onSearch,
    inputRef = $bindable<HTMLInputElement | null>(null),
  }: {
    value?: string;
    onSearch?: (query: string) => void;
    inputRef?: HTMLInputElement | null;
  } = $props();

  const search = useDebouncedSearch((q) => onSearch?.(q), 300);

  // Sync external value to internal state ONLY when the prop actually changes
  // (e.g. parent calls clearSearch). We track the previous prop value to avoid
  // resetting user input — without this, the $effect would fire on every
  // keystroke because localValue diverges from the prop during debounce.
  let prevValue = $state('');
  $effect(() => {
    // Read `value` reactively — this makes the effect re-run when the prop changes.
    // Compare against prevValue using untrack to avoid circular dependency.
    const currentProp = value;
    const prev = $state.snapshot(prevValue);
    if (currentProp !== prev) {
      prevValue = currentProp;
      search.setValue(currentProp);
    }
  });

  export function focus() {
    inputRef?.focus();
  }

  export function clear() {
    search.handleClear();
  }

  export function getValue() {
    return search.query;
  }
</script>

<div class="relative">
  <div class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">
    <Icon name="search" size={14} />
  </div>
  <input
    bind:this={inputRef}
    type="text"
    placeholder="Rechercher une mission, une stack, un client..."
    class="soft-ring w-full rounded-xl border border-border-light bg-surface-white pl-10 pr-10 py-3 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-blueprint-blue/30 focus:ring-2 focus:ring-blueprint-blue/15 transition-all duration-200"
    value={search.query}
    oninput={search.handleInput}
  />
  {#if search.query}
    <button
      class="absolute right-3 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-subtle-gray text-text-muted transition-colors duration-200 hover:text-text-primary"
      onclick={search.handleClear}
      aria-label="Effacer la recherche"
    >
      <Icon name="x" size={14} />
    </button>
  {/if}
</div>
