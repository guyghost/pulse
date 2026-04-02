<script lang="ts">
  import TJMDashboard from '../organisms/TJMDashboard.svelte';
  import Icon from '../atoms/Icon.svelte';
  import type { TJMAnalysis } from '$lib/core/types/tjm';
  import { getTJMAnalysis } from '$lib/shell/facades/tjm.facade';
  import { getConnectionStore } from '$lib/state/connection-singleton.svelte';
  import { getProfile } from '$lib/shell/facades/settings.facade';

  let analysis = $state<TJMAnalysis | null>(null);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let userTjmMin = $state(0);
  let userTjmMax = $state(0);
  let profileStacks = $state<string[]>([]);
  const connection = getConnectionStore();

  async function loadAnalysis() {
    isLoading = true;
    error = null;

    try {
      analysis = await getTJMAnalysis(profileStacks.length > 0 ? profileStacks : undefined);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Impossible de charger les tendances TJM';
    } finally {
      isLoading = false;
    }
  }

  const isOffline = $derived(connection.status === 'offline');

  $effect(() => {
    getProfile().then((p) => {
      if (p) {
        userTjmMin = p.tjmMin;
        userTjmMax = p.tjmMax;
        profileStacks = p.stack;
      }
      loadAnalysis();
    }).catch(() => { loadAnalysis(); });
  });

  // Auto-refresh when a scan completes
  $effect(() => {
    try {
      const listener = (message: { type?: string }) => {
        if (message?.type === 'SCAN_COMPLETE') {
          loadAnalysis();
        }
      };
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    } catch {
      // Outside extension context
    }
  });
</script>

<div class="flex h-full flex-col overflow-y-auto px-4 pb-5 pt-4">
  <!-- Compact hero -->
  <section class="section-card-strong relative overflow-hidden rounded-[1.75rem] px-4 py-4">
    <div class="pointer-events-none absolute -right-8 top-0 h-28 w-28 rounded-full bg-accent-blue/14 blur-3xl"></div>
    <div class="relative flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent-blue/20 bg-accent-blue/10">
          <Icon name="chart-column" size={18} class="text-accent-blue" />
        </div>
        <div>
          <h2 class="text-lg font-semibold text-white">Radar marché</h2>
          <p class="text-[11px] text-text-muted">
            {#if analysis && !isLoading}
              Mis à jour le {analysis.lastUpdated ?? '—'}
            {:else if isLoading}
              Chargement…
            {:else}
              Aucune donnée
            {/if}
          </p>
        </div>
      </div>
      <button
        class="soft-ring inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white transition-all duration-200 hover:bg-white/10 disabled:opacity-40"
        onclick={() => loadAnalysis()}
        disabled={isLoading}
        title="Rafraîchir l'analyse"
      >
        <span class:animate-spin={isLoading}>
          <Icon name="refresh-cw" size={14} />
        </span>
      </button>
    </div>

    {#if isOffline}
      <div class="mt-3 flex items-center gap-2 rounded-xl border border-accent-amber/20 bg-accent-amber/5 px-3 py-2 text-xs text-accent-amber">
        <Icon name="database" size={14} />
        <span>Mode hors ligne — Données en cache</span>
      </div>
    {/if}
  </section>

  <!-- Dashboard -->
  <section class="mt-4">
    <TJMDashboard {analysis} {isLoading} {error} {userTjmMin} {userTjmMax} />
  </section>
</div>
