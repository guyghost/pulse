<script lang="ts">
  import { createActor } from 'xstate';
  import { tjmMachine } from '../../machines/tjm.machine';
  import TJMDashboard from '../organisms/TJMDashboard.svelte';
  import Button from '../atoms/Button.svelte';
  import Icon from '../atoms/Icon.svelte';
  import type { SeniorityLevel } from '$lib/types/tjm';

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

<div class="flex flex-col h-full">
  <div class="shrink-0 p-3 border-b border-border space-y-3">
    <h2 class="text-sm font-semibold text-text-primary">TJM Intelligence</h2>
    <div class="space-y-2">
      <input
        type="text"
        placeholder="Poste (ex: Développeur React)"
        class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-blue"
        bind:value={title}
      />
      <div class="flex gap-2">
        <input
          type="text"
          placeholder="Ville"
          class="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-blue"
          bind:value={location}
        />
        <select
          class="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-blue"
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
  </div>
  <div class="flex-1 overflow-y-auto p-3">
    <TJMDashboard {analysis} {isLoading} {error} />
  </div>
</div>
