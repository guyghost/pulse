<script lang="ts">
  import TJMDashboard from '../organisms/TJMDashboard.svelte';
  import Icon from '../atoms/Icon.svelte';
  import type { TJMAnalysis } from '$lib/core/types/tjm';
  import { getTJMAnalysis } from '$lib/shell/facades/tjm.facade';
  import { subscribeToConnection, type ConnectionInfo } from '$lib/shell/utils/connection-monitor';

  let analysis = $state<TJMAnalysis | null>(null);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let connectionStatus = $state<ConnectionInfo['status']>('unknown');

  async function loadAnalysis() {
    isLoading = true;
    error = null;

    try {
      analysis = await getTJMAnalysis();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Impossible de charger les tendances TJM';
    } finally {
      isLoading = false;
    }
  }

  const isOffline = $derived(connectionStatus === 'offline');

  $effect(() => {
    loadAnalysis();
  });

  $effect(() => {
    const unsubscribe = subscribeToConnection((info) => {
      connectionStatus = info.status;
    });
    return unsubscribe;
  });
</script>

<div class="flex h-full flex-col overflow-y-auto px-4 pb-5 pt-4">
  <section class="section-card-strong relative overflow-hidden rounded-[1.75rem] px-4 py-4">
    <div class="pointer-events-none absolute -right-8 top-0 h-28 w-28 rounded-full bg-accent-blue/14 blur-3xl"></div>
    <div class="relative">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="eyebrow text-accent-blue/80">TJM</p>
          <h2 class="mt-2 text-[1.65rem] font-semibold leading-none text-white">Radar marché</h2>
          <p class="mt-3 max-w-80 text-sm leading-relaxed text-text-secondary">
            Suivez les fourchettes observées sur vos stacks et repérez rapidement les signaux de marché.
          </p>
        </div>
        <div class="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white">
          <Icon name="chart-column" size={16} />
        </div>
      </div>

      {#if isOffline}
        <div class="mt-3 flex items-center gap-2 rounded-xl border border-accent-amber/20 bg-accent-amber/5 px-3 py-2 text-xs text-accent-amber">
          <Icon name="database" size={14} />
          <span>Mode hors ligne — Affichage des dernières données en cache</span>
        </div>
      {/if}

      {#if analysis && !isLoading}
        <div class="mt-4 grid grid-cols-3 gap-2">
          <div class="rounded-[1.25rem] border border-white/8 bg-white/5 px-3 py-3">
            <p class="text-[11px] uppercase tracking-[0.18em] text-text-muted">Stacks</p>
            <p class="mt-2 text-xl font-semibold text-white">{analysis.topStacks.length}</p>
          </div>
          <div class="rounded-[1.25rem] border border-white/8 bg-white/4 px-3 py-3">
            <p class="text-[11px] uppercase tracking-[0.18em] text-text-muted">Points</p>
            <p class="mt-2 text-xl font-semibold text-white">{analysis.dataPoints}</p>
          </div>
          <div class="rounded-[1.25rem] border border-white/8 bg-white/4 px-3 py-3">
            <p class="text-[11px] uppercase tracking-[0.18em] text-text-muted">Maj</p>
            <p class="mt-2 text-sm font-semibold text-white">{analysis.lastUpdated ?? 'N/A'}</p>
          </div>
        </div>
      {/if}
    </div>
  </section>

  <section class="mt-4">
    <TJMDashboard {analysis} {isLoading} {error} />
  </section>

  {#if analysis && analysis.topStacks.length > 0 && !isLoading}
    <section class="section-card mt-4 rounded-[1.5rem] p-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-semibold text-text-primary">Stacks suivies</h3>
          <p class="mt-1 text-xs leading-relaxed text-text-secondary">
            Basée sur les stacks les plus représentés dans l'historique TJM.
          </p>
        </div>
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        {#each analysis.topStacks as stack}
          <span class="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/5 px-3 py-1.5 text-xs text-text-primary">
            <span class="font-medium">{stack.stack}</span>
            <span class:text-accent-emerald={stack.trend === 'up'} class:text-accent-red={stack.trend === 'down'} class:text-text-muted={stack.trend === 'stable'}>
              {stack.average} EUR/j
            </span>
          </span>
        {/each}
      </div>
    </section>
  {/if}
</div>
