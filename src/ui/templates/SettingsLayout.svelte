<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../atoms/Icon.svelte';

  let { content, onBack }: {
    content: Snippet;
    onBack?: () => void;
  } = $props();
</script>

<div class="flex h-full flex-col px-4 pb-5 pt-4">
  <div class="section-card flex shrink-0 items-center gap-2 rounded-[1.5rem] px-3 py-3">
    {#if onBack}
      <button
        class="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04] text-text-secondary transition-colors hover:text-text-primary hover:bg-white/[0.08]"
        onclick={onBack}
      >
        <Icon name="chevron-left" size={16} />
      </button>
    {/if}
    <div>
      <p class="eyebrow text-accent-blue/80">Configuration</p>
      <h2 class="mt-1 text-lg font-semibold text-text-primary">Parametres</h2>
    </div>
  </div>
  <div class="flex-1 overflow-y-auto pt-4">
    {@render content()}
  </div>
</div>
