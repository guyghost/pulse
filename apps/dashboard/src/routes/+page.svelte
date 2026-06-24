<script lang="ts">
  import { env } from '$env/dynamic/public';
  import { Badge } from '@pulse/ui';
  import {
    buildMissionComparisonSnapshot,
    buildDashboardSuccessMilestones,
    countApplicationsByStage,
    filterApplications,
    filterMissionFeedItems,
    getAverageApplicationScore,
    getCvSyncReadiness,
    getNextApplicationStages,
    getNextFollowUp,
    getReadyCvSyncPlatforms,
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
    DashboardAlertPreferences,
    GeneratedApplicationAsset,
    MissionApplication,
    MissionComparisonSnapshot,
    MissionFeedItem,
    MissionScoreCriteria,
    PlatformSyncStatus,
    TjmRadarSnapshot,
  } from '$lib/core/dashboard';

  let { data, form }: { data: PageData; form?: ActionData } = $props();

  type DashboardStoryTone = 'success' | 'attention' | 'incident';
  type DashboardStoryActionTarget = 'install' | 'sync' | 'applications' | 'mission-feed' | 'cv';
  type DashboardSetupStepState = 'complete' | 'current' | 'pending';

  interface DashboardOperationalStory {
    tone: DashboardStoryTone;
    badge: string;
    title: string;
    impact: string;
    action: string;
    actionTarget: DashboardStoryActionTarget;
    signals: string[];
  }

  interface DashboardSetupStep {
    title: string;
    detail: string;
    state: DashboardSetupStepState;
    actionLabel?: string;
    href?: string;
  }

  interface DashboardSetupPreviewItem {
    title: string;
    detail: string;
    signal: string;
  }

  interface SyncConflictResolutionStep {
    title: string;
    detail: string;
  }

  const missionFeed = $derived(data.missionFeed as MissionFeedItem[]);
  const chromeStoreUrl = env.PUBLIC_CHROME_STORE_URL || 'https://chromewebstore.google.com/';
  const tjmRadar = $derived(data.tjmRadar as TjmRadarSnapshot);
  const applications = $derived(data.applications as MissionApplication[]);
  const applicationTimeline = $derived(data.applicationTimeline as ApplicationTimelineEvent[]);
  const generatedAssets = $derived(data.generatedAssets as GeneratedApplicationAsset[]);
  const cv = $derived(data.cv as CvSnapshot);
  const syncStatuses = $derived(data.syncStatuses as PlatformSyncStatus[]);
  const connectedSyncStatuses = $derived(data.connectedSyncStatuses as ConnectedSyncStatus[]);
  const syncConflicts = $derived(data.syncConflicts as DashboardSyncConflict[]);
  const alertPreferences = $derived(data.alertPreferences as DashboardAlertPreferences);
  const entitlements = $derived(data.entitlements as DashboardAccountEntitlements);
  const featureAccess = $derived(data.featureAccess as DashboardFeatureAccess[]);
  const configurationMissing = $derived(Boolean(data.configurationMissing));
  const counts = $derived(countApplicationsByStage(applications));
  const readiness = $derived(getCvSyncReadiness(cv, syncStatuses));
  const isConnected = $derived(Boolean(data.session));
  const hasConnectedExtension = $derived(connectedSyncStatuses.length > 0);
  const enabledFeatureCount = $derived(featureAccess.filter((feature) => feature.enabled).length);
  const dashboardReady = $derived(isConnected && !configurationMissing && hasConnectedExtension);
  const setupRequired = $derived(!dashboardReady);
  const hasDashboardSnapshots = $derived(
    missionFeed.length > 0 || applications.length > 0 || connectedSyncStatuses.length > 0
  );
  const dashboardSetupSteps = $derived(
    getDashboardSetupSteps({
      isConnected,
      configurationMissing,
      hasConnectedExtension,
      hasDashboardSnapshots,
      loginUrl: data.loginUrl || '/login',
      chromeStoreUrl,
    })
  );
  const completedDashboardSetupStepCount = $derived(
    dashboardSetupSteps.filter((step) => step.state === 'complete').length
  );
  const currentDashboardSetupStep = $derived(
    dashboardSetupSteps.find((step) => step.state === 'current') ?? {
      title: 'Ouvrir le compte MissionPulse',
      detail: 'Le dashboard doit reconnaître votre compte avant de relier une extension.',
      state: 'current',
      actionLabel: 'Se connecter',
      href: data.loginUrl || '/login',
    }
  );
  const sidebarConnectionTitle = $derived(
    hasConnectedExtension
      ? 'Extension Chrome'
      : isConnected
        ? 'Extension à relier'
        : 'Compte requis'
  );
  const sidebarConnectionLabel = $derived(
    hasConnectedExtension ? 'Connectée' : isConnected ? 'À relier' : 'Hors ligne'
  );
  const sidebarConnectionDescription = $derived(
    hasConnectedExtension
      ? 'Les mises à jour CV seront exécutées depuis les sessions navigateur existantes.'
      : isConnected
        ? "Installez l'extension puis reliez ce compte pour recevoir les snapshots."
        : "Connectez le compte MissionPulse avant de relier l'extension Chrome."
  );
  const syncConflictResolutionSteps: SyncConflictResolutionStep[] = [
    {
      title: '1. Identifier la source fiable',
      detail:
        'Comparez la date, l’appareil et le contexte métier avant de choisir une valeur à conserver.',
    },
    {
      title: '2. Choisir l’arbitrage',
      detail:
        'Garder dashboard conserve la donnée web; appliquer extension renvoie la valeur Chrome à la prochaine récupération.',
    },
    {
      title: '3. Ignorer seulement le bruit',
      detail:
        'Ignorer ferme le conflit sans écriture métier quand les deux valeurs ne changent pas la décision.',
    },
  ];
  const freshMissionCount = $derived(
    missionFeed.filter((mission) => mission.freshness === 'fresh').length
  );
  const topFreshMission = $derived(getTopFreshMission(missionFeed));
  let searchQuery = $state('');
  let selectedSource = $state<'all' | MissionApplication['source']>('all');
  let missionFeedQuery = $state('');
  let missionFeedSource = $state<'all' | MissionApplication['source']>('all');
  let missionFeedMinScore = $state(0);
  let missionFeedFreshness = $state<'all' | MissionFeedItem['freshness']>('all');
  let selectedApplicationId = $state<string | null>(null);
  let syncPrepared = $state(false);
  let copiedAssetId = $state<string | null>(null);
  let privacyConfirmation = $state('');
  const averageScore = $derived(getAverageApplicationScore(applications));
  const nextFollowUp = $derived(getNextFollowUp(applications));
  const canDeleteConnectedData = $derived(isConnected && privacyConfirmation === 'SUPPRIMER');
  const applicationCountBadgeLabel = $derived(
    applications.length > 0
      ? `${applications.length} suivie${applications.length > 1 ? 's' : ''}`
      : 'Aucune sync'
  );
  const averageScoreBadgeLabel = $derived(averageScore > 0 ? 'Score synchronisé' : 'Sans score');
  const interviewBadgeLabel = $derived(counts.interview > 0 ? 'Prioritaire' : 'Aucun');
  const nextFollowUpBadgeLabel = $derived(nextFollowUp ? 'À traiter' : 'Aucune relance');
  const sourceFilters: { label: string; value: 'all' | MissionApplication['source'] }[] = [
    { label: 'Toutes', value: 'all' },
    { label: 'LinkedIn', value: 'linkedin' },
    { label: 'Free-Work', value: 'free-work' },
    { label: 'LeHibou', value: 'lehibou' },
    { label: 'Hiway', value: 'hiway' },
    { label: 'Collective', value: 'collective' },
    { label: 'Cherry Pick', value: 'cherry-pick' },
    { label: 'Malt', value: 'malt' },
    { label: 'Autre', value: 'other' },
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
  const filteredMissionFeed = $derived(
    filterMissionFeedItems(
      missionFeed,
      {
        query: missionFeedQuery,
        source: missionFeedSource,
        minScore: missionFeedMinScore > 0 ? missionFeedMinScore : null,
        freshness: missionFeedFreshness,
      },
      sourceLabels
    )
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
  const missionComparison = $derived(
    buildMissionComparisonSnapshot(applications, 3) as MissionComparisonSnapshot
  );
  const successMilestones = $derived(
    buildDashboardSuccessMilestones({
      missionFeed,
      applications,
      applicationTimeline,
      cv,
      exportAvailable: isConnected && hasDashboardSnapshots,
    })
  );
  const dashboardSetupPreviewItems = $derived([
    {
      title: 'Feed connecté',
      detail: 'Les missions, scores et raisons IA apparaissent après le premier scan extension.',
      signal: missionFeed.length > 0 ? `${missionFeed.length} missions` : 'Après scan',
    },
    {
      title: 'Candidatures',
      detail: 'Les sélections, relances et assets générés se remplissent depuis le pipeline local.',
      signal: applications.length > 0 ? `${applications.length} suivies` : 'Après sélection',
    },
    {
      title: 'Radar TJM',
      detail: 'Les fourchettes et stacks dominantes se calculent quand des TJM sont synchronisés.',
      signal: tjmRadar.missionCount > 0 ? `${tjmRadar.missionCount} TJM` : 'Après données',
    },
    {
      title: 'Shortlist',
      detail: 'La comparaison s’active quand des missions sont sélectionnées ou avancées.',
      signal:
        missionComparison.items.length > 0
          ? `${missionComparison.items.length} missions`
          : 'Après shortlist',
    },
  ] satisfies DashboardSetupPreviewItem[]);
  const recentGeneratedAssets = $derived(generatedAssets.slice(0, 5));
  const syncBlockers = $derived(getSyncBlockers(cv, syncStatuses));
  const readyPlatforms = $derived(getReadyCvSyncPlatforms(syncStatuses));
  const cvSyncAccess = $derived(featureAccess.find((feature) => feature.id === 'cv-sync') ?? null);
  const canPrepareCvSync = $derived(readiness.canSync && Boolean(cvSyncAccess?.enabled));
  const hasSyncActionRequired = $derived(
    syncConflicts.length > 0 || connectedSyncStatuses.some((status) => status.state === 'error')
  );
  const syncErrorCount = $derived(
    connectedSyncStatuses.filter((status) => status.state === 'error').length
  );
  const operationalStory = $derived(
    getDashboardOperationalStory({
      configurationMissing,
      isConnected,
      hasSyncActionRequired,
      syncConflictCount: syncConflicts.length,
      syncErrorCount,
      nextFollowUp,
      topFreshMission,
      canPrepareCvSync,
      applicationCount: applications.length,
      freshMissionCount,
      creditBalance: entitlements.creditBalance,
    })
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
    'needs-permission': 'Permission requise',
    blocked: 'Bloqué',
    error: 'Erreur',
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
  const remotePreferenceLabels: Record<NonNullable<CvSnapshot['remotePreference']>, string> = {
    full: 'Remote',
    hybrid: 'Hybride',
    onsite: 'Sur site',
    any: 'Indifférent',
  };
  const seniorityLabels: Record<NonNullable<CvSnapshot['seniority']>, string> = {
    junior: 'Junior',
    confirmed: 'Confirmé',
    senior: 'Senior',
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
  const formatStacks = (stacks: string[]) => stacks.join(', ');
  const scoreCriteriaLabels: { key: keyof MissionScoreCriteria; label: string }[] = [
    { key: 'stack', label: 'Stack' },
    { key: 'tjm', label: 'TJM' },
    { key: 'location', label: 'Localisation' },
    { key: 'remote', label: 'Remote' },
    { key: 'seniorityBonus', label: 'Séniorité' },
    { key: 'startDateBonus', label: 'Démarrage' },
  ];
  const formatScoreCriterion = (value: number | null) =>
    typeof value === 'number' ? `${value}` : 'N/A';

  function getPlatformStatusBadgeVariant(
    status: PlatformSyncStatus['status']
  ): 'success' | 'warning' | 'error' {
    if (status === 'ready') {
      return 'success';
    }
    if (status === 'blocked' || status === 'error') {
      return 'error';
    }
    return 'warning';
  }

  function getDashboardSetupSteps(input: {
    isConnected: boolean;
    configurationMissing: boolean;
    hasConnectedExtension: boolean;
    hasDashboardSnapshots: boolean;
    loginUrl: string;
    chromeStoreUrl: string;
  }): DashboardSetupStep[] {
    const accountState: DashboardSetupStepState = input.isConnected ? 'complete' : 'current';
    const extensionState: DashboardSetupStepState = input.hasConnectedExtension
      ? 'complete'
      : input.isConnected
        ? 'current'
        : 'pending';
    const scanState: DashboardSetupStepState = input.hasDashboardSnapshots
      ? 'complete'
      : !input.isConnected || input.configurationMissing || !input.hasConnectedExtension
        ? 'pending'
        : 'current';

    return [
      {
        title: 'Ouvrir le compte MissionPulse',
        detail: input.isConnected
          ? 'Compte actif, prêt à recevoir les snapshots synchronisés.'
          : 'Le dashboard doit reconnaître votre compte avant de relier une extension.',
        state: accountState,
        actionLabel: accountState === 'current' ? 'Se connecter' : undefined,
        href: accountState === 'current' ? input.loginUrl : undefined,
      },
      {
        title: "Relier l'extension Chrome",
        detail:
          extensionState === 'complete'
            ? 'Extension prête à transmettre missions, candidatures, CV et statuts.'
            : input.isConnected
              ? "Installez l'extension, ouvrez ses réglages puis reliez ce compte."
              : 'Disponible dès que le compte est ouvert.',
        state: extensionState,
        actionLabel: extensionState === 'current' ? "Installer l'extension" : undefined,
        href: extensionState === 'current' ? input.chromeStoreUrl : undefined,
      },
      {
        title: 'Lancer le premier scan',
        detail: input.hasDashboardSnapshots
          ? 'Des snapshots sont disponibles dans le dashboard.'
          : 'Un scan remplit ensuite les missions, candidatures, CV et statuts.',
        state: scanState,
      },
    ];
  }

  function getTopFreshMission(missions: MissionFeedItem[]): MissionFeedItem | null {
    return missions.reduce<MissionFeedItem | null>((best, mission) => {
      if (mission.freshness !== 'fresh') {
        return best;
      }
      if (!best || mission.score > best.score) {
        return mission;
      }
      return best;
    }, null);
  }

  function getDashboardOperationalStory(input: {
    configurationMissing: boolean;
    isConnected: boolean;
    hasSyncActionRequired: boolean;
    syncConflictCount: number;
    syncErrorCount: number;
    nextFollowUp: MissionApplication | null;
    topFreshMission: MissionFeedItem | null;
    canPrepareCvSync: boolean;
    applicationCount: number;
    freshMissionCount: number;
    creditBalance: number;
  }): DashboardOperationalStory {
    if (input.configurationMissing || !input.isConnected) {
      return {
        tone: 'attention',
        badge: 'Connexion requise',
        title: 'Aucune extension connectée au cockpit',
        impact:
          'Le dashboard ne peut pas encore confirmer les missions, candidatures, CV et statuts synchronisés.',
        action: "Prochaine action: installer l'extension, connecter le compte puis lancer un scan.",
        actionTarget: 'install',
        signals: ['Extension absente', 'Snapshots indisponibles', 'Sessions gardées dans Chrome'],
      };
    }

    if (input.hasSyncActionRequired) {
      return {
        tone: 'incident',
        badge: 'Arbitrage requis',
        title: 'La synchronisation demande une décision',
        impact: `${input.syncConflictCount} conflit(s) et ${input.syncErrorCount} erreur(s) peuvent rendre les données connectées incomplètes.`,
        action: 'Prochaine action: ouvrir la synchronisation et résoudre les champs prioritaires.',
        actionTarget: 'sync',
        signals: ['Conflit détecté', 'Fiabilité partielle', 'Action manuelle utile'],
      };
    }

    if (input.nextFollowUp) {
      return {
        tone: 'attention',
        badge: 'À traiter',
        title: `Relance à préparer pour ${input.nextFollowUp.title}`,
        impact: `Le dossier est au statut ${stageLabels[input.nextFollowUp.stage]} avec une prochaine action datée.`,
        action:
          'Prochaine action: ouvrir la candidature et traiter la relance avant de scanner plus.',
        actionTarget: 'applications',
        signals: [
          'Relance détectée',
          `${input.applicationCount} candidatures suivies`,
          'Pipeline actif',
        ],
      };
    }

    if (input.topFreshMission && input.topFreshMission.score >= 85) {
      return {
        tone: 'success',
        badge: 'Opportunité',
        title: `${input.topFreshMission.title} ressort comme meilleure mission fraîche`,
        impact: `Score ${input.topFreshMission.score}% sur ${sourceLabels[input.topFreshMission.source]}. Le feed contient ${input.freshMissionCount} mission(s) récente(s).`,
        action: 'Prochaine action: sélectionner cette mission ou comparer les meilleures options.',
        actionTarget: 'mission-feed',
        signals: ['Mission fraîche', 'Score élevé', 'Décision de sélection'],
      };
    }

    if (!input.canPrepareCvSync) {
      return {
        tone: 'attention',
        badge: 'Précondition',
        title: 'Le CV ne peut pas encore être synchronisé',
        impact:
          'La préparation CV dépend du profil, des plateformes prêtes et de l’accès compte/Premium.',
        action: 'Prochaine action: ouvrir le CV et résoudre la première précondition affichée.',
        actionTarget: 'cv',
        signals: ['CV à vérifier', 'Synchronisation limitée', `${input.creditBalance} crédits`],
      };
    }

    return {
      tone: 'success',
      badge: 'Normal',
      title: 'Le cockpit est prêt pour arbitrer les missions',
      impact:
        'Aucun conflit prioritaire détecté. Les données connectées peuvent être utilisées pour sélectionner, relancer ou générer.',
      action: 'Prochaine action: traiter la meilleure mission ou vérifier la prochaine relance.',
      actionTarget: 'mission-feed',
      signals: [
        'Sync stable',
        `${input.applicationCount} candidatures`,
        `${input.freshMissionCount} fraîches`,
      ],
    };
  }

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
        href="#comparison"
      >
        Comparaison
      </a>
      <a
        class="flex h-9 items-center rounded-lg px-3 text-sm text-text-subtle hover:bg-page-canvas hover:text-text-primary"
        href="#cv"
      >
        CV
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
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs font-medium text-text-primary">{sidebarConnectionTitle}</p>
          <span
            class="inline-flex items-center gap-1.5 rounded-full border bg-surface-white px-2 py-0.5 text-[10px] font-medium {dashboardReady
              ? 'border-accent-green/25 text-accent-green'
              : 'border-status-orange/25 text-status-orange'}"
          >
            <span
              class="h-1.5 w-1.5 rounded-full {dashboardReady
                ? 'bg-accent-green'
                : 'bg-status-orange'}"
            ></span>
            {sidebarConnectionLabel}
          </span>
        </div>
        <p class="mt-2 text-xs leading-5 text-text-subtle">{sidebarConnectionDescription}</p>
        <div class="mt-3 flex items-center justify-between border-t border-border-light pt-3">
          <span class="text-xs text-text-subtle">
            {dashboardReady ? 'Features actives' : 'Setup'}
          </span>
          <span class="text-xs font-semibold text-text-primary">
            {#if dashboardReady}
              {enabledFeatureCount}/{featureAccess.length}
            {:else}
              {completedDashboardSetupStepCount}/{dashboardSetupSteps.length}
            {/if}
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
                {#if setupRequired}
                  {completedDashboardSetupStepCount}/{dashboardSetupSteps.length} setup
                {:else}
                  {enabledFeatureCount}/{featureAccess.length} features
                {/if}
              </span>
              <span
                class="rounded-full border px-2 py-1 text-xs font-medium {isConnected
                  ? 'border-blueprint-blue/25 bg-blueprint-blue/8 text-blueprint-blue'
                  : 'border-border-light bg-surface-white text-text-subtle'}"
              >
                {isConnected ? 'Compte connecté' : 'En attente de compte'}
              </span>
            </div>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-text-subtle">
              Retrouvez les données normalisées par l'extension dans le dashboard connecté. Les
              scans et sessions plateforme restent dans Chrome; seuls les snapshots utiles sont
              synchronisés avec votre compte.
            </p>
          </div>
          {#if !setupRequired}
            <a
              class="inline-flex h-8 items-center justify-center rounded-lg border border-blueprint-blue/25 bg-blueprint-blue/8 px-3 text-xs font-semibold text-blueprint-blue shadow-subtle-2 hover:border-blueprint-blue/40 hover:bg-blueprint-blue/12"
              href="#cv"
            >
              Vérifier le CV
            </a>
          {/if}
        </div>

        <div class="mt-6 flex border-b border-border-light">
          <a
            class="-mb-px border-b-2 border-text-primary px-3 py-2 text-sm font-medium text-text-primary"
            href="#applications"
          >
            Candidatures
          </a>
          <a class="px-3 py-2 text-sm text-text-subtle hover:text-text-primary" href="#sync"
            >Synchronisation</a
          >
          <a class="px-3 py-2 text-sm text-text-subtle hover:text-text-primary" href="#cv">CV</a>
        </div>
      </section>

      {#if setupRequired}
        <section
          class="mb-6 rounded-lg border border-blueprint-blue/20 bg-blueprint-blue/8 p-4 shadow-subtle-2"
          aria-labelledby="dashboard-setup-title"
        >
          <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p id="dashboard-setup-title" class="text-sm font-medium text-text-primary">
                Checklist de setup
              </p>
              <p class="mt-1 max-w-3xl text-sm leading-6 text-text-subtle">
                Le dashboard devient utile après trois validations: compte reconnu, extension
                reliée, premier scan lancé depuis Chrome.
              </p>
              <p class="mt-2 text-xs leading-5 text-text-subtle">
                Les cookies et sessions Free-Work, LeHibou, Hiway, Collective, Cherry Pick ou Malt
                restent dans Chrome.
              </p>
            </div>
            {#if currentDashboardSetupStep.href && currentDashboardSetupStep.actionLabel}
              <a
                class="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-blueprint-blue px-3 text-xs font-semibold text-white hover:bg-blueprint-blue/90"
                href={currentDashboardSetupStep.href}
              >
                {currentDashboardSetupStep.actionLabel}
              </a>
            {/if}
          </div>

          <ol class="mt-4 grid gap-2 md:grid-cols-3" aria-label="Progression setup dashboard">
            {#each dashboardSetupSteps as step, index}
              <li
                class="rounded-lg border bg-surface-white p-3 {step.state === 'complete'
                  ? 'border-accent-green/20'
                  : step.state === 'current'
                    ? 'border-blueprint-blue/25 shadow-subtle-2'
                    : 'border-border-light'}"
              >
                <div class="flex items-start gap-3">
                  <span
                    class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold {step.state ===
                    'complete'
                      ? 'border-accent-green/25 bg-accent-green/10 text-accent-green'
                      : step.state === 'current'
                        ? 'border-blueprint-blue/25 bg-blueprint-blue/8 text-blueprint-blue'
                        : 'border-border-light bg-page-canvas text-text-muted'}"
                    aria-hidden="true"
                  >
                    {#if step.state === 'complete'}
                      <svg
                        viewBox="0 0 24 24"
                        class="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="m5 12 4 4L19 6" />
                      </svg>
                    {:else}
                      {index + 1}
                    {/if}
                  </span>
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-text-primary">{step.title}</p>
                    <p class="mt-1 text-xs leading-5 text-text-subtle">{step.detail}</p>
                  </div>
                </div>
              </li>
            {/each}
          </ol>

          {#if configurationMissing && import.meta.env.DEV}
            <p
              class="mt-3 rounded-lg border border-border-light bg-surface-white px-3 py-2 text-xs leading-5 text-text-subtle"
            >
              Diagnostic local: le service connecté n'est pas configuré dans cet environnement.
            </p>
          {/if}
        </section>
      {/if}

      {#if setupRequired}
        <section
          class="mb-6 rounded-xl border border-border-light bg-surface-white p-4 shadow-subtle-2"
          aria-labelledby="dashboard-setup-preview-title"
        >
          <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p class="eyebrow text-text-subtle">Après setup</p>
              <h2
                id="dashboard-setup-preview-title"
                class="mt-1 text-lg font-semibold text-text-primary"
              >
                Surfaces activées après setup
              </h2>
              <p class="mt-2 max-w-3xl text-sm leading-6 text-text-subtle">
                Les vues de décision restent résumées tant que le compte, l'extension et le premier
                scan ne sont pas validés. Le dashboard évite ainsi les métriques vides ou les N/A
                hors contexte.
              </p>
            </div>
            <span
              class="inline-flex h-8 shrink-0 items-center rounded-lg border border-border-light bg-page-canvas px-3 text-xs font-semibold text-text-subtle"
            >
              {completedDashboardSetupStepCount}/{dashboardSetupSteps.length} validées
            </span>
          </div>

          <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {#each dashboardSetupPreviewItems as item}
              <article class="rounded-lg border border-border-light bg-page-canvas p-3">
                <div class="flex items-start justify-between gap-3">
                  <h3 class="text-sm font-semibold text-text-primary">{item.title}</h3>
                  <Badge label={item.signal} variant="source" />
                </div>
                <p class="mt-2 text-xs leading-5 text-text-subtle">{item.detail}</p>
              </article>
            {/each}
          </div>
        </section>
      {/if}

      {#if !setupRequired}
        <section
          class="mb-6 rounded-xl border p-4 shadow-subtle-2 {operationalStory.tone === 'incident'
            ? 'border-status-red/25 bg-status-red/8'
            : operationalStory.tone === 'attention'
              ? 'border-status-orange/25 bg-status-orange/8'
              : 'border-blueprint-blue/20 bg-blueprint-blue/8'}"
          aria-labelledby="operational-story-title"
        >
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="eyebrow text-text-subtle">État opérationnel</p>
                <Badge
                  label={operationalStory.badge}
                  variant={operationalStory.tone === 'incident'
                    ? 'error'
                    : operationalStory.tone === 'attention'
                      ? 'warning'
                      : 'success'}
                />
              </div>
              <h2 id="operational-story-title" class="mt-2 text-xl font-semibold text-text-primary">
                {operationalStory.title}
              </h2>
              <div class="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                  <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">
                    Impact
                  </p>
                  <p class="mt-1 text-sm leading-6 text-text-secondary">
                    {operationalStory.impact}
                  </p>
                </div>
                <div>
                  <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">
                    Action recommandée
                  </p>
                  <p class="mt-1 text-sm font-medium leading-6 text-text-primary">
                    {operationalStory.action}
                  </p>
                </div>
              </div>
              <div class="mt-4 flex flex-wrap gap-2">
                {#each operationalStory.signals as signal}
                  <span
                    class="rounded-lg border border-border-light bg-surface-white px-2.5 py-1 text-xs font-medium text-text-subtle"
                  >
                    {signal}
                  </span>
                {/each}
              </div>
            </div>

            <a
              class="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-blueprint-blue px-3 text-xs font-semibold text-white hover:bg-blueprint-blue/90"
              href={operationalStory.actionTarget === 'install'
                ? chromeStoreUrl
                : operationalStory.actionTarget === 'sync'
                  ? '#sync'
                  : operationalStory.actionTarget === 'applications'
                    ? '#applications'
                    : operationalStory.actionTarget === 'cv'
                      ? '#cv'
                      : '#mission-feed-title'}
            >
              Aller à l'action
            </a>
          </div>
        </section>
      {/if}

      {#if !setupRequired}
        <section
          class="mb-6 rounded-xl border border-border-light bg-surface-white p-4 shadow-subtle-2"
          aria-labelledby="success-milestones-title"
        >
          <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p class="eyebrow text-text-subtle">Résultats débloqués</p>
              <h2
                id="success-milestones-title"
                class="mt-1 text-lg font-semibold text-text-primary"
              >
                Jalons de confiance
              </h2>
              <p class="mt-2 max-w-3xl text-sm leading-6 text-text-subtle">
                Les premiers gains concrets restent visibles: mission qualifiée, relance traitée, CV
                prêt et export disponible.
              </p>
            </div>
          </div>

          <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {#each successMilestones as milestone}
              <article
                class="rounded-lg border p-3 {milestone.state === 'complete'
                  ? 'border-accent-green/20 bg-accent-green/8'
                  : milestone.state === 'ready'
                    ? 'border-blueprint-blue/20 bg-blueprint-blue/8'
                    : 'border-border-light bg-page-canvas'}"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-xs font-semibold text-text-primary">{milestone.title}</p>
                    <p class="mt-1 text-sm font-semibold text-text-primary">
                      {milestone.result}
                    </p>
                  </div>
                  <Badge
                    label={milestone.signal}
                    variant={milestone.state === 'complete'
                      ? 'success'
                      : milestone.state === 'ready'
                        ? 'status'
                        : 'source'}
                  />
                </div>
                <p class="mt-2 text-xs leading-5 text-text-subtle">{milestone.detail}</p>
              </article>
            {/each}
          </div>
        </section>
      {/if}

      {#if !setupRequired}
        <section
          class="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
          aria-label="Indicateurs candidatures"
        >
          <div class="rounded-lg border border-border-light bg-surface-white p-4 shadow-subtle-2">
            <p class="text-xs font-medium uppercase text-text-subtle">Candidatures</p>
            <div class="mt-3 flex items-end justify-between">
              <p class="text-3xl font-semibold">{applications.length}</p>
              <Badge
                label={applicationCountBadgeLabel}
                variant={applications.length > 0 ? 'success' : 'source'}
              />
            </div>
          </div>
          <div class="rounded-lg border border-border-light bg-surface-white p-4 shadow-subtle-2">
            <p class="text-xs font-medium uppercase text-text-subtle">Taux moyen</p>
            <div class="mt-3 flex items-end justify-between">
              <p class="text-3xl font-semibold">{averageScore}%</p>
              <Badge
                label={averageScoreBadgeLabel}
                variant={averageScore > 0 ? 'status' : 'source'}
              />
            </div>
          </div>
          <div class="rounded-lg border border-border-light bg-surface-white p-4 shadow-subtle-2">
            <p class="text-xs font-medium uppercase text-text-subtle">Entretiens</p>
            <div class="mt-3 flex items-end justify-between">
              <p class="text-3xl font-semibold">{counts.interview}</p>
              <Badge
                label={interviewBadgeLabel}
                variant={counts.interview > 0 ? 'warning' : 'source'}
              />
            </div>
          </div>
          <div class="rounded-lg border border-border-light bg-surface-white p-4 shadow-subtle-2">
            <p class="text-xs font-medium uppercase text-text-subtle">Prochaine relance</p>
            <div class="mt-3 flex items-end justify-between">
              <p class="text-3xl font-semibold">{formatDate(nextFollowUp?.nextActionAt ?? null)}</p>
              <Badge label={nextFollowUpBadgeLabel} variant={nextFollowUp ? 'warning' : 'source'} />
            </div>
          </div>
        </section>

        <section class="mt-6" aria-labelledby="mission-feed-title">
          <div class="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p class="eyebrow text-text-subtle">Feed connecté</p>
              <div class="mt-1 flex flex-wrap items-center gap-2">
                <h2 id="mission-feed-title" class="text-lg font-semibold text-text-primary">
                  Missions détectées par l'extension
                </h2>
                <Badge
                  label={missionFeed.length > 0 ? 'Synchronisé' : 'En attente extension'}
                  variant={missionFeed.length > 0 ? 'success' : 'source'}
                />
              </div>
            </div>
            <p class="text-sm text-text-subtle">
              {filteredMissionFeed.length}/{missionFeed.length} affichées, {freshMissionCount}
              fraîches
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

          <div
            class="mb-3 grid gap-3 rounded-xl border border-border-light bg-surface-white p-3 md:grid-cols-[minmax(0,1fr)_160px_150px_140px]"
          >
            <label class="min-w-0 text-xs font-medium text-text-subtle">
              Recherche
              <input
                class="mt-1 h-10 w-full rounded-lg border border-border-light bg-page-canvas px-3 text-sm text-text-primary outline-none focus:border-blueprint-blue"
                placeholder="Mission, client, stack"
                bind:value={missionFeedQuery}
              />
            </label>
            <label class="text-xs font-medium text-text-subtle">
              Source
              <select
                class="mt-1 h-10 w-full rounded-lg border border-border-light bg-page-canvas px-3 text-sm text-text-primary outline-none focus:border-blueprint-blue"
                bind:value={missionFeedSource}
              >
                {#each sourceFilters as source}
                  <option value={source.value}>{source.label}</option>
                {/each}
              </select>
            </label>
            <label class="text-xs font-medium text-text-subtle">
              Score min.
              <input
                class="mt-1 h-10 w-full rounded-lg border border-border-light bg-page-canvas px-3 text-sm text-text-primary outline-none focus:border-blueprint-blue"
                type="number"
                min="0"
                max="100"
                bind:value={missionFeedMinScore}
              />
            </label>
            <label class="text-xs font-medium text-text-subtle">
              Fraîcheur
              <select
                class="mt-1 h-10 w-full rounded-lg border border-border-light bg-page-canvas px-3 text-sm text-text-primary outline-none focus:border-blueprint-blue"
                bind:value={missionFeedFreshness}
              >
                <option value="all">Toutes</option>
                <option value="fresh">Récentes</option>
                <option value="stale">À revoir</option>
              </select>
            </label>
          </div>

          <div class="grid gap-3 lg:grid-cols-3">
            {#if missionFeed.length === 0}
              <article
                class="rounded-xl border border-dashed border-border-light bg-surface-white p-5 lg:col-span-3"
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-semibold text-text-primary">
                      Aucune mission reçue depuis l'extension
                    </p>
                    <p class="mt-2 max-w-2xl text-sm leading-6 text-text-subtle">
                      Connectez l'extension à votre compte MissionPulse puis lancez un scan. Les
                      missions retenues, les favoris et les statuts de candidature apparaîtront ici.
                    </p>
                  </div>
                  <Badge label="En attente" variant="source" />
                </div>
                {#if setupRequired}
                  <p
                    class="mt-4 rounded-lg border border-border-light bg-page-canvas px-3 py-2 text-xs leading-5 text-text-subtle"
                  >
                    Terminez la checklist de setup ci-dessus pour activer le feed connecté.
                  </p>
                {:else}
                  <div class="mt-4 flex flex-wrap gap-2">
                    <a
                      class="inline-flex h-9 items-center justify-center rounded-lg bg-blueprint-blue px-3 text-xs font-semibold text-white hover:bg-blueprint-blue/90"
                      href={chromeStoreUrl}
                    >
                      Installer l'extension
                    </a>
                    <a
                      class="inline-flex h-9 items-center justify-center rounded-lg border border-border-light bg-page-canvas px-3 text-xs font-semibold text-text-primary hover:bg-subtle-gray"
                      href={data.loginUrl || '/login'}
                    >
                      Connecter mon compte
                    </a>
                  </div>
                {/if}
                <p class="mt-2 text-sm leading-6 text-text-subtle">
                  Le dashboard ne lit pas directement vos sessions plateforme.
                </p>
              </article>
            {:else if filteredMissionFeed.length === 0}
              <article
                class="rounded-xl border border-dashed border-border-light bg-surface-white p-5"
              >
                <p class="text-sm font-semibold text-text-primary">Aucune mission ne correspond</p>
                <p class="mt-2 text-sm leading-6 text-text-subtle">
                  Ajustez la recherche, la source, le score ou la fraîcheur.
                </p>
              </article>
            {/if}

            {#each filteredMissionFeed.slice(0, 6) as mission}
              <article
                class="rounded-xl border border-border-light bg-surface-white p-4 shadow-subtle-2"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="flex flex-wrap gap-1.5">
                    <Badge label={sourceLabels[mission.source]} variant="source" />
                    {#if mission.sourceHealthStatus}
                      <Badge
                        label={`Santé: ${statusLabels[mission.sourceHealthStatus]}`}
                        variant={getPlatformStatusBadgeVariant(mission.sourceHealthStatus)}
                      />
                    {/if}
                  </div>
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
                {#if mission.sourceHealthErrorMessage}
                  <p
                    class="mt-3 rounded-md border border-status-orange/20 bg-status-orange/8 px-2 py-1.5 text-xs leading-5 text-status-orange"
                  >
                    {mission.sourceHealthErrorCode ?? 'connector_health'}:
                    {mission.sourceHealthErrorMessage}
                  </p>
                {/if}

                <div class="mt-3 grid grid-cols-3 gap-1.5 text-[10px]">
                  {#each scoreCriteriaLabels as criterion}
                    <div class="rounded-md border border-border-light bg-surface-white px-2 py-1.5">
                      <p class="text-text-muted">{criterion.label}</p>
                      <p class="mt-0.5 font-medium text-text-primary">
                        {formatScoreCriterion(mission.scoreCriteria[criterion.key])}
                      </p>
                    </div>
                  {/each}
                </div>

                <div class="mt-3 flex flex-wrap gap-1.5">
                  {#each mission.stack.slice(0, 4) as skill}
                    <span
                      class="rounded-md bg-blueprint-blue/8 px-2 py-1 text-[10px] font-medium text-blueprint-blue"
                    >
                      {skill}
                    </span>
                  {/each}
                </div>

                <div
                  class="mt-4 flex items-center justify-between border-t border-border-light pt-3"
                >
                  <span class="text-xs text-text-subtle">{formatDate(mission.scrapedAt)}</span>
                  {#if mission.applicationStage}
                    <Badge label={stageLabels[mission.applicationStage]} variant="status" />
                  {:else if isConnected}
                    <div class="flex items-center gap-2">
                      <form method="POST" action="?/archiveMission">
                        <input type="hidden" name="missionId" value={mission.id} />
                        <button
                          type="submit"
                          class="text-xs font-medium text-text-subtle hover:text-text-primary"
                        >
                          Archiver
                        </button>
                      </form>
                      <form method="POST" action="?/selectMission">
                        <input type="hidden" name="missionId" value={mission.id} />
                        <button
                          type="submit"
                          class="text-xs font-medium text-blueprint-blue hover:text-text-primary"
                        >
                          Sélectionner
                        </button>
                      </form>
                    </div>
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

        <section id="comparison" class="mt-6" aria-labelledby="mission-comparison-title">
          <div class="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p class="eyebrow text-text-subtle">Shortlist</p>
              <h2
                id="mission-comparison-title"
                class="mt-1 text-lg font-semibold text-text-primary"
              >
                Comparaison des missions prioritaires
              </h2>
            </div>
            <p class="text-sm text-text-subtle">
              {missionComparison.items.length} missions comparées · score moyen
              {missionComparison.averageScore}%
            </p>
          </div>

          {#if missionComparison.items.length === 0}
            <article
              class="rounded-xl border border-dashed border-border-light bg-surface-white p-5"
            >
              <p class="text-sm font-semibold text-text-primary">Aucune shortlist à comparer</p>
              <p class="mt-2 text-sm leading-6 text-text-subtle">
                Sélectionnez une mission depuis le feed ou avancez une candidature pour alimenter la
                comparaison dashboard.
              </p>
            </article>
          {:else}
            <div class="grid gap-3 lg:grid-cols-3">
              {#each missionComparison.items as item}
                <article
                  class="rounded-xl border border-border-light bg-surface-white p-4 shadow-subtle-2"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <Badge label={sourceLabels[item.source]} variant="source" />
                      <h3 class="mt-3 text-base font-semibold leading-tight text-text-primary">
                        {item.title}
                      </h3>
                      <p class="mt-1 text-xs text-text-subtle">{item.company} · {item.location}</p>
                    </div>
                    <Badge
                      label={`#${item.scoreRank} score`}
                      variant={item.id === missionComparison.bestScoreId ? 'success' : 'status'}
                    />
                  </div>

                  <dl class="mt-4 grid grid-cols-3 gap-2 text-xs">
                    <div class="rounded-lg bg-page-canvas px-2 py-2">
                      <dt class="text-text-muted">Score</dt>
                      <dd class="mt-1 font-semibold text-text-primary">{item.score}%</dd>
                    </div>
                    <div class="rounded-lg bg-page-canvas px-2 py-2">
                      <dt class="text-text-muted">TJM</dt>
                      <dd class="mt-1 font-semibold text-text-primary">
                        {formatDailyRate(item.dailyRate)}
                      </dd>
                    </div>
                    <div class="rounded-lg bg-page-canvas px-2 py-2">
                      <dt class="text-text-muted">Relance</dt>
                      <dd class="mt-1 font-semibold text-text-primary">
                        {formatDate(item.nextActionAt)}
                      </dd>
                    </div>
                  </dl>

                  <div class="mt-4 flex flex-wrap gap-1.5">
                    <Badge label={stageLabels[item.stage]} variant="status" />
                    {#if item.id === missionComparison.bestRateId}
                      <Badge label="Meilleur TJM" variant="success" />
                    {/if}
                    {#if item.id === missionComparison.earliestFollowUpId}
                      <Badge label="Relance proche" variant="warning" />
                    {/if}
                    {#if item.userRating}
                      <Badge label={`${item.userRating}/5`} variant="source" />
                    {/if}
                  </div>

                  <div class="mt-4 grid gap-2 text-xs">
                    <div class="rounded-lg bg-page-canvas px-3 py-2">
                      <p class="font-medium text-text-primary">Forces</p>
                      <p class="mt-1 leading-5 text-text-subtle">{item.strengths.join(' · ')}</p>
                    </div>
                    {#if item.risks.length > 0}
                      <div class="rounded-lg bg-status-orange/8 px-3 py-2">
                        <p class="font-medium text-status-orange">Points à vérifier</p>
                        <p class="mt-1 leading-5 text-text-subtle">{item.risks.join(' · ')}</p>
                      </div>
                    {/if}
                  </div>
                </article>
              {/each}
            </div>
          {/if}
        </section>
      {/if}

      <div class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section id="applications">
          {#if setupRequired}
            <article class="rounded-xl border border-border-light bg-surface-white p-5 shadow-sm">
              <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p class="eyebrow text-text-subtle">Candidatures</p>
                  <h2 class="mt-2 text-lg font-semibold text-text-primary">
                    Pipeline activé après setup
                  </h2>
                  <p class="mt-2 max-w-2xl text-sm leading-6 text-text-subtle">
                    Les dossiers, relances et contenus générés apparaîtront ici après connexion de
                    l'extension et sélection d'une première mission. Pour l'instant, la checklist de
                    setup reste la seule action prioritaire.
                  </p>
                </div>
                <Badge label={currentDashboardSetupStep.title} variant="warning" size="md" />
              </div>
              <a
                class="mt-4 inline-flex h-9 items-center justify-center rounded-lg border border-blueprint-blue/25 bg-blueprint-blue/8 px-3 text-xs font-semibold text-blueprint-blue hover:border-blueprint-blue/40 hover:bg-blueprint-blue/12"
                href={currentDashboardSetupStep.href ?? '#dashboard-setup-title'}
              >
                {currentDashboardSetupStep.actionLabel ?? 'Voir la checklist'}
              </a>
            </article>
          {:else}
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
          {/if}
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

          {#if !setupRequired}
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
          {/if}

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

            <p class="mt-4 text-sm text-text-secondary">
              {cv.targetRole || 'Rôle cible non renseigné'}
            </p>
            {#if cv.summary}
              <p class="mt-3 text-sm leading-6 text-text-subtle">{cv.summary}</p>
            {/if}
            <p class="mt-2 text-xs text-text-subtle">
              Dernière mise à jour : {formatDate(cv.updatedAt)}
            </p>

            <div class="mt-4 grid gap-2 text-xs sm:grid-cols-2">
              <div class="rounded-lg bg-page-canvas px-3 py-2">
                <p class="text-text-muted">Localisation</p>
                <p class="mt-1 font-medium text-text-primary">
                  {cv.location || 'Non renseignée'}
                </p>
              </div>
              <div class="rounded-lg bg-page-canvas px-3 py-2">
                <p class="text-text-muted">TJM cible</p>
                <p class="mt-1 font-medium text-text-primary">
                  {cv.tjmMin !== null || cv.tjmMax !== null
                    ? `${cv.tjmMin ?? 0}€ - ${cv.tjmMax ?? 5000}€`
                    : 'Non renseigné'}
                </p>
              </div>
              <div class="rounded-lg bg-page-canvas px-3 py-2">
                <p class="text-text-muted">Remote</p>
                <p class="mt-1 font-medium text-text-primary">
                  {cv.remotePreference
                    ? remotePreferenceLabels[cv.remotePreference]
                    : 'Non renseigné'}
                </p>
              </div>
              <div class="rounded-lg bg-page-canvas px-3 py-2">
                <p class="text-text-muted">Séniorité</p>
                <p class="mt-1 font-medium text-text-primary">
                  {cv.seniority ? seniorityLabels[cv.seniority] : 'Non renseignée'}
                </p>
              </div>
            </div>

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
              <div class="mt-3 grid gap-3 sm:grid-cols-2">
                <label class="block text-xs font-medium text-text-subtle" for="cv-location">
                  Localisation
                  <input
                    id="cv-location"
                    name="location"
                    value={cv.location}
                    maxlength="120"
                    class="mt-1 h-9 w-full rounded-lg border border-border-light bg-page-canvas px-2 text-sm text-text-primary outline-none focus:border-blueprint-blue/40"
                  />
                </label>
                <label class="block text-xs font-medium text-text-subtle" for="cv-remote">
                  Remote
                  <select
                    id="cv-remote"
                    name="remotePreference"
                    value={cv.remotePreference ?? ''}
                    class="mt-1 h-9 w-full rounded-lg border border-border-light bg-page-canvas px-2 text-sm text-text-primary outline-none focus:border-blueprint-blue/40"
                  >
                    <option value="">Non renseigné</option>
                    <option value="full">Remote</option>
                    <option value="hybrid">Hybride</option>
                    <option value="onsite">Sur site</option>
                    <option value="any">Indifférent</option>
                  </select>
                </label>
                <label class="block text-xs font-medium text-text-subtle" for="cv-tjm-min">
                  TJM minimum
                  <input
                    id="cv-tjm-min"
                    name="tjmMin"
                    type="number"
                    min="0"
                    max="5000"
                    value={cv.tjmMin ?? ''}
                    class="mt-1 h-9 w-full rounded-lg border border-border-light bg-page-canvas px-2 text-sm text-text-primary outline-none focus:border-blueprint-blue/40"
                  />
                </label>
                <label class="block text-xs font-medium text-text-subtle" for="cv-tjm-max">
                  TJM maximum
                  <input
                    id="cv-tjm-max"
                    name="tjmMax"
                    type="number"
                    min="0"
                    max="5000"
                    value={cv.tjmMax ?? ''}
                    class="mt-1 h-9 w-full rounded-lg border border-border-light bg-page-canvas px-2 text-sm text-text-primary outline-none focus:border-blueprint-blue/40"
                  />
                </label>
                <label class="block text-xs font-medium text-text-subtle" for="cv-seniority">
                  Séniorité
                  <select
                    id="cv-seniority"
                    name="seniority"
                    value={cv.seniority ?? ''}
                    class="mt-1 h-9 w-full rounded-lg border border-border-light bg-page-canvas px-2 text-sm text-text-primary outline-none focus:border-blueprint-blue/40"
                  >
                    <option value="">Non renseignée</option>
                    <option value="junior">Junior</option>
                    <option value="confirmed">Confirmé</option>
                    <option value="senior">Senior</option>
                  </select>
                </label>
              </div>
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

            {#if cv.education.length > 0}
              <div class="mt-5 border-t border-border-light pt-4">
                <p class="text-xs font-medium uppercase text-text-subtle">Formations importées</p>
                <div class="mt-3 space-y-3">
                  {#each cv.education.slice(0, 3) as education}
                    <article class="rounded-lg border border-border-light bg-page-canvas px-3 py-3">
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <h3 class="text-sm font-medium text-text-primary">{education.school}</h3>
                          <p class="mt-1 text-xs text-text-subtle">
                            {[education.degree, education.field].filter(Boolean).join(' · ') ||
                              'Programme non renseigné'}
                          </p>
                        </div>
                        <span class="shrink-0 text-[10px] text-text-muted">
                          {education.dateRange}
                        </span>
                      </div>
                    </article>
                  {/each}
                </div>
              </div>
            {/if}

            {#if cv.links.length > 0}
              <div class="mt-5 border-t border-border-light pt-4">
                <p class="text-xs font-medium uppercase text-text-subtle">Liens importés</p>
                <div class="mt-3 flex flex-wrap gap-2">
                  {#each cv.links as link}
                    <a
                      class="inline-flex items-center rounded-lg border border-border-light bg-page-canvas px-3 py-2 text-xs font-medium text-text-primary transition hover:border-blueprint-blue/30 hover:text-blueprint-blue"
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {link.label}
                    </a>
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
              est activée uniquement pour les comptes connectés; le dashboard prépare le plan, et l'extension
              extrait LinkedIn depuis la session navigateur existante.
            </p>

            <div class="mt-5 rounded-lg border border-border-light bg-page-canvas p-3">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-xs font-medium uppercase text-text-subtle">Alertes missions</p>
                  <p class="mt-1 text-sm leading-5 text-text-subtle">
                    Critères connectés que l'extension pourra appliquer lors des prochains scans.
                  </p>
                </div>
                <Badge
                  label={alertPreferences.enabled ? 'Actives' : 'En pause'}
                  variant={alertPreferences.enabled ? 'success' : 'warning'}
                />
              </div>

              {#if form?.alertError}
                <p
                  class="mt-3 rounded-lg border border-status-red/20 bg-status-red/8 px-3 py-2 text-xs leading-5 text-status-red"
                >
                  {form.alertError}
                </p>
              {/if}

              {#if form?.alertSuccess}
                <p
                  class="mt-3 rounded-lg border border-accent-green/15 bg-accent-green/8 px-3 py-2 text-xs leading-5 text-accent-green"
                >
                  {form.alertSuccess}
                </p>
              {/if}

              <form method="POST" action="?/updateAlertPreferences" class="mt-4 grid gap-3">
                <label class="inline-flex items-center gap-2 text-xs font-medium text-text-subtle">
                  <input
                    class="h-4 w-4 accent-blueprint-blue"
                    type="checkbox"
                    name="enabled"
                    checked={alertPreferences.enabled}
                  />
                  Alertes activées
                </label>

                <div class="grid gap-3 md:grid-cols-3">
                  <label class="block text-xs font-medium text-text-subtle" for="alert-score">
                    Score minimum
                    <input
                      id="alert-score"
                      name="scoreThreshold"
                      type="number"
                      min="0"
                      max="100"
                      value={alertPreferences.scoreThreshold}
                      class="mt-1 h-9 w-full rounded-lg border border-border-light bg-surface-white px-2 text-sm text-text-primary outline-none focus:border-blueprint-blue/40"
                    />
                  </label>
                  <label class="block text-xs font-medium text-text-subtle" for="alert-tjm">
                    TJM minimum
                    <input
                      id="alert-tjm"
                      name="minDailyRate"
                      type="number"
                      min="0"
                      max="5000"
                      value={alertPreferences.minDailyRate}
                      class="mt-1 h-9 w-full rounded-lg border border-border-light bg-surface-white px-2 text-sm text-text-primary outline-none focus:border-blueprint-blue/40"
                    />
                  </label>
                  <label class="block text-xs font-medium text-text-subtle" for="alert-results">
                    Résultats max
                    <input
                      id="alert-results"
                      name="maxResults"
                      type="number"
                      min="1"
                      max="20"
                      value={alertPreferences.maxResults}
                      class="mt-1 h-9 w-full rounded-lg border border-border-light bg-surface-white px-2 text-sm text-text-primary outline-none focus:border-blueprint-blue/40"
                    />
                  </label>
                </div>

                <label class="block text-xs font-medium text-text-subtle" for="alert-stacks">
                  Stacks requises
                  <input
                    id="alert-stacks"
                    name="requiredStacks"
                    value={formatStacks(alertPreferences.requiredStacks)}
                    placeholder="Svelte, TypeScript"
                    class="mt-1 h-9 w-full rounded-lg border border-border-light bg-surface-white px-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-blueprint-blue/40"
                  />
                </label>

                <div
                  class="flex items-center justify-between gap-3 border-t border-border-light pt-3"
                >
                  <p class="text-xs leading-5 text-text-subtle">
                    Mis à jour {formatDateTime(alertPreferences.updatedAt)}
                  </p>
                  <button
                    type="submit"
                    class="inline-flex h-8 items-center rounded-lg border border-blueprint-blue/25 bg-blueprint-blue/8 px-3 text-xs font-semibold text-blueprint-blue hover:border-blueprint-blue/40 hover:bg-blueprint-blue/12 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!isConnected}
                  >
                    Enregistrer
                  </button>
                </div>
              </form>
            </div>

            <div class="mt-5 rounded-lg border border-border-light bg-page-canvas p-3">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-xs font-medium uppercase text-text-subtle">File de sync</p>
                  <p class="mt-1 text-sm text-text-subtle">
                    {connectedSyncStatuses.length} entités suivies par le dashboard connecté
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
                  <article
                    class="rounded-lg border border-dashed border-border-light bg-surface-white p-4"
                  >
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p class="text-sm font-semibold text-text-primary">
                          Aucune extension connectée
                        </p>
                        <p class="mt-2 max-w-xl text-xs leading-5 text-text-subtle">
                          Connectez MissionPulse à ce compte depuis les réglages de l'extension pour
                          suivre les uploads, téléchargements et arbitrages de conflit.
                        </p>
                      </div>
                      <Badge label="Local ou non connecté" variant="source" />
                    </div>
                    {#if setupRequired}
                      <p
                        class="mt-4 rounded-lg border border-border-light bg-page-canvas px-3 py-2 text-xs leading-5 text-text-subtle"
                      >
                        La checklist de setup reste l'action prioritaire avant d'ouvrir la file de
                        synchronisation.
                      </p>
                    {:else}
                      <div class="mt-4 flex flex-wrap gap-2">
                        <a
                          class="inline-flex h-8 items-center justify-center rounded-lg bg-blueprint-blue px-3 text-xs font-semibold text-white hover:bg-blueprint-blue/90"
                          href={chromeStoreUrl}
                        >
                          Installer l'extension
                        </a>
                        <a
                          class="inline-flex h-8 items-center justify-center rounded-lg border border-border-light bg-page-canvas px-3 text-xs font-semibold text-text-primary hover:bg-subtle-gray"
                          href={data.loginUrl || '/login'}
                        >
                          Connecter mon compte
                        </a>
                      </div>
                    {/if}
                    <p class="mt-3 text-xs leading-5 text-text-muted">
                      Les sessions plateforme restent côté navigateur; la file ne transporte que les
                      données métier normalisées.
                    </p>
                  </article>
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

                {#if form?.syncConflictError}
                  <p
                    class="mt-3 rounded-md border border-status-red/20 bg-status-red/10 px-3 py-2 text-xs text-status-red"
                  >
                    {form.syncConflictError}
                  </p>
                {/if}

                {#if form?.syncConflictSuccess}
                  <p
                    class="mt-3 rounded-md border border-accent-green/20 bg-accent-green/10 px-3 py-2 text-xs text-accent-green"
                  >
                    {form.syncConflictSuccess}
                  </p>
                {/if}

                <div class="mt-3 rounded-lg border border-border-light bg-surface-white px-3 py-3">
                  <p class="text-xs font-semibold text-text-primary">Guide de résolution guidée</p>
                  <div class="mt-3 grid gap-2 md:grid-cols-3">
                    {#each syncConflictResolutionSteps as step}
                      <div class="rounded-md bg-page-canvas px-2.5 py-2">
                        <p class="text-[11px] font-semibold text-text-primary">{step.title}</p>
                        <p class="mt-1 text-[11px] leading-4 text-text-subtle">{step.detail}</p>
                      </div>
                    {/each}
                  </div>
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

                      <form
                        method="POST"
                        action="?/resolveSyncConflict"
                        class="mt-3 flex flex-wrap gap-2"
                      >
                        <input type="hidden" name="conflictId" value={conflict.id} />
                        <button
                          type="submit"
                          name="resolutionAction"
                          value="keep_remote"
                          class="rounded-md bg-blueprint-blue px-3 py-2 text-xs font-medium text-white transition hover:bg-blueprint-blue/90"
                        >
                          Garder {syncConflictActorLabels[conflict.remoteUpdatedBy]}
                        </button>
                        {#if conflict.entity === 'applications'}
                          <button
                            type="submit"
                            name="resolutionAction"
                            value="apply_local"
                            class="rounded-md border border-blueprint-blue/25 bg-blueprint-blue/8 px-3 py-2 text-xs font-medium text-blueprint-blue transition hover:border-blueprint-blue/40"
                          >
                            Appliquer {syncConflictActorLabels[conflict.localUpdatedBy]}
                          </button>
                        {/if}
                        <button
                          type="submit"
                          name="resolutionAction"
                          value="dismissed"
                          class="rounded-md border border-border-light px-3 py-2 text-xs font-medium text-text-secondary transition hover:border-text-muted"
                        >
                          Ignorer
                        </button>
                      </form>
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
                    variant={getPlatformStatusBadgeVariant(platform.status)}
                  />
                </div>
                {#if platform.lastErrorMessage}
                  <p
                    class="mt-2 rounded-md border border-status-orange/20 bg-status-orange/8 px-2 py-1.5 text-xs leading-5 text-status-orange"
                  >
                    {platform.lastErrorCode ?? 'connector_health'}: {platform.lastErrorMessage}
                  </p>
                {/if}
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
              Exportez les données du dashboard connecté ou supprimez les snapshots liés à votre
              compte. Les sessions et credentials des plateformes ne sont jamais stockés.
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
          <div class="rounded-xl border border-status-red/20 bg-status-red/8 px-3 py-3">
            <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-status-red">
              Suppression irréversible
            </p>
            <p class="mt-1.5 text-xs leading-5 text-text-primary">
              Impact : missions synchronisées, candidatures, CV, préférences d'alertes, conflits et
              statuts de sync seront supprimés du dashboard connecté.
            </p>
            <p class="mt-1 text-xs leading-5 text-text-subtle">
              Après suppression : relier à nouveau l'extension, lancer un scan, puis reconstruire le
              CV et le suivi depuis les snapshots Chrome.
            </p>
            <a
              class="mt-2 inline-flex h-8 items-center rounded-lg border border-border-light bg-surface-white px-3 text-xs font-medium text-text-primary hover:bg-page-canvas aria-disabled:pointer-events-none aria-disabled:opacity-40"
              href={isConnected ? '/export.json' : data.loginUrl || '/login'}
              download={isConnected ? 'missionpulse-connected-data.json' : undefined}
              aria-disabled={!isConnected}
            >
              Exporter avant suppression
            </a>
          </div>

          <label class="mt-3 block text-xs font-medium text-text-subtle" for="privacy-confirmation">
            Tapez SUPPRIMER pour confirmer
          </label>
          <input
            id="privacy-confirmation"
            name="confirmation"
            placeholder="SUPPRIMER"
            class="mt-1 h-9 w-full rounded-lg border border-border-light bg-page-canvas px-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-status-red/40"
            autocomplete="off"
            bind:value={privacyConfirmation}
          />
          <button
            type="submit"
            class="mt-3 inline-flex h-8 items-center rounded-lg border border-status-red/25 bg-status-red/8 px-3 text-xs font-semibold text-status-red hover:border-status-red/40 hover:bg-status-red/12 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canDeleteConnectedData}
            aria-disabled={!canDeleteConnectedData}
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
            <p class="text-sm font-semibold text-text-primary">Prochaine action CV</p>
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
