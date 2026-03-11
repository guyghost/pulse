<script lang="ts">
  import type { UserProfile } from '$lib/types/profile';
  import type { SeniorityLevel } from '$lib/types/tjm';
  import type { RemoteType } from '$lib/types/mission';
  import Button from '../atoms/Button.svelte';
  import Chip from '../atoms/Chip.svelte';
  import Icon from '../atoms/Icon.svelte';

  let {
    step = 0,
    onNext,
    onBack,
    onComplete,
    onUpdateProfile,
  }: {
    step?: number;
    onNext?: () => void;
    onBack?: () => void;
    onComplete?: () => void;
    onUpdateProfile?: (profile: Partial<UserProfile>) => void;
  } = $props();

  let title = $state('');
  let stack = $state<string[]>([]);
  let stackInput = $state('');
  let seniority = $state<SeniorityLevel>('confirmed');
  let tjmMin = $state(400);
  let tjmMax = $state(700);
  let location = $state('Paris');
  let remote = $state<RemoteType | 'any'>('any');

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

  const seniorityOptions: { label: string; value: SeniorityLevel }[] = [
    { label: 'Junior (0-3 ans)', value: 'junior' },
    { label: 'Confirm\u00e9 (3-7 ans)', value: 'confirmed' },
    { label: 'Senior (7+ ans)', value: 'senior' },
  ];

  const remoteOptions: { label: string; value: RemoteType | 'any' }[] = [
    { label: 'Indiff\u00e9rent', value: 'any' },
    { label: 'Full remote', value: 'full' },
    { label: 'Hybride', value: 'hybrid' },
    { label: 'Sur site', value: 'onsite' },
  ];
</script>

<div class="space-y-6">
  <!-- Step indicator -->
  <div class="flex items-center gap-2 justify-center">
    {#each [0, 1, 2] as s}
      <div class="w-2 h-2 rounded-full transition-colors {s === step ? 'bg-accent-blue' : s < step ? 'bg-accent-emerald' : 'bg-navy-600'}"></div>
    {/each}
  </div>

  {#if step === 0}
    <!-- Step 1: Profile basics -->
    <div class="space-y-4">
      <h2 class="text-lg font-bold text-text-primary text-center">Votre profil</h2>
      <div>
        <label for="ob-title" class="block text-xs text-text-secondary mb-1">Titre / Poste</label>
        <input
          id="ob-title"
          type="text"
          class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-blue"
          placeholder="ex: D\u00e9veloppeur Fullstack"
          bind:value={title}
          oninput={() => onUpdateProfile?.({ title })}
        />
      </div>
      <div>
        <label for="ob-stack" class="block text-xs text-text-secondary mb-1">Stack technique</label>
        <div class="flex gap-1">
          <input
            id="ob-stack"
            type="text"
            class="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-blue"
            placeholder="ex: React"
            bind:value={stackInput}
            onkeydown={(e) => { if (e.key === 'Enter') addStack(); }}
          />
          <Button variant="secondary" onclick={addStack}>{#snippet children()}+{/snippet}</Button>
        </div>
        <div class="flex flex-wrap gap-1 mt-2">
          {#each stack as tech}
            <Chip label={tech} selected={true} onclick={() => removeStack(tech)} />
          {/each}
        </div>
      </div>
      <div>
        <span class="block text-xs text-text-secondary mb-1">S\u00e9niorit\u00e9</span>
        <div class="flex flex-col gap-1">
          {#each seniorityOptions as opt}
            <button
              class="text-left px-3 py-2 rounded-lg text-sm transition-colors {seniority === opt.value ? 'bg-accent-blue/20 text-accent-blue' : 'bg-surface text-text-secondary hover:bg-surface-hover'}"
              onclick={() => { seniority = opt.value; onUpdateProfile?.({ seniority }); }}
            >
              {opt.label}
            </button>
          {/each}
        </div>
      </div>
    </div>

  {:else if step === 1}
    <!-- Step 2: TJM & location -->
    <div class="space-y-4">
      <h2 class="text-lg font-bold text-text-primary text-center">Tarif & Localisation</h2>
      <div>
        <span class="block text-xs text-text-secondary mb-1">Fourchette TJM (\u20AC/jour)</span>
        <div class="flex items-center gap-2">
          <input
            type="number"
            class="w-24 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-blue"
            bind:value={tjmMin}
            oninput={() => onUpdateProfile?.({ tjmMin })}
          />
          <span class="text-text-muted">\u2014</span>
          <input
            type="number"
            class="w-24 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-blue"
            bind:value={tjmMax}
            oninput={() => onUpdateProfile?.({ tjmMax })}
          />
        </div>
      </div>
      <div>
        <label for="ob-location" class="block text-xs text-text-secondary mb-1">Localisation</label>
        <input
          id="ob-location"
          type="text"
          class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-blue"
          placeholder="ex: Paris"
          bind:value={location}
          oninput={() => onUpdateProfile?.({ location })}
        />
      </div>
      <div>
        <span class="block text-xs text-text-secondary mb-1">Mode de travail</span>
        <div class="flex flex-wrap gap-1">
          {#each remoteOptions as opt}
            <Chip
              label={opt.label}
              selected={remote === opt.value}
              onclick={() => { remote = opt.value; onUpdateProfile?.({ remote }); }}
            />
          {/each}
        </div>
      </div>
    </div>

  {:else if step === 2}
    <!-- Step 3: Summary -->
    <div class="space-y-4">
      <h2 class="text-lg font-bold text-text-primary text-center">R\u00e9capitulatif</h2>
      <div class="bg-surface rounded-lg p-4 space-y-2">
        <div class="flex justify-between text-sm">
          <span class="text-text-secondary">Poste</span>
          <span class="text-text-primary">{title || '\u2014'}</span>
        </div>
        <div class="flex justify-between text-sm">
          <span class="text-text-secondary">Stack</span>
          <span class="text-text-primary">{stack.join(', ') || '\u2014'}</span>
        </div>
        <div class="flex justify-between text-sm">
          <span class="text-text-secondary">TJM</span>
          <span class="text-text-primary font-mono">{tjmMin}\u20AC \u2014 {tjmMax}\u20AC</span>
        </div>
        <div class="flex justify-between text-sm">
          <span class="text-text-secondary">Lieu</span>
          <span class="text-text-primary">{location || '\u2014'}</span>
        </div>
        <div class="flex justify-between text-sm">
          <span class="text-text-secondary">Remote</span>
          <span class="text-text-primary capitalize">{remote}</span>
        </div>
      </div>
    </div>
  {/if}

  <!-- Navigation -->
  <div class="flex justify-between pt-2">
    {#if step > 0}
      <Button variant="ghost" onclick={onBack}>{#snippet children()}<Icon name="chevron-left" size={14} /> Retour{/snippet}</Button>
    {:else}
      <div></div>
    {/if}
    {#if step < 2}
      <Button onclick={onNext}>{#snippet children()}Suivant <Icon name="chevron-right" size={14} />{/snippet}</Button>
    {:else}
      <Button onclick={onComplete}>{#snippet children()}Commencer <Icon name="check" size={14} />{/snippet}</Button>
    {/if}
  </div>
</div>
