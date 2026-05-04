<script lang="ts">
  import TJMDashboard from '../organisms/TJMDashboard.svelte';
  import { Icon } from '@pulse/ui';
  import type { TJMAnalysis } from '$lib/core/types/tjm';
  import type { SeniorityLevel } from '$lib/core/types/profile';
  import { getTJMAnalysis } from '$lib/shell/facades/tjm.facade';
  import { getConnectionStore } from '$lib/state/connection-singleton.svelte';
  import { getProfile } from '$lib/shell/facades/settings.facade';

  let analysis = $state<TJMAnalysis | null>(null);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let userTjmMin = $state(0);
  let userTjmMax = $state(0);
  let profileStacks = $state<string[]>([]);
  let userSeniority = $state<SeniorityLevel | null>(null);
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

  async function loadProfileAndAnalysis() {
    try {
      const p = await getProfile();
      if (p) {
        userTjmMin = p.tjmMin;
        userTjmMax = p.tjmMax;
        profileStacks = p.stack;
        userSeniority = p.seniority;
      }
    } catch {
      // Profile load failed, continue with defaults
    }
    await loadAnalysis();
  }

  const isOffline = $derived(connection.status === 'offline');

  $effect(() => {
    loadProfileAndAnalysis();
  });

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
      // Service worker context may not have chrome.runtime
    }
  });

  $effect(() => {
    const handler = () => loadProfileAndAnalysis();
    window.addEventListener('profile-updated', handler);
    return () => window.removeEventListener('profile-updated', handler);
  });
</script>

<div class="flex h-full flex-col overflow-y-auto px-4 pb-5 pt-4">
  <!-- Hero -->
  <section class="section-card-strong rounded-2xl px-5 py-4">
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blueprint-blue/15 bg-blueprint-blue/6"
        >
          <Icon name="chart-column" size={16} class="text-blueprint-blue" />
        </div>
        <div>
          <p class="eyebrow text-blueprint-blue">Marché</p>
          <h2 class="mt-1 text-base font-semibold text-text-primary">Radar TJM</h2>
        </div>
      </div>
      <button
        class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-light bg-surface-white text-text-muted transition-colors hover:bg-subtle-gray hover:text-text-primary disabled:opacity-40"
        onclick={() => loadAnalysis()}
        disabled={isLoading}
        title="Rafraîchir"
      >
        <span class:animate-spin={isLoading}>
          <Icon name="refresh-cw" size={13} />
        </span>
      </button>
    </div>

    {#if analysis && !isLoading}
      <p class="mt-3 text-[11px] text-text-muted">
        Mis à jour le {analysis.lastUpdated ?? '—'}
      </p>
    {:else if isLoading}
      <p class="mt-3 text-[11px] text-text-muted">Chargement…</p>
    {/if}

    {#if isOffline}
      <div
        class="mt-3 flex items-center gap-2 rounded-xl border border-blueprint-blue/20 bg-blueprint-blue/5 px-3 py-2 text-xs text-blueprint-blue"
      >
        <Icon name="database" size={14} />
        <span>Mode hors ligne</span>
      </div>
    {/if}
  </section>

  <!-- Dashboard -->
  <section class="mt-4">
    <TJMDashboard {analysis} {isLoading} {error} {userSeniority} />
  </section>
</div>
