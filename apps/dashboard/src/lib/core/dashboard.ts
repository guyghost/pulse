import { APPLICATION_STAGES, APPLICATION_TRANSITIONS, type ApplicationStage } from '@pulse/domain';

export type { ApplicationStage };

export type ApplicationSource =
  | 'linkedin'
  | 'free-work'
  | 'lehibou'
  | 'hiway'
  | 'collective'
  | 'cherry-pick'
  | 'malt'
  | 'other';

export type DashboardSubscriptionStatus = 'free' | 'premium' | 'expired';

export type DashboardFeatureArea =
  | 'missions'
  | 'profile'
  | 'applications'
  | 'automation'
  | 'account';

export type DashboardFeatureRequirement = 'anonymous' | 'account' | 'credits' | 'premium';

export type DashboardFeatureId =
  | 'mission-feed'
  | 'platform-scan'
  | 'semantic-scoring'
  | 'mission-comparison'
  | 'favorites-and-hidden'
  | 'application-tracking'
  | 'generated-assets'
  | 'tjm-radar'
  | 'profile-settings'
  | 'cv-sync'
  | 'exports-and-backups'
  | 'connector-health'
  | 'account-billing';

export interface DashboardAccountEntitlements {
  isAuthenticated: boolean;
  subscriptionStatus: DashboardSubscriptionStatus;
  subscriptionPeriodEndMs: number | null;
  creditBalance: number;
}

export interface DashboardFeatureDefinition {
  id: DashboardFeatureId;
  label: string;
  description: string;
  area: DashboardFeatureArea;
  requirement: DashboardFeatureRequirement;
}

export interface DashboardFeatureAccess extends DashboardFeatureDefinition {
  enabled: boolean;
  lockedReason: string | null;
}

export interface MissionApplication {
  id: string;
  title: string;
  company: string;
  source: ApplicationSource;
  stage: ApplicationStage;
  score: number;
  dailyRate: number | null;
  location: string;
  appliedAt: string | null;
  nextActionAt: string | null;
}

export interface DashboardFavoriteMissionSnapshot {
  missionId: string;
  title: string;
  client: string | null;
  source: ApplicationSource;
  url: string;
  stack: string[];
  tjm: number | null;
  location: string | null;
  score: number | null;
  favoritedAt: string;
}

export interface CvSnapshot {
  id: string;
  title: string;
  updatedAt: string;
  completeness: number;
  targetRole: string;
  skills: string[];
}

export interface PlatformSyncStatus {
  id: ApplicationSource;
  name: string;
  status: 'ready' | 'needs-extension' | 'needs-session' | 'syncing';
  lastSyncAt: string | null;
}

export interface DashboardCanonicalApplicationRow {
  id: string;
  mission_id: string;
  stage: string;
  applied_at: string | null;
  next_action_at: string | null;
}

export interface DashboardCanonicalMissionRow {
  id: string;
  title: string;
  client: string | null;
  source: string;
  tjm: number | null;
  location: string | null;
}

export interface DashboardCanonicalMissionScoreRow {
  mission_id: string;
  total_score: number;
}

export interface DashboardCandidateProfileRow {
  id: string;
  title: string;
  updated_at: string;
  completeness: number;
  target_role: string | null;
}

export interface DashboardCandidateSkillRow {
  skill: string;
}

export interface DashboardConnectorHealthEventRow {
  source: string;
  status: 'ready' | 'needs_permission' | 'needs_session' | 'blocked' | 'error' | 'syncing';
  occurred_at: string;
}

export interface ApplicationStageUpdatePatch {
  stage: ApplicationStage;
  applied_at?: string | null;
  archived_at?: string | null;
  updated_by: 'dashboard';
}

export interface ApplicationFilters {
  query: string;
  source: 'all' | ApplicationSource;
}

function isApplicationSource(value: unknown): value is ApplicationSource {
  return (
    value === 'linkedin' ||
    value === 'free-work' ||
    value === 'lehibou' ||
    value === 'hiway' ||
    value === 'collective' ||
    value === 'cherry-pick' ||
    value === 'malt' ||
    value === 'other'
  );
}

function isApplicationStage(value: unknown): value is ApplicationStage {
  return APPLICATION_STAGES.includes(value as ApplicationStage);
}

const SOURCE_LABELS: Record<ApplicationSource, string> = {
  linkedin: 'LinkedIn',
  'free-work': 'Free-Work',
  lehibou: 'LeHibou',
  hiway: 'Hiway',
  collective: 'Collective',
  'cherry-pick': 'Cherry Pick',
  malt: 'Malt',
  other: 'Autre',
};

export function parseDashboardFavoriteMission(
  raw: unknown
): DashboardFavoriteMissionSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const value = raw as Record<string, unknown>;
  const missionId = value.missionId;
  const title = value.title;
  const url = value.url;
  const source = value.source;
  const favoritedAt = value.favoritedAt;

  if (
    typeof missionId !== 'string' ||
    typeof title !== 'string' ||
    typeof url !== 'string' ||
    typeof favoritedAt !== 'string' ||
    !isApplicationSource(source)
  ) {
    return null;
  }

  return {
    missionId,
    title,
    client: typeof value.client === 'string' ? value.client : null,
    source,
    url,
    stack: Array.isArray(value.stack) ? value.stack.filter((item) => typeof item === 'string') : [],
    tjm: typeof value.tjm === 'number' ? value.tjm : null,
    location: typeof value.location === 'string' ? value.location : null,
    score: typeof value.score === 'number' ? value.score : null,
    favoritedAt,
  };
}

export function favoriteMissionToApplication(
  favorite: DashboardFavoriteMissionSnapshot
): MissionApplication {
  return {
    id: favorite.missionId,
    title: favorite.title,
    company: favorite.client ?? 'Client non renseigné',
    source: favorite.source,
    stage: 'selected',
    score: favorite.score ?? 0,
    dailyRate: favorite.tjm,
    location: favorite.location ?? 'Localisation non renseignée',
    appliedAt: null,
    nextActionAt: null,
  };
}

export function canonicalRowsToApplications(
  applicationRows: DashboardCanonicalApplicationRow[],
  missionsById: Map<string, DashboardCanonicalMissionRow>,
  scoresByMissionId: Map<string, DashboardCanonicalMissionScoreRow>
): MissionApplication[] {
  return applicationRows.flatMap((application) => {
    const mission = missionsById.get(application.mission_id);

    if (
      !mission ||
      !isApplicationSource(mission.source) ||
      !isApplicationStage(application.stage)
    ) {
      return [];
    }

    const score = scoresByMissionId.get(application.mission_id)?.total_score ?? 0;

    return [
      {
        id: application.id,
        title: mission.title,
        company: mission.client ?? 'Client non renseigné',
        source: mission.source,
        stage: application.stage,
        score,
        dailyRate: mission.tjm,
        location: mission.location ?? 'Localisation non renseignée',
        appliedAt: application.applied_at,
        nextActionAt: application.next_action_at,
      },
    ];
  });
}

export function profileRowsToCvSnapshot(
  profile: DashboardCandidateProfileRow,
  skills: DashboardCandidateSkillRow[]
): CvSnapshot {
  return {
    id: profile.id,
    title: profile.title,
    updatedAt: profile.updated_at,
    completeness: profile.completeness,
    targetRole: profile.target_role ?? 'Rôle cible non renseigné',
    skills: skills.map((item) => item.skill),
  };
}

function healthEventToPlatformStatus(
  status: DashboardConnectorHealthEventRow['status']
): PlatformSyncStatus['status'] {
  if (status === 'ready') {
    return 'ready';
  }
  if (status === 'syncing') {
    return 'syncing';
  }
  return 'needs-session';
}

export function healthEventsToPlatformSyncStatuses(
  events: DashboardConnectorHealthEventRow[]
): PlatformSyncStatus[] {
  const latestBySource = new Map<ApplicationSource, DashboardConnectorHealthEventRow>();

  for (const event of events) {
    if (!isApplicationSource(event.source)) {
      continue;
    }

    const current = latestBySource.get(event.source);
    if (!current || current.occurred_at < event.occurred_at) {
      latestBySource.set(event.source, event);
    }
  }

  return [...latestBySource.entries()].map(([source, event]) => ({
    id: source,
    name: SOURCE_LABELS[source],
    status: healthEventToPlatformStatus(event.status),
    lastSyncAt: event.occurred_at,
  }));
}

export function getNextApplicationStages(stage: ApplicationStage): ApplicationStage[] {
  return [...APPLICATION_TRANSITIONS[stage]];
}

export function buildApplicationStageUpdatePatch(
  stage: ApplicationStage,
  occurredAt: string
): ApplicationStageUpdatePatch {
  return {
    stage,
    applied_at: stage === 'applied' ? occurredAt : stage === 'detected' ? null : undefined,
    archived_at: stage === 'archived' ? occurredAt : null,
    updated_by: 'dashboard',
  };
}

export const DASHBOARD_FEATURES: readonly DashboardFeatureDefinition[] = [
  {
    id: 'mission-feed',
    label: 'Feed de missions',
    description: 'Recherche, tri, filtres et lecture centralisée des missions détectées.',
    area: 'missions',
    requirement: 'anonymous',
  },
  {
    id: 'platform-scan',
    label: 'Scan multi-plateformes',
    description: 'Pilotage des scans Free-Work, LeHibou, Hiway, Collective et Cherry Pick.',
    area: 'missions',
    requirement: 'anonymous',
  },
  {
    id: 'semantic-scoring',
    label: 'Scoring de pertinence',
    description: 'Score stack, TJM, localisation, séniorité et analyse sémantique disponible.',
    area: 'missions',
    requirement: 'anonymous',
  },
  {
    id: 'mission-comparison',
    label: 'Comparaison de missions',
    description: 'Shortlist et comparaison des opportunités prioritaires.',
    area: 'missions',
    requirement: 'anonymous',
  },
  {
    id: 'favorites-and-hidden',
    label: 'Favoris et missions masquées',
    description: 'Conservation des missions suivies, ignorées ou à traiter plus tard.',
    area: 'missions',
    requirement: 'anonymous',
  },
  {
    id: 'application-tracking',
    label: 'Suivi de candidatures',
    description: 'Pipeline brouillon, postulé, entretien, offre et relance.',
    area: 'applications',
    requirement: 'anonymous',
  },
  {
    id: 'generated-assets',
    label: 'Génération IA',
    description: 'Pitch, message recruteur et résumé CV consommant les crédits achetés.',
    area: 'applications',
    requirement: 'credits',
  },
  {
    id: 'tjm-radar',
    label: 'Radar TJM',
    description: 'Analyse des tendances de TJM à partir des missions consolidées.',
    area: 'missions',
    requirement: 'anonymous',
  },
  {
    id: 'profile-settings',
    label: 'Profil MissionPulse',
    description: 'Stack, TJM cible, localisation, séniorité et préférences de scan.',
    area: 'profile',
    requirement: 'anonymous',
  },
  {
    id: 'cv-sync',
    label: 'Synchronisation CV',
    description: 'Préparation du plan de mise à jour CV exécuté par l’extension.',
    area: 'automation',
    requirement: 'account',
  },
  {
    id: 'exports-and-backups',
    label: 'Exports et backups',
    description: 'Export des favoris et sauvegarde/restauration de l’espace local.',
    area: 'profile',
    requirement: 'account',
  },
  {
    id: 'connector-health',
    label: 'Santé des connecteurs',
    description: 'Statuts, erreurs typées et actions de reconnexion par source.',
    area: 'automation',
    requirement: 'anonymous',
  },
  {
    id: 'account-billing',
    label: 'Compte et achats',
    description: 'Session, statut premium, crédits et accès au portail de facturation.',
    area: 'account',
    requirement: 'account',
  },
];

export const countApplicationsByStage = (applications: MissionApplication[]) =>
  applications.reduce<Record<ApplicationStage, number>>(
    (counts, application) => ({
      ...counts,
      [application.stage]: counts[application.stage] + 1,
    }),
    Object.fromEntries(APPLICATION_STAGES.map((stage) => [stage, 0])) as Record<
      ApplicationStage,
      number
    >
  );

export const getAverageApplicationScore = (applications: MissionApplication[]) =>
  Math.round(
    applications.reduce((total, application) => total + application.score, 0) /
      Math.max(applications.length, 1)
  );

export const getNextFollowUp = (applications: MissionApplication[]) =>
  applications
    .filter((application) => application.nextActionAt)
    .sort((a, b) => (a.nextActionAt ?? '').localeCompare(b.nextActionAt ?? ''))[0] ?? null;

export const filterApplications = (
  applications: MissionApplication[],
  filters: ApplicationFilters,
  sourceLabels: Record<ApplicationSource, string>
) => {
  const normalizedQuery = filters.query.trim().toLowerCase();

  return applications.filter((application) => {
    const matchesSource = filters.source === 'all' || application.source === filters.source;

    if (!normalizedQuery) {
      return matchesSource;
    }

    return (
      matchesSource &&
      [
        application.title,
        application.company,
        application.location,
        sourceLabels[application.source],
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    );
  });
};

export const getCvSyncReadiness = (cv: CvSnapshot, statuses: PlatformSyncStatus[]) => {
  const readyPlatforms = statuses.filter((status) => status.status === 'ready').length;

  return {
    readyPlatforms,
    totalPlatforms: statuses.length,
    canSync: cv.completeness >= 80 && readyPlatforms > 0,
  };
};

export const getSyncBlockers = (cv: CvSnapshot, statuses: PlatformSyncStatus[]) => {
  const blockers: string[] = [];

  if (cv.completeness < 80) {
    blockers.push('Compléter le CV à 80% minimum');
  }

  statuses.forEach((status) => {
    if (status.status === 'needs-session') {
      blockers.push(`Reconnecter la session ${status.name}`);
    }

    if (status.status === 'needs-extension') {
      blockers.push(`Activer le connecteur ${status.name} dans l'extension`);
    }
  });

  return blockers;
};

export const isDashboardPremiumActive = (
  entitlements: DashboardAccountEntitlements,
  now: Date
): boolean => {
  if (!entitlements.isAuthenticated || entitlements.subscriptionStatus !== 'premium') {
    return false;
  }

  if (entitlements.subscriptionPeriodEndMs === null) {
    return true;
  }

  return entitlements.subscriptionPeriodEndMs > now.getTime();
};

export const getFeatureLockedReason = (
  requirement: DashboardFeatureRequirement,
  entitlements: DashboardAccountEntitlements,
  now: Date
): string | null => {
  if (requirement === 'anonymous') {
    return null;
  }

  if (!entitlements.isAuthenticated) {
    return 'Compte requis';
  }

  if (requirement === 'account') {
    return null;
  }

  if (requirement === 'credits') {
    return entitlements.creditBalance > 0 ? null : 'Crédits requis';
  }

  return isDashboardPremiumActive(entitlements, now) ? null : 'Premium requis';
};

export const getDashboardFeatureAccess = (
  entitlements: DashboardAccountEntitlements,
  now: Date,
  features: readonly DashboardFeatureDefinition[] = DASHBOARD_FEATURES
): DashboardFeatureAccess[] =>
  features.map((feature) => {
    const lockedReason = getFeatureLockedReason(feature.requirement, entitlements, now);

    return {
      ...feature,
      enabled: lockedReason === null,
      lockedReason,
    };
  });
