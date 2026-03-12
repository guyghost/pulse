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

  let firstName = $state('');
  let jobTitle = $state('');
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
    onUpdateProfile?.({ firstName, jobTitle, stack, tjmMin: tjm, tjmMax: tjm + 150 });
    onComplete?.();
  }

  let canSubmit = $derived(firstName.trim().length > 0 && jobTitle.trim().length > 0);
</script>

<div class="space-y-5">
  <div>
    <label for="ob-firstname" class="block text-xs text-text-secondary mb-1.5">Prénom</label>
    <input
      id="ob-firstname"
      type="text"
      class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20 transition-all duration-200"
      placeholder="ex: Guy"
      bind:value={firstName}
    />
  </div>

  <div>
    <label for="ob-jobtitle" class="block text-xs text-text-secondary mb-1.5">Poste recherché</label>
    <input
      id="ob-jobtitle"
      type="text"
      class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20 transition-all duration-200"
      placeholder="ex: Développeur React Senior"
      bind:value={jobTitle}
    />
  </div>

  <div>
    <label for="ob-stack" class="block text-xs text-text-secondary mb-1.5">Stack technique</label>
    <div class="flex gap-1.5">
      <input
        id="ob-stack"
        type="text"
        class="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20 transition-all duration-200"
        placeholder="ex: React"
        bind:value={stackInput}
        onkeydown={(e) => { if (e.key === 'Enter') addStack(); }}
      />
      <button
        class="px-3 py-2.5 bg-white/[0.07] border border-white/10 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/[0.12] transition-all duration-200"
        onclick={addStack}
      >+</button>
    </div>
    {#if stack.length > 0}
      <div class="flex flex-wrap gap-1.5 mt-2">
        {#each stack as tech}
          <Chip label={tech} selected={true} onclick={() => removeStack(tech)} />
        {/each}
      </div>
    {/if}
  </div>

  <div>
    <label for="ob-tjm" class="block text-xs text-text-secondary mb-1.5">TJM cible (€/jour)</label>
    <input
      id="ob-tjm"
      type="number"
      class="w-32 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20 transition-all duration-200"
      bind:value={tjm}
    />
  </div>

  <button
    use:ripple
    class="w-full py-3 bg-accent-blue hover:bg-accent-blue-hover text-white font-semibold rounded-xl shadow-glow-blue transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
    disabled={!canSubmit}
    onclick={handleComplete}
  >
    C'est parti <Icon name="arrow-right" size={16} />
  </button>
</div>
