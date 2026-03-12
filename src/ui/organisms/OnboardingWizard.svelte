<script lang="ts">
  import type { UserProfile } from '$lib/core/types/profile';
  import Chip from '../atoms/Chip.svelte';
  import Icon from '../atoms/Icon.svelte';
  import { ripple } from '../actions/ripple';

  let {
    onComplete,
    onUpdateProfile,
  }: {
    onComplete?: () => void;
    onUpdateProfile?: (profile: Partial<UserProfile>) => void;
  } = $props();

  let title = $state('');
  let stack = $state<string[]>([]);
  let stackInput = $state('');
  let tjm = $state(600);

  function addStack() {
    const trimmed = stackInput.trim();
    if (trimmed && !stack.includes(trimmed)) {
      stack = [...stack, trimmed];
      stackInput = '';
      onUpdateProfile?.({ stack });
    }
  }

  function removeStack(item: string) {
    stack = stack.filter(s => s !== item);
    onUpdateProfile?.({ stack });
  }

  function handleComplete() {
    onUpdateProfile?.({ title, stack, tjmMin: tjm, tjmMax: tjm + 150 });
    onComplete?.();
  }

  let canSubmit = $derived(title.trim().length > 0);
</script>

<div class="space-y-5">
  <div class="space-y-2">
    <div>
      <p class="text-sm font-semibold text-white">Votre profil cible</p>
      <p class="mt-1 text-xs leading-relaxed text-text-secondary">
        Ces informations servent au scoring, au tri du feed et a l'analyse TJM.
      </p>
    </div>
  </div>

  <div>
    <label for="ob-title" class="mb-2 block text-xs uppercase tracking-[0.18em] text-text-muted">Titre / Poste</label>
    <input
      id="ob-title"
      type="text"
      class="soft-ring w-full rounded-[1.15rem] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/30 focus:ring-2 focus:ring-accent-blue/15 transition-all duration-200"
      placeholder="ex: Développeur Fullstack"
      bind:value={title}
    />
  </div>

  <div>
    <label for="ob-stack" class="mb-2 block text-xs uppercase tracking-[0.18em] text-text-muted">Stack technique</label>
    <div class="flex gap-2">
      <input
        id="ob-stack"
        type="text"
        class="soft-ring flex-1 rounded-[1.15rem] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/30 focus:ring-2 focus:ring-accent-blue/15 transition-all duration-200"
        placeholder="ex: React"
        bind:value={stackInput}
        onkeydown={(e) => { if (e.key === 'Enter') addStack(); }}
      />
      <button
        class="inline-flex min-h-12 items-center justify-center rounded-[1.15rem] border border-white/10 bg-white/[0.06] px-4 text-text-secondary transition-all duration-200 hover:bg-white/[0.1] hover:text-text-primary"
        onclick={addStack}
      >
        <Icon name="plus" size={14} />
      </button>
    </div>
    {#if stack.length > 0}
      <div class="mt-3 flex flex-wrap gap-2">
        {#each stack as tech}
          <Chip label={tech} selected={true} onclick={() => removeStack(tech)} />
        {/each}
      </div>
    {/if}
  </div>

  <div>
    <label for="ob-tjm" class="mb-2 block text-xs uppercase tracking-[0.18em] text-text-muted">TJM cible (EUR/jour)</label>
    <div class="section-card rounded-[1.25rem] px-4 py-3">
      <div class="flex items-end justify-between gap-3">
        <div>
          <p class="text-xs text-text-secondary">Base de calibration</p>
          <p class="mt-1 text-[11px] text-text-muted">Nous generons ensuite une fourchette cible.</p>
        </div>
        <div class="flex items-center gap-2">
          <input
            id="ob-tjm"
            type="number"
            class="w-28 rounded-[1rem] border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm font-semibold text-text-primary font-mono focus:outline-none focus:border-accent-blue/30 focus:ring-2 focus:ring-accent-blue/15 transition-all duration-200"
            bind:value={tjm}
          />
          <span class="text-sm font-mono text-accent-blue">EUR</span>
        </div>
      </div>
    </div>
  </div>

  <button
    use:ripple
    class="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-[1.3rem] border border-accent-blue/25 bg-accent-blue/88 py-3 text-sm font-semibold text-navy-900 shadow-[0_18px_30px_rgba(89,198,255,0.24)] transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
    disabled={!canSubmit}
    onclick={handleComplete}
  >
    C'est parti <Icon name="arrow-right" size={16} />
  </button>
</div>
