<script lang="ts">
  import TJMDashboard from '../organisms/TJMDashboard.svelte';
  import { Icon } from '@pulse/ui';
  import PageHeader from '../molecules/PageHeader.svelte';
  import OfflineNotice from '../molecules/OfflineNotice.svelte';
  import type { TJMAnalysis, TJMRegion } from '$lib/core/types/tjm';
  import type { SeniorityLevel } from '$lib/core/types/profile';
  import { getTJMAnalysis } from '$lib/shell/facades/tjm.facade';
  import { getConnectionStore } from '$lib/state/connection-singleton.svelte';
  import { getProfile } from '$lib/shell/facades/settings.facade';
  import { subscribeMessages } from '$lib/shell/messaging/bridge';
  import { getTJMDataFreshness } from '$lib/core/tjm-history';
  import { formatAbsoluteDate } from '$lib/core/utils/format';

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
  let analysisReferenceTime = $state(Date.now());
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
      analysisReferenceTime = Date.now();
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
  const dataFreshness = $derived(
    analysis ? getTJMDataFreshness(analysis.lastUpdated, new Date(analysisReferenceTime)) : null
  );
  const lastUpdatedLabel = $derived.by(() => {
    if (!analysis?.lastUpdated) {
      return '—';
    }
    const timestamp = Date.parse(analysis.lastUpdated);
    return Number.isFinite(timestamp)
      ? (formatAbsoluteDate(timestamp, { style: 'medium' }) ?? '—')
      : '—';
  });
  const dataIsStale = $derived(
    dataFreshness?.level === 'stale' || dataFreshness?.level === 'obsolete'
  );

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

<div class="flex h-full min-w-0 flex-col gap-4 overflow-y-auto px-4 pb-5 pt-4">
  <PageHeader eyebrow="Marché" title="Analyse TJM" icon="chart-column" badge="Local uniquement">
    {#snippet actions()}
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
    {/snippet}
    {#if analysis && !isLoading}
      <p class="text-caption text-text-muted" class:text-status-orange={dataIsStale}>
        Mis à jour le {lastUpdatedLabel}{#if dataIsStale && dataFreshness?.ageDays !== null}
          · Données anciennes ({dataFreshness.ageDays} jour{dataFreshness.ageDays > 1 ? 's' : ''})
        {/if}
      </p>
    {:else if isLoading}
      <p class="text-caption text-text-muted">Chargement…</p>
    {/if}

    <p class="mt-2 text-caption leading-5 text-text-muted">
      Tendances tirées des missions stockées localement, croisées avec votre fourchette cible.
    </p>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <span
        class="inline-flex items-center gap-1.5 rounded-md border border-border-light bg-page-canvas px-2 py-1 text-micro font-medium text-text-subtle"
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
          class="inline-flex items-center gap-1.5 rounded-lg border border-status-orange/25 bg-status-orange/8 px-3 py-1.5 text-caption font-medium text-status-orange transition-colors hover:bg-status-orange/14"
        >
          <Icon name="search" size={12} />
          Inspecter les signaux locaux
        </button>
      {/if}
      {#if onNavigateToProfile}
        <button
          type="button"
          onclick={onNavigateToProfile}
          class="inline-flex items-center gap-1.5 rounded-lg border border-blueprint-blue/20 bg-blueprint-blue/6 px-3 py-1.5 text-caption font-medium text-blueprint-blue transition-colors hover:bg-blueprint-blue/12"
        >
          <Icon name="sliders-horizontal" size={12} />
          Ajuster mon TJM cible
        </button>
      {/if}
      {#if onNavigateToFeed && !isOffline}
        <button
          type="button"
          onclick={onNavigateToFeed}
          class="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-surface-white px-3 py-1.5 text-caption font-medium text-text-subtle transition-colors hover:bg-subtle-gray hover:text-text-primary"
        >
          <Icon name="radar" size={12} />
          Scanner le feed
        </button>
      {/if}
    </div>

    <div class="mt-3 flex items-center gap-2">
      <label
        for="tjm-region-filter"
        class="text-micro font-medium uppercase tracking-[0.15em] text-text-muted"
      >
        Région
      </label>
      <select
        id="tjm-region-filter"
        class="rounded-lg border border-border-light bg-surface-white px-2 py-1 text-meta text-text-primary outline-none transition-colors focus:border-blueprint-blue/30"
        value={selectedRegion ?? ''}
        onchange={handleRegionChange}
        aria-label="Filtrer les tendances TJM par région"
      >
        <option value="">Toutes les régions</option>
        {#each regionOptions as option, i (i)}
          <option value={option.region}>{option.label}</option>
        {/each}
      </select>
    </div>
    {#snippet footer()}
      {#if isOffline}
        <OfflineNotice description="Tendances calculées sur le cache local." />
      {/if}
    {/snippet}
  </PageHeader>

  <!-- Dashboard -->
  <section tabindex="-1" bind:this={dashboardSection}>
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
