<script lang="ts">
  import { Badge } from '@pulse/ui';
  import {
    countApplicationsByStage,
    filterApplications,
    getAverageApplicationScore,
    getCvSyncReadiness,
    getNextApplicationStages,
    getNextFollowUp,
    getSyncBlockers,
  } from '$lib/core/dashboard';
  import type { ActionData, PageData } from './$types';
  import type {
    ApplicationStage,
    ApplicationTimelineEvent,
    ConnectedSyncStatus,
    DashboardAccountEntitlements,
    DashboardFeatureAccess,
    DashboardFeatureArea,
    DashboardFeatureRequirement,
    DashboardSyncConflict,
    CvSnapshot,
    GeneratedApplicationAsset,
    MissionApplication,
    MissionFeedItem,
    PlatformSyncStatus,
    TjmRadarSnapshot,
  } from '$lib/core/dashboard';

  let { data, form }: { data: PageData; form?: ActionData } = $props();

  const missionFeed = $derived(data.missionFeed as MissionFeedItem[]);
  const tjmRadar = $derived(data.tjmRadar as TjmRadarSnapshot);
  const applications = $derived(data.applications as MissionApplication[]);
  const applicationTimeline = $derived(data.applicationTimeline as ApplicationTimelineEvent[]);
  const generatedAssets = $derived(data.generatedAssets as GeneratedApplicationAsset[]);
  const cv = $derived(data.cv as CvSnapshot);
  const syncStatuses = $derived(data.syncStatuses as PlatformSyncStatus[]);
  const connectedSyncStatuses = $derived(data.connectedSyncStatuses as ConnectedSyncStatus[]);
  const syncConflicts = $derived(data.syncConflicts as DashboardSyncConflict[]);
  const entitlements = $derived(data.entitlements as DashboardAccountEntitlements);
  const featureAccess = $derived(data.featureAccess as DashboardFeatureAccess[]);
  const configurationMissing = $derived(Boolean(data.configurationMissing));
  const counts = $derived(countApplicationsByStage(applications));
  const readiness = $derived(getCvSyncReadiness(cv, syncStatuses));
  const isConnected = $derived(Boolean(data.session));
  const enabledFeatureCount = $derived(featureAccess.filter((feature) => feature.enabled).length);
  const freshMissionCount = $derived(
    missionFeed.filter((mission) => mission.freshness === 'fresh').length
  );
  let searchQuery = $state('');
  let selectedSource = $state<'all' | MissionApplication['source']>('all');
  let selectedApplicationId = $state<string | null>(null);
  let syncPrepared = $state(false);
  let copiedAssetId = $state<string | null>(null);
  const averageScore = $derived(getAverageApplicationScore(applications));
  const nextFollowUp = $derived(getNextFollowUp(applications));
  const sourceFilters: { label: string; value: 'all' | MissionApplication['source'] }[] = [
    { label: 'Toutes', value: 'all' },
    { label: 'Free-Work', value: 'free-work' },
    { label: 'LeHibou', value: 'lehibou' },
    { label: 'Hiway', value: 'hiway' },
    { label: 'Collective', value: 'collective' },
    { label: 'Cherry Pick', value: 'cherry-pick' },
  ];

  const sourceLabels: Record<MissionApplication['source'], string> = {
    linkedin: 'LinkedIn',
    'free-work': 'Free-Work',
    lehibou: 'LeHibou',
    hiway: 'Hiway',
    collective: 'Collective',
    'cherry-pick': 'Cherry Pick',
    malt: 'Malt',
    other: 'Autre',
  };

  const filteredApplications = $derived(
    filterApplications(applications, { query: searchQuery, source: selectedSource }, sourceLabels)
  );
  const selectedApplication = $derived(
    filteredApplications.find((application) => application.id === selectedApplicationId) ??
      filteredApplications[0] ??
      null
  );
  const selectedNextStages = $derived(
    selectedApplication ? getNextApplicationStages(selectedApplication.stage) : []
  );
  const selectedGeneratedAssets = $derived(
    selectedApplication
      ? generatedAssets.filter((asset) => asset.applicationId === selectedApplication.id)
      : []
  );
  const selectedTimeline = $derived(
    selectedApplication
      ? applicationTimeline.filter((event) => event.applicationId === selectedApplication.id)
      : []
  );
  const recentGeneratedAssets = $derived(generatedAssets.slice(0, 5));
  const syncBlockers = $derived(getSyncBlockers(cv, syncStatuses));
  const readyPlatforms = $derived(syncStatuses.filter((platform) => platform.status === 'ready'));
  const cvSyncAccess = $derived(featureAccess.find((feature) => feature.id === 'cv-sync') ?? null);
  const canPrepareCvSync = $derived(readiness.canSync && Boolean(cvSyncAccess?.enabled));
  const hasSyncActionRequired = $derived(
    syncConflicts.length > 0 || connectedSyncStatuses.some((status) => status.state === 'error')
  );
  const syncConflictCountText = $derived(
    `${syncConflicts.length} champ${syncConflicts.length > 1 ? 's' : ''} attend${
      syncConflicts.length > 1 ? 'ent' : ''
    } un arbitrage.`
  );
  const latestCvImport = $derived(cv.imports[0] ?? null);
  const hasCvProfile = $derived(cv.id !== 'empty-cv');
  const cvDisplayTitle = $derived(cv.title || 'CV à créer');

  const stageLabels: Record<ApplicationStage, string> = {
    detected: 'Détectée',
    selected: 'Sélectionnée',
    application_prepared: 'Candidature préparée',
    applied: 'Postulé',
    interview: 'Entretien',
    offer: 'Offre',
    accepted: 'Acceptée',
    rejected: 'Refusé',
    archived: 'Archivée',
  };

  const statusLabels: Record<PlatformSyncStatus['status'], string> = {
    ready: 'Prêt',
    'needs-extension': 'Extension requise',
    'needs-session': 'Session requise',
    syncing: 'Synchronisation',
  };

  const connectedSyncStateLabels: Record<ConnectedSyncStatus['state'], string> = {
    healthy: 'Synchronisé',
    pending: 'En attente',
    error: 'Erreur',
    idle: 'Initial',
  };

  const syncConflictStatusLabels: Record<DashboardSyncConflict['status'], string> = {
    pending: 'À arbitrer',
    resolved: 'Résolu',
    dismissed: 'Ignoré',
  };

  const syncConflictActorLabels: Record<DashboardSyncConflict['localUpdatedBy'], string> = {
    dashboard: 'Dashboard',
    extension: 'Extension',
    system: 'Système',
  };

  const tjmTrendLabels: Record<TjmRadarSnapshot['trend'], string> = {
    up: 'Marché en hausse',
    down: 'Marché en baisse',
    stable: 'Stable',
    unknown: 'Tendance inconnue',
  };

  const importStatusLabels: Record<CvSnapshot['imports'][number]['status'], string> = {
    success: 'Importé',
    partial: 'Partiel',
    error: 'Erreur',
  };

  const suggestionStatusLabels: Record<CvSnapshot['suggestions'][number]['status'], string> = {
    pending: 'À valider',
    applied: 'Appliquée',
    dismissed: 'Ignorée',
  };

  const featureAreaLabels: Record<DashboardFeatureArea, string> = {
    missions: 'Missions',
    profile: 'Profil',
    applications: 'Candidatures',
    automation: 'Automatisation',
    account: 'Compte',
  };

  const requirementLabels: Record<DashboardFeatureRequirement, string> = {
    anonymous: 'Inclus',
    account: 'Compte',
    credits: 'Crédits',
    premium: 'Premium',
  };

  const formatDate = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat('fr-FR', {
          day: '2-digit',
          month: 'short',
        }).format(new Date(value))
      : 'Aucune';

  const formatDateTime = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat('fr-FR', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(value))
      : 'Aucune';

  const formatFieldCounts = (counts: Record<string, number>) =>
    Object.entries(counts)
      .map(([field, count]) => `${field}: ${count}`)
      .join(' · ');

  const formatDailyRate = (value: number | null) => (value ? `${value}€` : 'N/A');

  const copyGeneratedAsset = async (asset: GeneratedApplicationAsset) => {
    await navigator.clipboard.writeText(asset.content);
    copiedAssetId = asset.id;
  };
</script>

<svelte:head>
  <title>Dashboard — MissionPulse</title>
  <meta
    name="description"
    content="Suivez vos candidatures, maintenez votre CV et préparez la synchronisation avec l'extension MissionPulse."
  />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="min-h-screen bg-page-canvas">
  <aside
    class="fixed inset-y-0 left-0 hidden w-64 border-r border-border-light bg-surface-white px-4 py-4 lg:block"
  >
    <a href="/" class="flex h-11 items-center gap-3" aria-label="MissionPulse Dashboard">
      <span
        class="flex h-9 w-9 items-center justify-center rounded-lg border border-border-light bg-page-canvas text-text-primary"
      >
        <svg viewBox="0 0 128 128" class="h-6 w-6" aria-hidden="true">
          <polyline
            points="18,64 38,64 46,44 54,84 64,38 74,78 82,52 90,64 110,64"
            fill="none"
            stroke="currentColor"
            stroke-width="8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
      <span class="text-sm font-semibold tracking-normal">MissionPulse</span>
    </a>

    <div class="mt-5 rounded-lg border border-border-light bg-page-canvas px-3 py-2">
      <p class="text-[11px] font-medium uppercase text-text-muted">Workspace</p>
      <p class="mt-1 truncate text-sm font-medium text-text-primary">Freelance cockpit</p>
    </div>

    <nav class="mt-6 space-y-1" aria-label="Navigation dashboard">
      <a
        class="flex h-9 items-center justify-between rounded-lg border border-blueprint-blue/20 bg-blueprint-blue/8 px-3 text-sm font-medium text-blueprint-blue"
        href="/"
      >
        <span>Vue d'ensemble</span>
        <span class="h-1.5 w-1.5 rounded-full bg-blueprint-blue"></span>
      </a>
      <a
        class="flex h-9 items-center rounded-lg px-3 text-sm text-text-subtle hover:bg-page-canvas hover:text-text-primary"
        href="#applications"
      >
        Candidatures
      </a>
      <a
        class="flex h-9 items-center rounded-lg px-3 text-sm text-text-subtle hover:bg-page-canvas hover:text-text-primary"
        href="#cv"
      >
        Profil CV
      </a>
      <a
        class="flex h-9 items-center rounded-lg px-3 text-sm text-text-subtle hover:bg-page-canvas hover:text-text-primary"
        href="#tjm"
      >
        Radar TJM
      </a>
      <a
        class="flex h-9 items-center rounded-lg px-3 text-sm text-text-subtle hover:bg-page-canvas hover:text-text-primary"
        href="#sync"
      >
        Synchronisation
      </a>
    </nav>

    <div class="absolute inset-x-4 bottom-4">
      <div class="rounded-lg border border-border-light bg-page-canvas p-3">
        <div class="flex items-center justify-between">
          <p class="text-xs font-medium text-text-primary">Extension Chrome</p>
          <span class="h-2 w-2 rounded-full bg-accent-green"></span>
        </div>
        <p class="mt-2 text-xs leading-5 text-text-subtle">
          Les mises à jour CV seront exécutées depuis les sessions navigateur existantes.
        </p>
        <div class="mt-3 flex items-center justify-between border-t border-border-light pt-3">
          <span class="text-xs text-text-subtle">Features actives</span>
          <span class="text-xs font-semibold text-text-primary">
            {enabledFeatureCount}/{featureAccess.length}
          </span>
        </div>
      </div>
    </div>
  </aside>

  <section class="lg:pl-64">
    <header
      class="sticky top-0 z-20 border-b border-border-light bg-surface-white/88 px-4 py-3 backdrop-blur md:px-8"
    >
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div class="flex items-center gap-2 text-sm">
          <span class="text-text-subtle">Dashboard</span>
          <span class="text-text-muted">/</span>
          <span class="font-medium text-text-primary">Candidatures</span>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          {#if isConnected}
            <Badge
              label={entitlements.subscriptionStatus === 'premium'
                ? 'Premium actif'
                : 'Compte actif'}
              variant="success"
              size="md"
            />
            <Badge label={`${entitlements.creditBalance} crédits`} variant="source" size="md" />
          {:else}
            <a
              class="inline-flex h-8 items-center rounded-lg border border-border-light bg-surface-white px-3 text-xs font-medium text-text-primary hover:bg-page-canvas"
              href={data.loginUrl || '/login'}
            >
              Se connecter
            </a>
          {/if}
          <button
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-light bg-surface-white text-text-subtle hover:bg-page-canvas hover:text-text-primary"
            aria-label="Ouvrir les fichiers"
          >
            <svg
              viewBox="0 0 24 24"
              class="h-4 w-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
            </svg>
          </button>
          <button
            class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border-light bg-surface-white text-text-subtle hover:bg-page-canvas hover:text-text-primary"
            aria-label="Compte"
          >
            <svg
              viewBox="0 0 24 24"
              class="h-4 w-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c1.8-4 4.5-6 8-6s6.2 2 8 6" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <div class="mx-auto max-w-[1220px] px-4 pb-10 pt-8 md:px-8">
      <section class="mb-7">
        <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="text-3xl font-semibold tracking-normal text-text-primary md:text-4xl">
                Pilotage missions
              </h1>
              <span
                class="rounded-full bg-subtle-gray px-2 py-1 text-xs font-medium text-text-subtle"
              >
                {enabledFeatureCount}/{featureAccess.length} features
              </span>
            </div>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-text-subtle">
              Retrouvez les fonctionnalités de l'extension dans le dashboard, avec activation par
              feature flag selon la session, les crédits et le statut d'achat.
            </p>
          </div>
          <a
            class="inline-flex h-8 items-center justify-center rounded-lg border border-blueprint-blue/25 bg-blueprint-blue/8 px-3 text-xs font-semibold text-blueprint-blue shadow-subtle-2 hover:border-blueprint-blue/40 hover:bg-blueprint-blue/12"
            href="#cv"
          >
            Vérifier le CV
          </a>
        </div>

        <div class="mt-6 flex border-b border-border-light">
          <a
            class="-mb-px border-b-2 border-text-primary px-3 py-2 text-sm font-medium text-text-primary"
            href="#applications"
          >
            Explore
          </a>
          <a class="px-3 py-2 text-sm text-text-subtle hover:text-text-primary" href="#sync"
            >Synchronisations</a
          >
          <a class="px-3 py-2 text-sm text-text-subtle hover:text-text-primary" href="#cv">CV</a>
        </div>
      </section>

      {#if configurationMissing}
        <section
          class="mb-6 rounded-lg border border-status-orange/30 bg-status-orange/10 p-4 shadow-subtle-2"
        >
          <p class="text-sm font-medium text-text-primary">Configuration Supabase absente</p>
          <p class="mt-1 max-w-3xl text-sm leading-6 text-text-subtle">
            Le dashboard connecté n'affiche que les données synchronisées depuis Supabase. Ajoutez
            `PUBLIC_SUPABASE_URL` et `PUBLIC_SUPABASE_ANON_KEY`, puis connectez-vous pour charger
            vos missions, candidatures, CV et statuts de synchronisation.
          </p>
        </section>
      {:else if !isConnected}
        <section
          class="mb-6 rounded-lg border border-blueprint-blue/20 bg-blueprint-blue/8 p-4 shadow-subtle-2"
        >
          <p class="text-sm font-medium text-text-primary">Connexion requise</p>
          <p class="mt-1 max-w-3xl text-sm leading-6 text-text-subtle">
            Connectez-vous pour charger les données synchronisées via Supabase. Le dashboard ne lit
            pas les sessions plateforme et n'utilise pas de données de démonstration.
          </p>
        </section>
      {/if}

      <section
        class="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
        aria-label="Indicateurs candidatures"
      >
        <div class="rounded-lg border border-border-light bg-surface-white p-4 shadow-subtle-2">
          <p class="text-xs font-medium uppercase text-text-subtle">Candidatures</p>
          <div class="mt-3 flex items-end justify-between">
            <p class="text-3xl font-semibold">{applications.length}</p>
            <Badge label="+2 cette semaine" variant="success" />
          </div>
        </div>
        <div class="rounded-lg border border-border-light bg-surface-white p-4 shadow-subtle-2">
          <p class="text-xs font-medium uppercase text-text-subtle">Taux moyen</p>
          <div class="mt-3 flex items-end justify-between">
            <p class="text-3xl font-semibold">{averageScore}%</p>
            <Badge label="Score IA" variant="status" />
          </div>
        </div>
        <div class="rounded-lg border border-border-light bg-surface-white p-4 shadow-subtle-2">
          <p class="text-xs font-medium uppercase text-text-subtle">Entretiens</p>
          <div class="mt-3 flex items-end justify-between">
            <p class="text-3xl font-semibold">{counts.interview}</p>
            <Badge label="Prioritaire" variant="warning" />
          </div>
        </div>
        <div class="rounded-lg border border-border-light bg-surface-white p-4 shadow-subtle-2">
          <p class="text-xs font-medium uppercase text-text-subtle">Prochaine relance</p>
          <div class="mt-3 flex items-end justify-between">
            <p class="text-3xl font-semibold">{formatDate(nextFollowUp?.nextActionAt ?? null)}</p>
            <Badge label="À traiter" variant="source" />
          </div>
        </div>
      </section>

      <section class="mt-6" aria-labelledby="mission-feed-title">
        <div class="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p class="eyebrow text-text-subtle">Feed connecté</p>
            <h2 id="mission-feed-title" class="mt-1 text-lg font-semibold text-text-primary">
              Missions détectées par l'extension
            </h2>
          </div>
          <p class="text-sm text-text-subtle">
            {missionFeed.length} synchronisées, {freshMissionCount} fraîches
          </p>
        </div>

        {#if form?.selectionError}
          <p
            class="mb-3 rounded-lg border border-status-red/20 bg-status-red/8 px-3 py-2 text-xs leading-5 text-status-red"
          >
            {form.selectionError}
          </p>
        {/if}

        {#if form?.selectionSuccess}
          <p
            class="mb-3 rounded-lg border border-accent-green/15 bg-accent-green/8 px-3 py-2 text-xs leading-5 text-accent-green"
          >
            {form.selectionSuccess}
          </p>
        {/if}

        <div class="grid gap-3 lg:grid-cols-3">
          {#if missionFeed.length === 0}
            <article
              class="rounded-xl border border-dashed border-border-light bg-surface-white p-5"
            >
              <p class="text-sm font-semibold text-text-primary">Aucune mission synchronisée</p>
              <p class="mt-2 text-sm leading-6 text-text-subtle">
                Lancez un scan depuis l'extension connectée pour alimenter le dashboard Supabase.
              </p>
            </article>
          {/if}

          {#each missionFeed.slice(0, 6) as mission}
            <article
              class="rounded-xl border border-border-light bg-surface-white p-4 shadow-subtle-2"
            >
              <div class="flex items-start justify-between gap-3">
                <Badge label={sourceLabels[mission.source]} variant="source" />
                <Badge
                  label={`${mission.score}%${mission.grade ? ` · ${mission.grade}` : ''}`}
                  variant={mission.score >= 85 ? 'success' : 'warning'}
                />
              </div>
              <h3 class="mt-3 text-sm font-semibold leading-tight text-text-primary">
                {mission.title}
              </h3>
              <p class="mt-1 text-xs text-text-subtle">
                {mission.client ?? 'Client non renseigné'} ·
                {mission.location ?? 'Localisation non renseignée'}
              </p>

              <div class="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div class="rounded-lg bg-page-canvas px-2 py-2">
                  <p class="text-text-muted">TJM</p>
                  <p class="mt-1 font-medium text-text-primary">
                    {mission.dailyRate ? `${mission.dailyRate}€` : 'N/A'}
                  </p>
                </div>
                <div class="rounded-lg bg-page-canvas px-2 py-2">
                  <p class="text-text-muted">Fraîcheur</p>
                  <p class="mt-1 font-medium text-text-primary">
                    {mission.freshness === 'fresh' ? 'Récente' : 'À revoir'}
                  </p>
                </div>
                <div class="rounded-lg bg-page-canvas px-2 py-2">
                  <p class="text-text-muted">Doublons</p>
                  <p class="mt-1 font-medium text-text-primary">{mission.duplicateCount}</p>
                </div>
              </div>

              {#if mission.semanticReason}
                <p class="mt-3 line-clamp-2 text-xs leading-5 text-text-subtle">
                  {mission.semanticReason}
                </p>
              {/if}

              <div class="mt-3 flex flex-wrap gap-1.5">
                {#each mission.stack.slice(0, 4) as skill}
                  <span
                    class="rounded-md bg-blueprint-blue/8 px-2 py-1 text-[10px] font-medium text-blueprint-blue"
                  >
                    {skill}
                  </span>
                {/each}
              </div>

              <div class="mt-4 flex items-center justify-between border-t border-border-light pt-3">
                <span class="text-xs text-text-subtle">{formatDate(mission.scrapedAt)}</span>
                {#if mission.applicationStage}
                  <Badge label={stageLabels[mission.applicationStage]} variant="status" />
                {:else if isConnected}
                  <form method="POST" action="?/selectMission">
                    <input type="hidden" name="missionId" value={mission.id} />
                    <button
                      type="submit"
                      class="text-xs font-medium text-blueprint-blue hover:text-text-primary"
                    >
                      Sélectionner
                    </button>
                  </form>
                {:else}
                  <a
                    class="text-xs font-medium text-blueprint-blue hover:text-text-primary"
                    href={mission.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ouvrir
                  </a>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      </section>

      <section id="tjm" class="mt-6" aria-labelledby="tjm-radar-title">
        <div class="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p class="eyebrow text-text-subtle">Radar TJM</p>
            <h2 id="tjm-radar-title" class="mt-1 text-lg font-semibold text-text-primary">
              Tendances marché synchronisées
            </h2>
          </div>
          <p class="text-sm text-text-subtle">
            {tjmRadar.missionCount} missions avec TJM exploitable
          </p>
        </div>

        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article
            class="rounded-lg border border-border-light bg-surface-white p-4 shadow-subtle-2"
          >
            <p class="text-xs font-medium uppercase text-text-subtle">TJM moyen</p>
            <div class="mt-3 flex items-end justify-between gap-3">
              <p class="text-3xl font-semibold text-text-primary">
                {formatDailyRate(tjmRadar.averageDailyRate)}
              </p>
              <Badge label={`${tjmRadar.missionCount} offres`} variant="source" />
            </div>
          </article>
          <article
            class="rounded-lg border border-border-light bg-surface-white p-4 shadow-subtle-2"
          >
            <p class="text-xs font-medium uppercase text-text-subtle">Fourchette</p>
            <p class="mt-3 text-2xl font-semibold text-text-primary">
              {formatDailyRate(tjmRadar.minDailyRate)} - {formatDailyRate(tjmRadar.maxDailyRate)}
            </p>
            <p class="mt-2 text-xs text-text-subtle">Min / max des missions synchronisées</p>
          </article>
          <article
            class="rounded-lg border border-border-light bg-surface-white p-4 shadow-subtle-2"
          >
            <p class="text-xs font-medium uppercase text-text-subtle">Stack dominante</p>
            <p class="mt-3 text-2xl font-semibold text-text-primary">
              {tjmRadar.topStack ?? 'N/A'}
            </p>
            <p class="mt-2 text-xs text-text-subtle">Par volume de missions qualifiées</p>
          </article>
          <article
            class="rounded-lg border border-border-light bg-surface-white p-4 shadow-subtle-2"
          >
            <p class="text-xs font-medium uppercase text-text-subtle">Tendance</p>
            <div class="mt-3 flex items-end justify-between gap-3">
              <p class="text-lg font-semibold text-text-primary">
                {tjmTrendLabels[tjmRadar.trend]}
              </p>
              <Badge
                label={tjmRadar.trendDelta === null
                  ? 'N/A'
                  : `${tjmRadar.trendDelta > 0 ? '+' : ''}${tjmRadar.trendDelta}€`}
                variant={tjmRadar.trend === 'up'
                  ? 'success'
                  : tjmRadar.trend === 'down'
                    ? 'warning'
                    : 'status'}
              />
            </div>
          </article>
        </div>

        <div class="mt-3 grid gap-3 lg:grid-cols-2">
          <article
            class="rounded-xl border border-border-light bg-surface-white p-4 shadow-subtle-2"
          >
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-sm font-semibold text-text-primary">Par source</h3>
              <Badge label={tjmRadar.topSource ?? 'N/A'} variant="source" />
            </div>
            <div class="mt-3 space-y-2">
              {#if tjmRadar.sourceSegments.length === 0}
                <p
                  class="rounded-lg border border-dashed border-border-light bg-page-canvas p-3 text-xs leading-5 text-text-subtle"
                >
                  Aucun TJM synchronisé par source.
                </p>
              {/if}
              {#each tjmRadar.sourceSegments.slice(0, 4) as segment}
                <div class="rounded-lg bg-page-canvas px-3 py-2 text-xs">
                  <div class="flex items-center justify-between gap-3">
                    <span class="font-medium text-text-primary">{segment.label}</span>
                    <span class="text-text-subtle">{segment.missionCount} missions</span>
                  </div>
                  <div class="mt-2 flex items-center justify-between gap-3">
                    <span class="text-text-muted">
                      {formatDailyRate(segment.minDailyRate)} - {formatDailyRate(
                        segment.maxDailyRate
                      )}
                    </span>
                    <span class="font-semibold text-text-primary">
                      {formatDailyRate(segment.averageDailyRate)}
                    </span>
                  </div>
                </div>
              {/each}
            </div>
          </article>

          <article
            class="rounded-xl border border-border-light bg-surface-white p-4 shadow-subtle-2"
          >
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-sm font-semibold text-text-primary">Par stack</h3>
              <Badge label={tjmRadar.stackSegments.length.toString()} variant="tech" />
            </div>
            <div class="mt-3 space-y-2">
              {#if tjmRadar.stackSegments.length === 0}
                <p
                  class="rounded-lg border border-dashed border-border-light bg-page-canvas p-3 text-xs leading-5 text-text-subtle"
                >
                  Aucun TJM synchronisé par stack.
                </p>
              {/if}
              {#each tjmRadar.stackSegments.slice(0, 5) as segment}
                <div class="rounded-lg bg-page-canvas px-3 py-2 text-xs">
                  <div class="flex items-center justify-between gap-3">
                    <span class="font-medium text-text-primary">{segment.label}</span>
                    <span class="font-semibold text-text-primary">
                      {formatDailyRate(segment.averageDailyRate)}
                    </span>
                  </div>
                  <p class="mt-1 text-text-subtle">
                    {segment.missionCount} missions · {formatDailyRate(segment.minDailyRate)} -
                    {formatDailyRate(segment.maxDailyRate)}
                  </p>
                </div>
              {/each}
            </div>
          </article>
        </div>
      </section>

      <section class="mt-6" aria-labelledby="feature-flags-title">
        <div class="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p class="eyebrow text-text-subtle">Feature flipping</p>
            <h2 id="feature-flags-title" class="mt-1 text-lg font-semibold text-text-primary">
              Fonctionnalités disponibles sur le dashboard
            </h2>
          </div>
          <p class="text-sm text-text-subtle">
            {enabledFeatureCount} actives, {featureAccess.length - enabledFeatureCount} verrouillées
          </p>
        </div>

        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {#each featureAccess as feature}
            <article
              class="rounded-lg border bg-surface-white p-4 shadow-subtle-2 {feature.enabled
                ? 'border-border-light'
                : 'border-dashed border-disabled-gray opacity-80'}"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-[11px] font-medium uppercase text-text-muted">
                    {featureAreaLabels[feature.area]}
                  </p>
                  <h3 class="mt-1 text-sm font-semibold text-text-primary">{feature.label}</h3>
                </div>
                <Badge
                  label={feature.enabled
                    ? requirementLabels[feature.requirement]
                    : (feature.lockedReason ?? 'Verrouillé')}
                  variant={feature.enabled ? 'success' : 'warning'}
                />
              </div>
              <p class="mt-3 text-xs leading-5 text-text-subtle">{feature.description}</p>
            </article>
          {/each}
        </div>
      </section>

      <div class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section id="applications">
          <div class="rounded-xl border border-border-light bg-surface-white p-3 shadow-sm">
            <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <label
                class="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-lg border border-border-light bg-page-canvas px-3 text-sm text-text-subtle"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  class="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                  placeholder="Rechercher mission, client ou plateforme"
                  type="search"
                  value={searchQuery}
                  oninput={(event) => {
                    searchQuery = event.currentTarget.value;
                  }}
                />
              </label>
              <p class="shrink-0 text-xs font-medium text-text-subtle">
                {filteredApplications.length}/{applications.length} missions
              </p>
            </div>

            <div class="mt-3 flex flex-wrap gap-2" role="toolbar" aria-label="Filtrer par source">
              {#each sourceFilters as filter}
                <label
                  class="inline-flex h-7 cursor-pointer items-center rounded-full border px-2 text-[10px] font-medium transition-colors {selectedSource ===
                  filter.value
                    ? 'border-blueprint-blue/30 bg-blueprint-blue/10 text-blueprint-blue'
                    : 'border-border-light bg-surface-white text-text-secondary hover:bg-subtle-gray hover:text-text-primary'}"
                >
                  <input
                    class="mr-1.5 h-3 w-3 accent-blueprint-blue"
                    type="radio"
                    name="source-filter"
                    value={filter.value}
                    checked={selectedSource === filter.value}
                    oninput={() => {
                      selectedSource = filter.value;
                    }}
                  />
                  {filter.label}
                </label>
              {/each}
            </div>
          </div>

          <div class="mt-4 grid auto-rows-[104px] gap-4 md:grid-cols-2">
            {#if filteredApplications.length === 0}
              <article
                class="row-span-2 rounded-xl border border-dashed border-border-light bg-surface-white p-5"
              >
                <p class="text-sm font-semibold text-text-primary">Aucune mission trouvée</p>
                <p class="mt-2 text-sm leading-6 text-text-subtle">
                  Ajustez la recherche ou revenez à toutes les sources.
                </p>
                <button
                  type="button"
                  class="mt-5 inline-flex h-8 items-center rounded-lg border border-border-light bg-surface-white px-3 text-xs font-medium text-text-primary hover:bg-page-canvas"
                  onclick={() => {
                    searchQuery = '';
                    selectedSource = 'all';
                  }}
                >
                  Réinitialiser
                </button>
              </article>
            {/if}

            {#each filteredApplications as application}
              <article
                class="group flex min-h-0 flex-col justify-between rounded-xl border bg-surface-white p-4 shadow-subtle-2 transition duration-200 hover:-translate-y-0.5 hover:shadow-sm {selectedApplication?.id ===
                application.id
                  ? 'border-blueprint-blue/40 ring-2 ring-blueprint-blue/10'
                  : 'border-border-light'} {application.stage === 'interview'
                  ? 'row-span-3'
                  : 'row-span-2'}"
              >
                <div>
                  <div class="flex items-start justify-between gap-3">
                    <Badge label={sourceLabels[application.source]} variant="source" />
                    <Badge
                      label={`${application.score}%`}
                      variant={application.score >= 85 ? 'success' : 'warning'}
                    />
                  </div>
                  <h2 class="mt-4 text-lg font-semibold leading-tight text-text-primary">
                    {application.title}
                  </h2>
                  <p class="mt-2 text-sm text-text-subtle">
                    {application.company} · {application.location}
                  </p>
                </div>

                <div>
                  <div class="mb-4 grid grid-cols-2 gap-2 text-xs text-text-subtle">
                    <div class="rounded-lg bg-page-canvas px-3 py-2">
                      <p class="text-text-muted">TJM</p>
                      <p class="mt-1 font-medium text-text-primary">
                        {application.dailyRate ? `${application.dailyRate}€` : 'N/A'}
                      </p>
                    </div>
                    <div class="rounded-lg bg-page-canvas px-3 py-2">
                      <p class="text-text-muted">Relance</p>
                      <p class="mt-1 font-medium text-text-primary">
                        {formatDate(application.nextActionAt)}
                      </p>
                    </div>
                  </div>
                  <div class="flex min-w-0 items-center gap-3 border-t border-border-light pt-3">
                    <Badge label={stageLabels[application.stage]} variant="status" size="md" />
                    <button
                      type="button"
                      class="ml-auto inline-flex h-7 shrink-0 items-center justify-center rounded-md px-2 text-xs font-medium text-text-primary hover:bg-page-canvas hover:text-blueprint-blue"
                      onclick={() => {
                        selectedApplicationId = application.id;
                      }}
                    >
                      {selectedApplication?.id === application.id ? 'Sélectionnée' : 'Ouvrir'}
                    </button>
                  </div>
                </div>
              </article>
            {/each}
          </div>
        </section>

        <div class="space-y-4">
          {#if selectedApplication}
            <section class="rounded-xl border border-border-light bg-surface-white p-5 shadow-sm">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="eyebrow text-text-subtle">Candidature active</p>
                  <h2 class="mt-2 text-lg font-semibold leading-tight">
                    {selectedApplication.title}
                  </h2>
                  <p class="mt-1 text-sm text-text-subtle">
                    {selectedApplication.company} · {selectedApplication.location}
                  </p>
                </div>
                <Badge
                  label={`${selectedApplication.score}%`}
                  variant={selectedApplication.score >= 85 ? 'success' : 'warning'}
                  size="md"
                />
              </div>

              <dl class="mt-5 grid grid-cols-2 gap-2 text-xs">
                <div class="rounded-lg bg-page-canvas px-3 py-2">
                  <dt class="text-text-muted">Source</dt>
                  <dd class="mt-1 font-medium text-text-primary">
                    {sourceLabels[selectedApplication.source]}
                  </dd>
                </div>
                <div class="rounded-lg bg-page-canvas px-3 py-2">
                  <dt class="text-text-muted">Statut</dt>
                  <dd class="mt-1 font-medium text-text-primary">
                    {stageLabels[selectedApplication.stage]}
                  </dd>
                </div>
                <div class="rounded-lg bg-page-canvas px-3 py-2">
                  <dt class="text-text-muted">Postulé</dt>
                  <dd class="mt-1 font-medium text-text-primary">
                    {formatDate(selectedApplication.appliedAt)}
                  </dd>
                </div>
                <div class="rounded-lg bg-page-canvas px-3 py-2">
                  <dt class="text-text-muted">Relance</dt>
                  <dd class="mt-1 font-medium text-text-primary">
                    {formatDate(selectedApplication.nextActionAt)}
                  </dd>
                </div>
              </dl>

              {#if selectedApplication.sourceUrl}
                <a
                  class="mt-4 inline-flex h-8 items-center rounded-lg border border-border-light bg-surface-white px-3 text-xs font-medium text-text-primary hover:border-blueprint-blue/35 hover:bg-blueprint-blue/8 hover:text-blueprint-blue"
                  href={selectedApplication.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ouvrir la mission source
                </a>
              {/if}

              {#if form?.transitionError}
                <p
                  class="mt-4 rounded-lg border border-status-red/20 bg-status-red/8 px-3 py-2 text-xs leading-5 text-status-red"
                >
                  {form.transitionError}
                </p>
              {/if}

              {#if form?.transitionSuccess}
                <p
                  class="mt-4 rounded-lg border border-accent-green/15 bg-accent-green/8 px-3 py-2 text-xs leading-5 text-accent-green"
                >
                  {form.transitionSuccess}
                </p>
              {/if}

              {#if form?.detailsError}
                <p
                  class="mt-4 rounded-lg border border-status-red/20 bg-status-red/8 px-3 py-2 text-xs leading-5 text-status-red"
                >
                  {form.detailsError}
                </p>
              {/if}

              {#if form?.detailsSuccess}
                <p
                  class="mt-4 rounded-lg border border-accent-green/15 bg-accent-green/8 px-3 py-2 text-xs leading-5 text-accent-green"
                >
                  {form.detailsSuccess}
                </p>
              {/if}

              <form
                method="POST"
                action="?/updateApplicationDetails"
                class="mt-5 border-t border-border-light pt-4"
              >
                <input type="hidden" name="applicationId" value={selectedApplication.id} />
                <p class="text-xs font-medium uppercase text-text-subtle">Suivi opérationnel</p>
                <label
                  class="mt-3 block text-xs font-medium text-text-subtle"
                  for="application-notes"
                >
                  Notes
                </label>
                <textarea
                  id="application-notes"
                  name="notes"
                  class="mt-1 min-h-20 w-full resize-y rounded-lg border border-border-light bg-page-canvas px-3 py-2 text-sm leading-6 text-text-primary outline-none focus:border-blueprint-blue/40"
                  value={selectedApplication.notes}
                ></textarea>

                <div class="mt-3 grid grid-cols-2 gap-2">
                  <label
                    class="block text-xs font-medium text-text-subtle"
                    for="application-rating"
                  >
                    Rating
                    <select
                      id="application-rating"
                      name="userRating"
                      class="mt-1 h-9 w-full rounded-lg border border-border-light bg-page-canvas px-2 text-sm text-text-primary outline-none focus:border-blueprint-blue/40"
                    >
                      <option value="" selected={selectedApplication.userRating === null}>
                        Non notée
                      </option>
                      {#each [1, 2, 3, 4, 5] as rating}
                        <option value={rating} selected={selectedApplication.userRating === rating}>
                          {rating}/5
                        </option>
                      {/each}
                    </select>
                  </label>
                  <label
                    class="block text-xs font-medium text-text-subtle"
                    for="application-follow-up"
                  >
                    Prochaine relance
                    <input
                      id="application-follow-up"
                      name="nextActionDate"
                      type="date"
                      value={selectedApplication.nextActionAt?.slice(0, 10) ?? ''}
                      class="mt-1 h-9 w-full rounded-lg border border-border-light bg-page-canvas px-2 text-sm text-text-primary outline-none focus:border-blueprint-blue/40"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  class="mt-3 inline-flex h-8 items-center rounded-lg border border-blueprint-blue/25 bg-blueprint-blue/8 px-3 text-xs font-semibold text-blueprint-blue hover:border-blueprint-blue/40 hover:bg-blueprint-blue/12 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!isConnected}
                >
                  Enregistrer le suivi
                </button>
              </form>

              {#if isConnected && selectedNextStages.length > 0}
                <form
                  method="POST"
                  action="?/transitionApplication"
                  class="mt-5 border-t border-border-light pt-4"
                >
                  <input type="hidden" name="applicationId" value={selectedApplication.id} />
                  <p class="text-xs font-medium uppercase text-text-subtle">Changer d'étape</p>
                  <div class="mt-3 flex flex-wrap gap-2">
                    {#each selectedNextStages as stage}
                      <button
                        type="submit"
                        name="toStage"
                        value={stage}
                        class="inline-flex h-8 items-center rounded-lg border border-border-light bg-surface-white px-3 text-xs font-medium text-text-primary hover:border-blueprint-blue/35 hover:bg-blueprint-blue/8 hover:text-blueprint-blue"
                      >
                        {stageLabels[stage]}
                      </button>
                    {/each}
                  </div>
                </form>
              {:else if isConnected}
                <p
                  class="mt-4 rounded-lg border border-border-light bg-page-canvas px-3 py-2 text-xs leading-5 text-text-subtle"
                >
                  Cette candidature est dans un état final.
                </p>
              {:else}
                <p
                  class="mt-4 rounded-lg border border-border-light bg-page-canvas px-3 py-2 text-xs leading-5 text-text-subtle"
                >
                  Compte requis pour modifier le pipeline.
                </p>
              {/if}

              <div class="mt-5 border-t border-border-light pt-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-xs font-medium uppercase text-text-subtle">Activité pipeline</p>
                    <p class="mt-1 text-sm text-text-subtle">
                      {selectedTimeline.length} événements synchronisés
                    </p>
                  </div>
                  <Badge
                    label={selectedTimeline.length > 0 ? 'Historique' : 'Vide'}
                    variant={selectedTimeline.length > 0 ? 'success' : 'warning'}
                  />
                </div>

                <div class="mt-3 space-y-3">
                  {#if selectedTimeline.length === 0}
                    <div
                      class="rounded-lg border border-dashed border-border-light bg-page-canvas p-3"
                    >
                      <p class="text-xs leading-5 text-text-subtle">
                        Aucun événement pipeline synchronisé pour cette candidature.
                      </p>
                    </div>
                  {/if}

                  {#each selectedTimeline.slice(0, 5) as event}
                    <article class="rounded-lg border border-border-light bg-page-canvas px-3 py-3">
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <p class="text-sm font-medium text-text-primary">
                            {event.fromLabel
                              ? `${event.fromLabel} -> ${event.toLabel}`
                              : event.toLabel}
                          </p>
                          <p class="mt-1 text-xs text-text-subtle">
                            {event.createdByLabel} · {formatDate(event.occurredAt)}
                          </p>
                        </div>
                        <span
                          class="shrink-0 rounded-full bg-surface-white px-2 py-1 text-[10px] font-medium text-text-subtle"
                        >
                          {event.toLabel}
                        </span>
                      </div>
                      {#if event.note}
                        <p class="mt-2 text-xs leading-5 text-text-subtle">{event.note}</p>
                      {/if}
                    </article>
                  {/each}
                </div>
              </div>

              <div class="mt-5 border-t border-border-light pt-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-xs font-medium uppercase text-text-subtle">
                      Assistant candidature
                    </p>
                    <p class="mt-1 text-sm text-text-subtle">
                      {selectedGeneratedAssets.length} contenus générés pour cette mission
                    </p>
                  </div>
                  <Badge
                    label={selectedGeneratedAssets.length > 0 ? 'Historique' : 'À préparer'}
                    variant={selectedGeneratedAssets.length > 0 ? 'success' : 'warning'}
                  />
                </div>

                <div class="mt-3 space-y-3">
                  {#if selectedGeneratedAssets.length === 0}
                    <div
                      class="rounded-lg border border-dashed border-border-light bg-page-canvas p-3"
                    >
                      <p class="text-xs leading-5 text-text-subtle">
                        Aucun pitch, message recruteur ou résumé CV synchronisé pour cette
                        candidature. Les contenus créés dans l'extension apparaîtront ici.
                      </p>
                    </div>
                  {/if}

                  {#each selectedGeneratedAssets as asset}
                    <article class="rounded-lg border border-border-light bg-page-canvas p-3">
                      <div class="flex items-start justify-between gap-3">
                        <div>
                          <p class="text-sm font-medium text-text-primary">{asset.label}</p>
                          <p class="mt-1 text-xs text-text-subtle">
                            {asset.model} · {formatDate(asset.createdAt)}
                          </p>
                        </div>
                        <button
                          type="button"
                          class="inline-flex h-7 shrink-0 items-center rounded-md border border-border-light bg-surface-white px-2 text-xs font-medium text-text-primary hover:border-blueprint-blue/35 hover:text-blueprint-blue"
                          onclick={() => copyGeneratedAsset(asset)}
                        >
                          {copiedAssetId === asset.id ? 'Copié' : 'Copier'}
                        </button>
                      </div>
                      <p class="mt-3 text-xs leading-5 text-text-subtle">{asset.preview}</p>
                    </article>
                  {/each}
                </div>
              </div>
            </section>
          {/if}

          <section class="rounded-xl border border-border-light bg-surface-white p-5 shadow-sm">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="eyebrow text-text-subtle">Historique IA</p>
                <h2 class="mt-2 text-lg font-semibold">Assets générés</h2>
              </div>
              <Badge label={`${generatedAssets.length}`} variant="source" size="md" />
            </div>

            <div class="mt-4 space-y-3">
              {#if recentGeneratedAssets.length === 0}
                <p
                  class="rounded-lg border border-dashed border-border-light bg-page-canvas p-3 text-xs leading-5 text-text-subtle"
                >
                  Aucun contenu généré synchronisé pour le moment.
                </p>
              {/if}

              {#each recentGeneratedAssets as asset}
                <article class="rounded-lg border border-border-light bg-page-canvas px-3 py-3">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="text-sm font-medium text-text-primary">{asset.label}</p>
                      <p class="mt-1 truncate text-xs text-text-subtle">
                        {asset.applicationTitle} · {asset.company}
                      </p>
                    </div>
                    <span class="shrink-0 text-[10px] text-text-muted">
                      {formatDate(asset.createdAt)}
                    </span>
                  </div>
                  <p class="mt-2 line-clamp-2 text-xs leading-5 text-text-subtle">
                    {asset.preview}
                  </p>
                </article>
              {/each}
            </div>
          </section>

          <section
            id="cv"
            class="rounded-xl border border-border-light bg-surface-white p-5 shadow-sm"
          >
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="eyebrow text-text-subtle">Profil candidat</p>
                <h2 class="mt-2 text-lg font-semibold">CV principal</h2>
                <p class="mt-1 text-sm text-text-subtle">{cvDisplayTitle}</p>
              </div>
              <Badge
                label={`${cv.completeness}%`}
                variant={hasCvProfile ? 'success' : 'warning'}
                size="md"
              />
            </div>
            <div class="mt-5 rounded-xl border border-border-light bg-page-canvas p-4">
              <div class="space-y-2">
                <div class="h-3 w-2/3 rounded-full bg-text-primary"></div>
                <div class="h-2 w-full rounded-full bg-disabled-gray"></div>
                <div class="h-2 w-5/6 rounded-full bg-disabled-gray"></div>
                <div class="h-2 w-3/4 rounded-full bg-disabled-gray"></div>
              </div>
              <div class="mt-5 grid grid-cols-2 gap-2">
                <div class="h-16 rounded-lg bg-surface-white"></div>
                <div class="h-16 rounded-lg bg-surface-white"></div>
              </div>
            </div>
            <div class="mt-5 h-2 overflow-hidden rounded-full bg-subtle-gray">
              <div
                class="h-full rounded-full bg-blueprint-blue"
                style={`width: ${cv.completeness}%`}
              ></div>
            </div>
            {#if !hasCvProfile}
              <p
                class="mt-4 rounded-lg border border-dashed border-border-light bg-page-canvas p-3 text-xs leading-5 text-text-subtle"
              >
                Aucun CV canonique synchronisé. Créez un profil ici ou importez LinkedIn depuis
                l'extension connectée.
              </p>
            {/if}

            {#if cv.targetRole}
              <p class="mt-4 text-sm text-text-secondary">{cv.targetRole}</p>
            {/if}
            {#if cv.summary}
              <p class="mt-3 text-sm leading-6 text-text-subtle">{cv.summary}</p>
            {/if}
            <p class="mt-2 text-xs text-text-subtle">
              Dernière mise à jour : {formatDate(cv.updatedAt)}
            </p>

            {#if form?.cvError}
              <p
                class="mt-4 rounded-lg border border-status-red/20 bg-status-red/8 px-3 py-2 text-xs leading-5 text-status-red"
              >
                {form.cvError}
              </p>
            {/if}

            {#if form?.cvSuccess}
              <p
                class="mt-4 rounded-lg border border-accent-green/15 bg-accent-green/8 px-3 py-2 text-xs leading-5 text-accent-green"
              >
                {form.cvSuccess}
              </p>
            {/if}

            <form
              method="POST"
              action="?/updateCvProfile"
              class="mt-5 border-t border-border-light pt-4"
            >
              <p class="text-xs font-medium uppercase text-text-subtle">Édition canonique</p>
              <label class="mt-3 block text-xs font-medium text-text-subtle" for="cv-title">
                Titre du profil
                <input
                  id="cv-title"
                  name="title"
                  value={cv.title}
                  maxlength="120"
                  class="mt-1 h-9 w-full rounded-lg border border-border-light bg-page-canvas px-2 text-sm text-text-primary outline-none focus:border-blueprint-blue/40"
                />
              </label>
              <label class="mt-3 block text-xs font-medium text-text-subtle" for="cv-target-role">
                Rôle cible
                <input
                  id="cv-target-role"
                  name="targetRole"
                  value={cv.targetRole}
                  maxlength="120"
                  class="mt-1 h-9 w-full rounded-lg border border-border-light bg-page-canvas px-2 text-sm text-text-primary outline-none focus:border-blueprint-blue/40"
                />
              </label>
              <label class="mt-3 block text-xs font-medium text-text-subtle" for="cv-summary">
                Résumé
                <textarea
                  id="cv-summary"
                  name="summary"
                  maxlength="4000"
                  class="mt-1 min-h-24 w-full resize-y rounded-lg border border-border-light bg-page-canvas px-3 py-2 text-sm leading-6 text-text-primary outline-none focus:border-blueprint-blue/40"
                  value={cv.summary}
                ></textarea>
              </label>
              <button
                type="submit"
                class="mt-3 inline-flex h-8 items-center rounded-lg border border-blueprint-blue/25 bg-blueprint-blue/8 px-3 text-xs font-semibold text-blueprint-blue hover:border-blueprint-blue/40 hover:bg-blueprint-blue/12 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!isConnected}
              >
                Enregistrer le profil CV
              </button>
            </form>

            <div class="mt-4 grid grid-cols-3 gap-2 text-xs">
              <div class="rounded-lg bg-page-canvas px-3 py-2">
                <p class="text-text-muted">Expériences</p>
                <p class="mt-1 font-medium text-text-primary">{cv.experiences.length}</p>
              </div>
              <div class="rounded-lg bg-page-canvas px-3 py-2">
                <p class="text-text-muted">Formations</p>
                <p class="mt-1 font-medium text-text-primary">{cv.education.length}</p>
              </div>
              <div class="rounded-lg bg-page-canvas px-3 py-2">
                <p class="text-text-muted">Liens</p>
                <p class="mt-1 font-medium text-text-primary">{cv.links.length}</p>
              </div>
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
              {#each cv.skills as skill}
                <Badge label={skill} variant="tech" />
              {/each}
            </div>

            {#if latestCvImport}
              <div class="mt-5 rounded-lg border border-border-light bg-page-canvas p-3">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-xs font-medium uppercase text-text-subtle">Dernier import</p>
                    <p class="mt-1 text-sm font-medium text-text-primary">
                      {sourceLabels[latestCvImport.source]} · {latestCvImport.extractorVersion}
                    </p>
                  </div>
                  <Badge
                    label={importStatusLabels[latestCvImport.status]}
                    variant={latestCvImport.status === 'error' ? 'warning' : 'success'}
                  />
                </div>
                <p class="mt-2 text-xs leading-5 text-text-subtle">
                  {formatDate(latestCvImport.importedAt)}
                  {#if formatFieldCounts(latestCvImport.fieldCounts)}
                    · {formatFieldCounts(latestCvImport.fieldCounts)}
                  {/if}
                </p>
                {#if latestCvImport.errorMessage}
                  <p class="mt-2 text-xs leading-5 text-status-orange">
                    {latestCvImport.errorCode}: {latestCvImport.errorMessage}
                  </p>
                {/if}
              </div>
            {/if}

            {#if cv.suggestions.length > 0}
              <div class="mt-5 border-t border-border-light pt-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-xs font-medium uppercase text-text-subtle">
                      Suggestions d'import
                    </p>
                    <p class="mt-1 text-sm text-text-subtle">
                      Champs préservés après édition dashboard
                    </p>
                  </div>
                  <Badge label={`${cv.suggestions.length}`} variant="warning" />
                </div>

                <div class="mt-3 space-y-3">
                  {#each cv.suggestions as suggestion}
                    <article class="rounded-lg border border-border-light bg-page-canvas px-3 py-3">
                      <div class="flex items-start justify-between gap-3">
                        <div>
                          <p class="text-sm font-medium text-text-primary">
                            {suggestion.fieldLabel}
                          </p>
                          <p class="mt-1 text-xs text-text-subtle">
                            {sourceLabels[suggestion.source]} · {formatDate(suggestion.createdAt)}
                          </p>
                        </div>
                        <Badge label={suggestionStatusLabels[suggestion.status]} variant="source" />
                      </div>
                      <div class="mt-3 grid gap-2 text-xs">
                        <div class="rounded-lg bg-surface-white px-3 py-2">
                          <p class="text-text-muted">Valeur dashboard</p>
                          <p class="mt-1 leading-5 text-text-primary">
                            {suggestion.currentValue ?? 'Vide'}
                          </p>
                        </div>
                        <div class="rounded-lg bg-surface-white px-3 py-2">
                          <p class="text-text-muted">Proposition importée</p>
                          <p class="mt-1 leading-5 text-text-primary">
                            {suggestion.suggestedValue ?? 'Vide'}
                          </p>
                        </div>
                      </div>
                      <form
                        method="POST"
                        action="?/resolveCvSuggestion"
                        class="mt-3 flex flex-wrap gap-2 border-t border-border-light pt-3"
                      >
                        <input type="hidden" name="suggestionId" value={suggestion.id} />
                        <button
                          type="submit"
                          name="resolutionAction"
                          value="apply"
                          class="inline-flex h-8 items-center rounded-lg border border-blueprint-blue/25 bg-blueprint-blue/8 px-3 text-xs font-semibold text-blueprint-blue hover:border-blueprint-blue/40 hover:bg-blueprint-blue/12 disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={!isConnected}
                        >
                          Appliquer
                        </button>
                        <button
                          type="submit"
                          name="resolutionAction"
                          value="dismiss"
                          class="inline-flex h-8 items-center rounded-lg border border-border-light bg-surface-white px-3 text-xs font-medium text-text-primary hover:bg-surface-white/70 disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={!isConnected}
                        >
                          Ignorer
                        </button>
                      </form>
                    </article>
                  {/each}
                </div>
              </div>
            {/if}

            {#if cv.experiences.length > 0}
              <div class="mt-5 border-t border-border-light pt-4">
                <p class="text-xs font-medium uppercase text-text-subtle">Expériences importées</p>
                <div class="mt-3 space-y-3">
                  {#each cv.experiences.slice(0, 3) as experience}
                    <article class="rounded-lg border border-border-light bg-page-canvas px-3 py-3">
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <h3 class="text-sm font-medium text-text-primary">{experience.title}</h3>
                          <p class="mt-1 text-xs text-text-subtle">
                            {experience.company ?? 'Entreprise non renseignée'} ·
                            {experience.location ?? 'Lieu non renseigné'}
                          </p>
                        </div>
                        <span class="shrink-0 text-[10px] text-text-muted">
                          {experience.dateRange}
                        </span>
                      </div>
                      {#if experience.description}
                        <p class="mt-2 line-clamp-2 text-xs leading-5 text-text-subtle">
                          {experience.description}
                        </p>
                      {/if}
                    </article>
                  {/each}
                </div>
              </div>
            {/if}

            {#if cv.imports.length > 1}
              <div class="mt-5 border-t border-border-light pt-4">
                <p class="text-xs font-medium uppercase text-text-subtle">Historique imports</p>
                <div class="mt-3 space-y-2">
                  {#each cv.imports.slice(1) as item}
                    <div class="flex items-center justify-between gap-3 text-xs">
                      <span class="text-text-secondary">
                        {sourceLabels[item.source]} · {formatDate(item.importedAt)}
                      </span>
                      <span class="text-text-subtle">{importStatusLabels[item.status]}</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </section>

          <section
            id="sync"
            class="rounded-xl border border-border-light bg-surface-white p-5 shadow-sm"
          >
            <p class="eyebrow text-text-subtle">Connecteurs</p>
            <h2 class="mt-2 text-lg font-semibold">Synchronisation extension</h2>
            <p class="mt-1 text-sm leading-6 text-text-subtle">
              {readiness.readyPlatforms}/{readiness.totalPlatforms} plateformes prêtes. La synchro CV
              est activée uniquement pour les comptes connectés; le dashboard prépare le plan, l'extension
              exécute la mise à jour dans les sessions navigateur existantes.
            </p>

            <div class="mt-5 rounded-lg border border-border-light bg-page-canvas p-3">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-xs font-medium uppercase text-text-subtle">File de sync</p>
                  <p class="mt-1 text-sm text-text-subtle">
                    {connectedSyncStatuses.length} entités suivies via Supabase
                  </p>
                </div>
                <Badge
                  label={hasSyncActionRequired
                    ? 'Action requise'
                    : connectedSyncStatuses.some((status) => status.state === 'pending')
                      ? 'En attente'
                      : 'Stable'}
                  variant={hasSyncActionRequired ? 'warning' : 'success'}
                />
              </div>

              <div class="mt-3 space-y-2">
                {#if connectedSyncStatuses.length === 0}
                  <p
                    class="rounded-lg border border-dashed border-border-light bg-surface-white p-3 text-xs leading-5 text-text-subtle"
                  >
                    Aucun appareil extension enregistré dans Supabase pour le moment.
                  </p>
                {/if}

                {#each connectedSyncStatuses as status}
                  <article class="rounded-lg border border-border-light bg-surface-white px-3 py-3">
                    <div class="flex items-start justify-between gap-3">
                      <div>
                        <p class="text-sm font-medium text-text-primary">{status.label}</p>
                        <p class="mt-1 text-xs text-text-subtle">{status.deviceLabel}</p>
                      </div>
                      <Badge
                        label={connectedSyncStateLabels[status.state]}
                        variant={status.state === 'error'
                          ? 'warning'
                          : status.state === 'healthy'
                            ? 'success'
                            : 'source'}
                      />
                    </div>

                    <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div class="rounded-lg bg-page-canvas px-2 py-2">
                        <p class="text-text-muted">Upload</p>
                        <p class="mt-1 font-medium text-text-primary">
                          {status.pendingUploadCount} en attente
                        </p>
                      </div>
                      <div class="rounded-lg bg-page-canvas px-2 py-2">
                        <p class="text-text-muted">Download</p>
                        <p class="mt-1 font-medium text-text-primary">
                          {status.pendingDownloadCount} en attente
                        </p>
                      </div>
                    </div>

                    <p class="mt-2 text-xs leading-5 text-text-subtle">
                      Push: {formatDate(status.lastPushAt)} · Pull: {formatDate(status.lastPullAt)}
                    </p>

                    {#if status.lastErrorMessage}
                      <p
                        class="mt-2 rounded-md border border-status-orange/20 bg-status-orange/8 px-2 py-1.5 text-xs leading-5 text-status-orange"
                      >
                        {status.lastErrorCode ?? 'sync_error'}: {status.lastErrorMessage}
                      </p>
                    {/if}

                    {#if status.retryAfterAt}
                      <p class="mt-2 text-xs leading-5 text-text-subtle">
                        Nouvelle tentative après {formatDateTime(status.retryAfterAt)}
                      </p>
                    {/if}
                  </article>
                {/each}
              </div>
            </div>

            {#if syncConflicts.length > 0}
              <div class="mt-5 rounded-lg border border-status-orange/20 bg-status-orange/8 p-3">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-xs font-medium uppercase text-status-orange">
                      Conflits de synchronisation
                    </p>
                    <p class="mt-1 text-xs leading-5 text-text-subtle">
                      {syncConflictCountText}
                    </p>
                  </div>
                  <Badge label="Action requise" variant="warning" />
                </div>

                <div class="mt-3 space-y-2">
                  {#each syncConflicts as conflict}
                    <article
                      class="rounded-lg border border-status-orange/15 bg-surface-white px-3 py-3"
                    >
                      <div class="flex items-start justify-between gap-3">
                        <div>
                          <p class="text-sm font-medium text-text-primary">
                            {conflict.entityLabel} · {conflict.field}
                          </p>
                          <p class="mt-1 text-xs leading-5 text-text-subtle">
                            {conflict.deviceLabel} · {formatDateTime(conflict.detectedAt)}
                          </p>
                        </div>
                        <Badge
                          label={syncConflictStatusLabels[conflict.status]}
                          variant="warning"
                        />
                      </div>

                      <div class="mt-3 grid gap-2 text-xs md:grid-cols-2">
                        <div class="rounded-lg bg-page-canvas px-2 py-2">
                          <p class="font-medium text-text-subtle">
                            {syncConflictActorLabels[conflict.remoteUpdatedBy]}
                          </p>
                          <p class="mt-1 break-words leading-5 text-text-primary">
                            {conflict.remoteValue ?? 'Vide'}
                          </p>
                        </div>
                        <div class="rounded-lg bg-page-canvas px-2 py-2">
                          <p class="font-medium text-text-subtle">
                            {syncConflictActorLabels[conflict.localUpdatedBy]}
                          </p>
                          <p class="mt-1 break-words leading-5 text-text-primary">
                            {conflict.localValue ?? 'Vide'}
                          </p>
                        </div>
                      </div>
                    </article>
                  {/each}
                </div>
              </div>
            {/if}

            <div class="mt-5 space-y-3">
              {#each syncStatuses as platform}
                <div
                  class="flex items-center justify-between gap-4 rounded-lg border border-border-light bg-page-canvas px-3 py-3"
                >
                  <div>
                    <p class="text-sm font-medium">{platform.name}</p>
                    <p class="text-xs text-text-subtle">
                      Dernière synchro: {formatDate(platform.lastSyncAt)}
                    </p>
                  </div>
                  <Badge
                    label={statusLabels[platform.status]}
                    variant={platform.status === 'ready' ? 'success' : 'warning'}
                  />
                </div>
              {/each}
            </div>

            {#if syncBlockers.length > 0}
              <div class="mt-5 rounded-lg border border-border-light bg-page-canvas p-3">
                <p class="text-xs font-medium uppercase text-text-subtle">À traiter ensuite</p>
                <ul class="mt-2 space-y-1 text-xs leading-5 text-text-subtle">
                  {#each syncBlockers as blocker}
                    <li>{blocker}</li>
                  {/each}
                </ul>
              </div>
            {/if}

            {#if cvSyncAccess && !cvSyncAccess.enabled}
              <div class="mt-5 rounded-lg border border-blueprint-blue/20 bg-blueprint-blue/8 p-3">
                <p class="text-xs font-medium uppercase text-blueprint-blue">Feature verrouillée</p>
                <p class="mt-1 text-xs leading-5 text-text-subtle">
                  Connectez-vous pour activer la synchronisation CV et associer le plan de mise à
                  jour à votre compte MissionPulse.
                </p>
              </div>
            {/if}

            <button
              type="button"
              class="mt-5 inline-flex h-10 w-full items-center justify-center rounded-lg border border-blueprint-blue bg-blueprint-blue px-4 text-sm font-medium text-surface-white shadow-subtle-2 hover:bg-blueprint-blue/90 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canPrepareCvSync}
              onclick={() => {
                syncPrepared = true;
              }}
            >
              {cvSyncAccess?.enabled
                ? 'Préparer le plan de synchro'
                : 'Compte requis pour la synchro CV'}
            </button>

            {#if syncPrepared}
              <p
                class="mt-3 rounded-lg border border-accent-green/15 bg-accent-green/8 px-3 py-2 text-xs leading-5 text-accent-green"
              >
                Plan prêt pour {readyPlatforms.map((platform) => platform.name).join(', ')}. Les
                autres plateformes restent dans la checklist.
              </p>
            {/if}
          </section>
        </div>
      </div>

      <section
        class="mx-auto mt-8 max-w-2xl rounded-xl border border-border-light bg-surface-white/95 p-4 shadow-subtle-2"
        aria-labelledby="privacy-title"
      >
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p class="eyebrow text-text-subtle">Confidentialité</p>
            <h2 id="privacy-title" class="mt-1 text-lg font-semibold text-text-primary">
              Données connectées
            </h2>
            <p class="mt-2 text-sm leading-6 text-text-subtle">
              Exportez les données synchronisées via Supabase ou supprimez les snapshots connectés
              du dashboard. Les sessions et credentials des plateformes ne sont jamais stockés.
            </p>
          </div>
          <a
            class="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-border-light bg-surface-white px-3 text-xs font-medium text-text-primary hover:bg-page-canvas aria-disabled:pointer-events-none aria-disabled:opacity-40"
            href={isConnected ? '/export.json' : data.loginUrl || '/login'}
            download={isConnected ? 'missionpulse-connected-data.json' : undefined}
            aria-disabled={!isConnected}
          >
            Export JSON
          </a>
        </div>

        {#if form?.privacyError}
          <p
            class="mt-4 rounded-lg border border-status-red/20 bg-status-red/8 px-3 py-2 text-xs leading-5 text-status-red"
          >
            {form.privacyError}
          </p>
        {/if}

        {#if form?.privacySuccess}
          <p
            class="mt-4 rounded-lg border border-accent-green/15 bg-accent-green/8 px-3 py-2 text-xs leading-5 text-accent-green"
          >
            {form.privacySuccess}
          </p>
        {/if}

        <form
          method="POST"
          action="?/deleteConnectedData"
          class="mt-5 border-t border-border-light pt-4"
        >
          <label class="block text-xs font-medium text-text-subtle" for="privacy-confirmation">
            Confirmation suppression
            <input
              id="privacy-confirmation"
              name="confirmation"
              placeholder="SUPPRIMER"
              class="mt-1 h-9 w-full rounded-lg border border-border-light bg-page-canvas px-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-status-red/40"
              autocomplete="off"
            />
          </label>
          <button
            type="submit"
            class="mt-3 inline-flex h-8 items-center rounded-lg border border-status-red/25 bg-status-red/8 px-3 text-xs font-semibold text-status-red hover:border-status-red/40 hover:bg-status-red/12 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!isConnected}
          >
            Supprimer les données connectées
          </button>
        </form>
      </section>

      <section
        class="mx-auto mt-8 max-w-2xl rounded-xl border border-border-light bg-surface-white/95 p-4 shadow-subtle-2"
        aria-label="Préparation synchronisation CV"
      >
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p class="text-sm font-semibold text-text-primary">Prochaine action MVP</p>
            <p class="mt-1 text-sm leading-6 text-text-subtle">
              {canPrepareCvSync
                ? `Préparer la mise à jour CV pour ${readyPlatforms.map((platform) => platform.name).join(', ')}.`
                : cvSyncAccess && !cvSyncAccess.enabled
                  ? 'Créer ou connecter un compte pour activer la synchronisation CV.'
                  : 'Résoudre les préconditions avant de préparer une synchronisation.'}
            </p>
          </div>
          <a
            class="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-border-light bg-surface-white px-3 text-xs font-medium text-text-primary hover:bg-page-canvas"
            href="#sync"
          >
            Voir les connecteurs
          </a>
        </div>
      </section>
    </div>
  </section>
</main>
