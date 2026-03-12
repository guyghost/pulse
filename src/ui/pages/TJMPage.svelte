<script lang="ts">
  import { createActor } from 'xstate';
  import { tjmMachine } from '../../machines/tjm.machine';
  import TJMDashboard from '../organisms/TJMDashboard.svelte';
  import Button from '../atoms/Button.svelte';
  import Icon from '../atoms/Icon.svelte';
  import type { SeniorityLevel } from '$lib/core/types/tjm';

  const tjmActor = createActor(tjmMachine);
  tjmActor.start();

  let snapshot = $state(tjmActor.getSnapshot());

  $effect(() => {
    const sub = tjmActor.subscribe((s) => { snapshot = s; });
    return () => sub.unsubscribe();
  });

  let title = $state('');
  let location = $state('Paris');
  let seniority = $state<SeniorityLevel>('senior');
  let isLoading = $derived(snapshot.matches('aggregating') || snapshot.matches('callingLLM'));
  let error = $derived(snapshot.context.error);
  let analysis = $derived(snapshot.context.analysis);

  function analyze() {
    if (!title.trim()) return;
    tjmActor.send({ type: 'ANALYZE', title, location, seniority });
  }
</script>

<div class="flex h-full flex-col px-4 pb-5 pt-4">
  <section class="section-card-strong rounded-[1.75rem] p-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="eyebrow text-accent-blue/80">TJM Intelligence</p>
        <h2 class="mt-2 text-[1.7rem] font-semibold leading-none text-white">Positionnez votre prix</h2>
        <p class="mt-3 text-sm leading-relaxed text-text-secondary">
          Croisez les donnees du feed avec une lecture synthesee pour cadrer votre fourchette.
        </p>
      </div>
      <div class="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06]">
        <Icon name="trending-up" size={16} class="text-accent-blue" />
      </div>
    </div>

    <div class="mt-4 space-y-2">
      <input
        type="text"
        placeholder="Poste (ex: Développeur React)"
        class="soft-ring w-full rounded-[1.1rem] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue/30 focus:ring-2 focus:ring-accent-blue/15"
        bind:value={title}
      />
      <div class="flex gap-2">
        <input
          type="text"
          placeholder="Ville"
          class="soft-ring flex-1 rounded-[1.1rem] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue/30 focus:ring-2 focus:ring-accent-blue/15"
          bind:value={location}
        />
        <select
          class="soft-ring rounded-[1.1rem] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue/30 focus:ring-2 focus:ring-accent-blue/15"
          bind:value={seniority}
        >
          <option value="junior">Junior</option>
          <option value="confirmed">Confirmé</option>
          <option value="senior">Senior</option>
        </select>
      </div>
      <Button onclick={analyze}>
        {#snippet children()}<Icon name="trending-up" size={14} /> Analyser{/snippet}
      </Button>
    </div>
  </section>
  <div class="flex-1 overflow-y-auto pt-4">
    <TJMDashboard {analysis} {isLoading} {error} />
  </div>
</div>
