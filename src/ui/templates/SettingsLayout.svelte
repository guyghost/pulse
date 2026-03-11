<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../atoms/Icon.svelte';

  let { content, onBack }: {
    content: Snippet;
    onBack?: () => void;
  } = $props();
</script>

<div class="flex flex-col h-full">
  <div class="shrink-0 flex items-center gap-2 p-3 border-b border-border">
    {#if onBack}
      <button
        class="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
        onclick={onBack}
      >
        <Icon name="chevron-left" size={16} />
      </button>
    {/if}
    <h2 class="text-sm font-semibold text-text-primary">Paramètres</h2>
  </div>
  <div class="flex-1 overflow-y-auto p-3">
    {@render content()}
  </div>
</div>
