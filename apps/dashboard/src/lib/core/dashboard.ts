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

export type GeneratedApplicationAssetType = 'pitch' | 'cover_message' | 'cv_summary';

export interface GeneratedApplicationAsset {
  id: string;
  applicationId: string;
  applicationTitle: string;
  company: string;
  type: GeneratedApplicationAssetType;
  label: string;
  content: string;
  preview: string;
  model: string;
  createdAt: string;
}

export type MissionFreshness = 'fresh' | 'stale';

export interface MissionFeedItem {
  id: string;
  title: string;
  client: string | null;
  source: ApplicationSource;
  stack: string[];
  score: number;
  deterministicScore: number | null;
  semanticScore: number | null;
  grade: string | null;
  semanticReason: string | null;
  dailyRate: number | null;
  location: string | null;
  scrapedAt: string;
  url: string;
  duplicateCount: number;
  applicationStage: ApplicationStage | null;
  freshness: MissionFreshness;
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
  summary: string;
  updatedAt: string;
  completeness: number;
  targetRole: string;
  skills: string[];
  experiences: CvExperience[];
  education: CvEducation[];
  links: CvLink[];
  imports: CvImport[];
}

export interface CvExperience {
  title: string;
  company: string | null;
  location: string | null;
  dateRange: string;
  description: string;
  skills: string[];
  source: ApplicationSource;
}

export interface CvEducation {
  school: string;
  degree: string | null;
  field: string | null;
  dateRange: string;
  source: ApplicationSource;
}

export interface CvLink {
  label: string;
  url: string;
  source: ApplicationSource;
}

export interface CvImport {
  id: string;
  source: ApplicationSource;
  status: 'success' | 'partial' | 'error';
  importedAt: string;
  extractorVersion: string;
  errorCode: string | null;
  errorMessage: string | null;
  fieldCounts: Record<string, number>;
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

export interface DashboardGeneratedApplicationAssetRow {
  id: string;
  application_id: string;
  type: string;
  content: string;
  model: string;
  created_at: string;
}

export interface DashboardMissionFeedRow {
  id: string;
  title: string;
  client: string | null;
  source: string;
  stack: string[];
  tjm: number | null;
  location: string | null;
  scraped_at: string;
  url: string;
}

export interface DashboardMissionFeedScoreRow {
  mission_id: string;
  deterministic_score: number;
  semantic_score: number | null;
  total_score: number;
  grade: string | null;
  semantic_reason: string | null;
}

export interface DashboardMissionFeedApplicationRow {
  mission_id: string;
  stage: string;
}

export interface DashboardMissionDuplicateRow {
  canonical_mission_id: string;
  duplicate_mission_id: string;
}

export interface DashboardCandidateProfileRow {
  id: string;
  title: string;
  summary: string;
  updated_at: string;
  completeness: number;
  target_role: string | null;
}

export interface DashboardCandidateSkillRow {
  skill: string;
}

export interface DashboardCandidateExperienceRow {
  title: string;
  company: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  description: string;
  skills: string[];
  source: string;
  position_index: number;
}

export interface DashboardCandidateEducationRow {
  school: string;
  degree: string | null;
  field: string | null;
  start_date: string | null;
  end_date: string | null;
  source: string;
  position_index: number;
}

export interface DashboardCandidateLinkRow {
  label: string;
  url: string;
  source: string;
}

export interface DashboardProfileImportRow {
  id: string;
  source: string;
  status: string;
  imported_at: string;
  extractor_version: string;
  error_code: string | null;
  error_message: string | null;
  field_counts: unknown;
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

function isGeneratedApplicationAssetType(value: unknown): value is GeneratedApplicationAssetType {
  return value === 'pitch' || value === 'cover_message' || value === 'cv_summary';
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

const GENERATED_ASSET_LABELS: Record<GeneratedApplicationAssetType, string> = {
  pitch: 'Pitch',
  cover_message: 'Message recruteur',
  cv_summary: 'Résumé CV',
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

export function missionRowsToFeedItems(
  missionRows: DashboardMissionFeedRow[],
  scoresByMissionId: Map<string, DashboardMissionFeedScoreRow>,
  applicationsByMissionId: Map<string, DashboardMissionFeedApplicationRow>,
  duplicateRows: DashboardMissionDuplicateRow[],
  now: Date
): MissionFeedItem[] {
  const duplicateCounts = countMissionDuplicates(duplicateRows);
  const freshCutoff = now.getTime() - 48 * 60 * 60 * 1000;

  return missionRows
    .flatMap((mission) => {
      if (!isApplicationSource(mission.source)) {
        return [];
      }

      const score = scoresByMissionId.get(mission.id) ?? null;
      const applicationStage = applicationsByMissionId.get(mission.id)?.stage ?? null;
      const scrapedAtMs = Date.parse(mission.scraped_at);
      const freshness: MissionFreshness =
        Number.isFinite(scrapedAtMs) && scrapedAtMs >= freshCutoff ? 'fresh' : 'stale';

      return [
        {
          id: mission.id,
          title: mission.title,
          client: mission.client,
          source: mission.source,
          stack: [...mission.stack],
          score: score?.total_score ?? 0,
          deterministicScore: score?.deterministic_score ?? null,
          semanticScore: score?.semantic_score ?? null,
          grade: score?.grade ?? null,
          semanticReason: score?.semantic_reason ?? null,
          dailyRate: mission.tjm,
          location: mission.location,
          scrapedAt: mission.scraped_at,
          url: mission.url,
          duplicateCount: duplicateCounts.get(mission.id) ?? 0,
          applicationStage: isApplicationStage(applicationStage) ? applicationStage : null,
          freshness,
        },
      ];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        Date.parse(b.scrapedAt) - Date.parse(a.scrapedAt) ||
        a.title.localeCompare(b.title)
    );
}

function countMissionDuplicates(rows: DashboardMissionDuplicateRow[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const row of rows) {
    counts.set(row.canonical_mission_id, (counts.get(row.canonical_mission_id) ?? 0) + 1);
    counts.set(row.duplicate_mission_id, (counts.get(row.duplicate_mission_id) ?? 0) + 1);
  }

  return counts;
}

export function generatedAssetRowsToHistory(
  rows: DashboardGeneratedApplicationAssetRow[],
  applicationsById: Map<string, MissionApplication>
): GeneratedApplicationAsset[] {
  return rows
    .flatMap((row) => {
      const application = applicationsById.get(row.application_id);

      if (!application || !isGeneratedApplicationAssetType(row.type)) {
        return [];
      }

      return [
        {
          id: row.id,
          applicationId: row.application_id,
          applicationTitle: application.title,
          company: application.company,
          type: row.type,
          label: GENERATED_ASSET_LABELS[row.type],
          content: row.content,
          preview: createGeneratedAssetPreview(row.content),
          model: row.model,
          createdAt: row.created_at,
        },
      ];
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function createGeneratedAssetPreview(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();

  if (normalized.length <= 180) {
    return normalized;
  }

  return `${normalized.slice(0, 177).trimEnd()}...`;
}

export function profileRowsToCvSnapshot(
  profile: DashboardCandidateProfileRow,
  skills: DashboardCandidateSkillRow[],
  experiences: DashboardCandidateExperienceRow[] = [],
  education: DashboardCandidateEducationRow[] = [],
  links: DashboardCandidateLinkRow[] = [],
  imports: DashboardProfileImportRow[] = []
): CvSnapshot {
  return {
    id: profile.id,
    title: profile.title,
    summary: profile.summary,
    updatedAt: profile.updated_at,
    completeness: profile.completeness,
    targetRole: profile.target_role ?? 'Rôle cible non renseigné',
    skills: skills.map((item) => item.skill),
    experiences: experiences
      .filter((experience) => isApplicationSource(experience.source))
      .sort((a, b) => a.position_index - b.position_index)
      .map((experience) => ({
        title: experience.title,
        company: experience.company,
        location: experience.location,
        dateRange: formatProfileDateRange(
          experience.start_date,
          experience.end_date,
          experience.is_current
        ),
        description: experience.description,
        skills: [...experience.skills],
        source: experience.source as ApplicationSource,
      })),
    education: education
      .filter((item) => isApplicationSource(item.source))
      .sort((a, b) => a.position_index - b.position_index)
      .map((item) => ({
        school: item.school,
        degree: item.degree,
        field: item.field,
        dateRange: formatProfileDateRange(item.start_date, item.end_date, false),
        source: item.source as ApplicationSource,
      })),
    links: links
      .filter((link) => isApplicationSource(link.source))
      .map((link) => ({
        label: link.label,
        url: link.url,
        source: link.source as ApplicationSource,
      })),
    imports: imports.flatMap((item) => {
      if (!isApplicationSource(item.source) || !isCvImportStatus(item.status)) {
        return [];
      }

      return [
        {
          id: item.id,
          source: item.source,
          status: item.status,
          importedAt: item.imported_at,
          extractorVersion: item.extractor_version,
          errorCode: item.error_code,
          errorMessage: item.error_message,
          fieldCounts: parseFieldCounts(item.field_counts),
        },
      ];
    }),
  };
}

function isCvImportStatus(value: string): value is CvImport['status'] {
  return value === 'success' || value === 'partial' || value === 'error';
}

function parseFieldCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, count]) =>
      typeof count === 'number' ? [[key, count]] : []
    )
  );
}

function formatProfileDateRange(
  startDate: string | null,
  endDate: string | null,
  isCurrent: boolean
): string {
  const start = startDate?.slice(0, 7) ?? '';
  const end = isCurrent ? 'Présent' : (endDate?.slice(0, 7) ?? '');

  if (!start && !end) {
    return 'Dates non renseignées';
  }

  return [start, end].filter(Boolean).join(' - ');
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
