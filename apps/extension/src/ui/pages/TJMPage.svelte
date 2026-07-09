<script lang="ts">
  import TJMDashboard from '../organisms/TJMDashboard.svelte';
  import { Icon } from '@pulse/ui';
  import type { TJMAnalysis, TJMRegion } from '$lib/core/types/tjm';
  import type { SeniorityLevel } from '$lib/core/types/profile';
  import { getTJMAnalysis } from '$lib/shell/facades/tjm.facade';
  import { getConnectionStore } from '$lib/state/connection-singleton.svelte';
  import { getProfile } from '$lib/shell/facades/settings.facade';
  import { subscribeMessages } from '$lib/shell/messaging/bridge';

  const {
    onNavigateToProfile,
    onNavigateToFeed,
  }: {
    onNavigateToProfile?: () => void;
    onNavigateToFeed?: () => void;
  } = $props();

  let analysis = $state<TJMAnalysis | null>(null);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let userTjmMin = $state(0);
  let userTjmMax = $state(0);
  let profileStacks = $state<string[]>([]);
  let userSeniority = $state<SeniorityLevel | null>(null);
  let selectedRegion = $state<TJMRegion | null>(null);
  // Region options are snapshotted from the unfiltered analysis so the dropdown
  // keeps showing every available region even after a region filter is applied
  // (the filtered analysis would otherwise shrink to a single region).
  let regionOptions = $state<{ region: TJMRegion; label: string }[]>([]);
  const connection = getConnectionStore();

  async function loadAnalysis() {
    isLoading = true;
    error = null;
    try {
      analysis = await getTJMAnalysis(
        profileStacks.length > 0 ? profileStacks : undefined,
        selectedRegion ?? undefined
      );
      if (!selectedRegion && analysis?.regionInsights) {
        regionOptions = analysis.regionInsights.map(({ region, label }) => ({ region, label }));
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Impossible de charger les tendances TJM';
    } finally {
      isLoading = false;
    }
  }

  function handleRegionChange(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    selectedRegion = value ? (value as TJMRegion) : null;
    void loadAnalysis();
  }

  async function loadProfileAndAnalysis() {
    try {
      const p = await getProfile();
      if (p) {
        userTjmMin = p.tjmMin;
        userTjmMax = p.tjmMax;
        profileStacks = p.keywords;
        userSeniority = p.seniority;
      }
    } catch {
      // Profile load failed, continue with defaults
    }
    await loadAnalysis();
  }

  const isOffline = $derived(connection.status === 'offline');
  const profileCalibrated = $derived(userTjmMin > 0 || userTjmMax > 0);

  let dashboardSection: HTMLElement | undefined = $state(undefined);

  function inspectLocalSignals(): void {
    dashboardSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    dashboardSection?.focus({ preventScroll: true });
  }

  $effect(() => {
    loadProfileAndAnalysis();
  });

  $effect(() => {
    const unsubscribe = subscribeMessages((message) => {
      if (message.type === 'SCAN_COMPLETE') {
        loadAnalysis();
      } else if (message.type === 'PROFILE_UPDATED') {
        loadProfileAndAnalysis();
      }
    });

    return unsubscribe;
  });
</script>

<div class="flex h-full flex-col overflow-y-auto px-4 pb-5 pt-4">
  <!-- Hero -->
  <section class="section-card-strong rounded-2xl px-5 py-4" aria-busy={isLoading}>
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blueprint-blue/15 bg-blueprint-blue/6"
        >
          <Icon name="chart-column" size={16} class="text-blueprint-blue" />
        </div>
        <div>
          <p class="eyebrow text-blueprint-blue">Marché</p>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <h2 class="text-base font-semibold text-text-primary">Analyse TJM</h2>
            <span
              class="rounded-md border border-border-light bg-page-canvas px-2 py-1 text-[10px] font-medium text-text-subtle"
            >
              Local uniquement
            </span>
          </div>
        </div>
      </div>
      <button
        class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-light bg-surface-white text-text-muted transition-colors hover:bg-subtle-gray hover:text-text-primary disabled:opacity-40"
        onclick={() => loadAnalysis()}
        disabled={isLoading}
        aria-label="Rafraîchir l'analyse TJM"
        title="Rafraîchir"
      >
        <span class:animate-spin={isLoading}>
          <Icon name="refresh-cw" size={13} />
        </span>
      </button>
    </div>

    {#if analysis && !isLoading}
      <p class="mt-3 text-[11px] text-text-muted">Mis à jour le {analysis.lastUpdated ?? '—'}</p>
    {:else if isLoading}
      <p class="mt-3 text-[11px] text-text-muted">Chargement…</p>
    {/if}

    <p class="mt-2 text-[11px] leading-5 text-text-muted">
      Tendances tirées des missions stockées localement, croisées avec votre fourchette cible.
    </p>

    {#if isOffline}
      <div
        class="mt-3 flex items-center gap-2 rounded-xl border border-status-orange/25 bg-status-orange/8 px-3 py-2 text-xs text-status-orange"
      >
        <Icon name="triangle-alert" size={14} />
        <span>Mode hors ligne — tendances calculées sur le cache local.</span>
      </div>
    {/if}

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <span
        class="inline-flex items-center gap-1.5 rounded-md border border-border-light bg-page-canvas px-2 py-1 text-[10px] font-medium text-text-subtle"
      >
        <Icon
          name={isOffline ? 'database' : 'badge-euro'}
          size={12}
          class={isOffline ? 'text-status-orange' : 'text-blueprint-blue'}
        />
        {isOffline ? 'Cache local' : `Profil ${profileCalibrated ? 'calibré' : 'à définir'}`}
      </span>
    </div>

    <div class="mt-2 flex flex-wrap gap-2">
      {#if isOffline}
        <button
          type="button"
          onclick={inspectLocalSignals}
          class="inline-flex items-center gap-1.5 rounded-lg border border-status-orange/25 bg-status-orange/8 px-3 py-1.5 text-[11px] font-medium text-status-orange transition-colors hover:bg-status-orange/14"
        >
          <Icon name="search" size={12} />
          Inspecter les signaux locaux
        </button>
      {/if}
      {#if onNavigateToProfile}
        <button
          type="button"
          onclick={onNavigateToProfile}
          class="inline-flex items-center gap-1.5 rounded-lg border border-blueprint-blue/20 bg-blueprint-blue/6 px-3 py-1.5 text-[11px] font-medium text-blueprint-blue transition-colors hover:bg-blueprint-blue/12"
        >
          <Icon name="sliders-horizontal" size={12} />
          Ajuster mon TJM cible
        </button>
      {/if}
      {#if onNavigateToFeed && !isOffline}
        <button
          type="button"
          onclick={onNavigateToFeed}
          class="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-surface-white px-3 py-1.5 text-[11px] font-medium text-text-subtle transition-colors hover:bg-subtle-gray hover:text-text-primary"
        >
          <Icon name="radar" size={12} />
          Scanner le feed
        </button>
      {/if}
    </div>

    <div class="mt-3 flex items-center gap-2">
      <label
        for="tjm-region-filter"
        class="text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted"
      >
        Région
      </label>
      <select
        id="tjm-region-filter"
        class="rounded-lg border border-border-light bg-surface-white px-2 py-1 text-xs text-text-primary outline-none transition-colors focus:border-blueprint-blue/30"
        value={selectedRegion ?? ''}
        onchange={handleRegionChange}
        aria-label="Filtrer les tendances TJM par région"
      >
        <option value="">Toutes les régions</option>
        {#each regionOptions as option}
          <option value={option.region}>{option.label}</option>
        {/each}
      </select>
    </div>
  </section>

  <!-- Dashboard -->
  <section class="mt-4" tabindex="-1" bind:this={dashboardSection}>
    <TJMDashboard
      {analysis}
      {isLoading}
      {error}
      {userSeniority}
      {userTjmMin}
      {userTjmMax}
      onRetry={() => loadAnalysis()}
      onOpenProfile={onNavigateToProfile}
      onOpenFeed={onNavigateToFeed}
    />
  </section>
</div>
