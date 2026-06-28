<script lang="ts">
  import TJMDashboard from '../organisms/TJMDashboard.svelte';
  import { Icon } from '@pulse/ui';
  import type { TJMAnalysis, TJMRegion } from '$lib/core/types/tjm';
  import type { SeniorityLevel } from '$lib/core/types/profile';
  import { getTJMAnalysis } from '$lib/shell/facades/tjm.facade';
  import { getConnectionStore } from '$lib/state/connection-singleton.svelte';
  import { getProfile } from '$lib/shell/facades/settings.facade';
  import { subscribeMessages } from '$lib/shell/messaging/bridge';
  import OperationalStoryCard, {
    type OperationalEvidence,
  } from '../molecules/OperationalStoryCard.svelte';

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
  let dashboardSection: HTMLElement | null = $state(null);
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
        profileStacks = p.stack;
        userSeniority = p.seniority;
      }
    } catch {
      // Profile load failed, continue with defaults
    }
    await loadAnalysis();
  }

  const isOffline = $derived(connection.status === 'offline');

  const tjmStory = $derived.by(() => {
    const evidence: OperationalEvidence[] = [
      {
        label: 'Analyse',
        value: analysis ? 'OK' : error ? 'Erreur' : 'Aucune',
        icon: analysis ? 'shield-check' : error ? 'triangle-alert' : 'database',
        severity: analysis ? 'success' : error ? 'critical' : 'attention',
      },
      {
        label: 'Missions analysées',
        value: analysis?.dataPoints ?? 0,
        icon: 'database',
        severity: analysis && analysis.dataPoints >= 20 ? 'success' : 'attention',
      },
      {
        label: 'Profil',
        value: userTjmMin > 0 || userTjmMax > 0 ? 'Calibré' : 'À définir',
        icon: 'badge-euro',
        severity: userTjmMin > 0 || userTjmMax > 0 ? 'success' : 'attention',
      },
    ];

    if (error) {
      return {
        severity: 'critical' as const,
        statusLabel: 'Incident',
        title: 'La décision tarifaire est suspendue',
        description:
          'Pulse ne peut pas charger les tendances TJM. Conservez votre fourchette actuelle jusqu’au prochain calcul.',
        evidence,
        primaryActionLabel: 'Réessayer',
        primaryActionIcon: 'refresh-cw',
      };
    }

    if (isLoading) {
      return {
        severity: 'neutral' as const,
        statusLabel: 'Calcul',
        title: 'Pulse consolide les signaux tarifaires',
        description:
          'L’analyse compare votre fourchette au marché observé dans les missions stockées.',
        evidence,
        primaryActionLabel: null,
        primaryActionIcon: 'refresh-cw',
      };
    }

    if (!analysis) {
      return {
        severity: 'attention' as const,
        statusLabel: 'Données absentes',
        title: 'Aucun signal marché ne permet de décider un TJM',
        description:
          'Le prochain geste utile est de scanner des missions avec TJM, puis de relancer cette analyse.',
        evidence,
        primaryActionLabel: 'Scanner le feed',
        primaryActionIcon: 'briefcase',
      };
    }

    if (isOffline) {
      return {
        severity: 'attention' as const,
        statusLabel: 'Cache local',
        title: 'Le TJM est calculé depuis les données disponibles hors ligne',
        description:
          'La tendance reste utile, mais elle peut manquer les dernières missions tant que le réseau n’est pas revenu.',
        evidence,
        primaryActionLabel: 'Inspecter les signaux locaux',
        primaryActionIcon: 'database',
      };
    }

    return {
      severity: 'success' as const,
      statusLabel: 'Analyse prête',
      title: 'Votre fourchette TJM est prête à comparer',
      description:
        'Comparez votre fourchette aux médianes par seniorité, stack et région avant de qualifier une mission.',
      evidence,
      primaryActionLabel: 'Ajuster mon TJM cible',
      primaryActionIcon: 'badge-euro',
    };
  });

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

  function inspectLocalSignals(): void {
    dashboardSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    dashboardSection?.focus({ preventScroll: true });
  }

  function handleTjmStoryAction(): void {
    if (error) {
      loadAnalysis();
      return;
    }

    if (isOffline && analysis) {
      inspectLocalSignals();
      return;
    }

    if (!analysis) {
      if (onNavigateToFeed) {
        onNavigateToFeed();
        return;
      }
      loadAnalysis();
      return;
    }

    if (onNavigateToProfile) {
      onNavigateToProfile();
      return;
    }

    inspectLocalSignals();
  }
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
      <p class="mt-3 text-[11px] text-text-muted">
        Mis à jour le {analysis.lastUpdated ?? '—'}
      </p>
    {:else if isLoading}
      <p class="mt-3 text-[11px] text-text-muted">Chargement…</p>
    {/if}

    <p class="mt-2 text-[11px] leading-5 text-text-muted">
      Tendances calculées depuis les missions stockées dans l'extension; le dashboard connecté les
      consolide après synchronisation.
    </p>

    {#if isOffline}
      <div
        class="mt-3 flex items-center gap-2 rounded-xl border border-blueprint-blue/20 bg-blueprint-blue/5 px-3 py-2 text-xs text-blueprint-blue"
      >
        <Icon name="database" size={14} />
        <span>Mode hors ligne</span>
      </div>
    {/if}

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

    <div class="mt-4">
      <OperationalStoryCard
        eyebrow="À faire avec votre TJM"
        title={tjmStory.title}
        description={tjmStory.description}
        severity={tjmStory.severity}
        statusLabel={tjmStory.statusLabel}
        evidence={tjmStory.evidence}
        primaryActionLabel={tjmStory.primaryActionLabel}
        primaryActionIcon={tjmStory.primaryActionIcon}
        onPrimaryAction={handleTjmStoryAction}
      />
    </div>
  </section>

  <!-- Dashboard -->
  <section class="mt-4" bind:this={dashboardSection} tabindex="-1">
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
