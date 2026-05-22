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
  sourceUrl: string | null;
  appliedAt: string | null;
  nextActionAt: string | null;
  notes: string;
  userRating: number | null;
}

export interface MissionComparisonItem {
  id: string;
  title: string;
  company: string;
  source: ApplicationSource;
  stage: ApplicationStage;
  score: number;
  dailyRate: number | null;
  location: string;
  sourceUrl: string | null;
  nextActionAt: string | null;
  userRating: number | null;
  scoreRank: number;
  dailyRateRank: number | null;
  followUpRank: number | null;
  strengths: string[];
  risks: string[];
}

export interface MissionComparisonSnapshot {
  items: MissionComparisonItem[];
  bestScoreId: string | null;
  bestRateId: string | null;
  earliestFollowUpId: string | null;
  averageScore: number;
  averageDailyRate: number | null;
}

export interface DashboardAlertPreferencesRow {
  enabled: boolean;
  score_threshold: number;
  min_daily_rate: number;
  required_stacks: string[];
  max_results: number;
  updated_at: string;
}

export interface DashboardAlertPreferences {
  enabled: boolean;
  scoreThreshold: number;
  minDailyRate: number;
  requiredStacks: string[];
  maxResults: number;
  updatedAt: string;
}

export interface DashboardAlertPreferencesPatch {
  enabled: boolean;
  score_threshold: number;
  min_daily_rate: number;
  required_stacks: string[];
  max_results: number;
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

export interface MissionScoreCriteria {
  stack: number | null;
  tjm: number | null;
  location: number | null;
  remote: number | null;
  seniorityBonus: number | null;
  startDateBonus: number | null;
}

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
  scoreCriteria: MissionScoreCriteria;
  semanticReason: string | null;
  dailyRate: number | null;
  location: string | null;
  scrapedAt: string;
  url: string;
  duplicateCount: number;
  applicationStage: ApplicationStage | null;
  freshness: MissionFreshness;
}

export type TjmTrend = 'up' | 'down' | 'stable' | 'unknown';

export interface TjmRadarSegment {
  label: string;
  averageDailyRate: number;
  minDailyRate: number;
  maxDailyRate: number;
  missionCount: number;
}

export interface TjmRadarSnapshot {
  missionCount: number;
  averageDailyRate: number | null;
  minDailyRate: number | null;
  maxDailyRate: number | null;
  trend: TjmTrend;
  trendDelta: number | null;
  topSource: string | null;
  topStack: string | null;
  sourceSegments: TjmRadarSegment[];
  stackSegments: TjmRadarSegment[];
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
  suggestions: CvFieldSuggestion[];
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

export type CvFieldSuggestionField = 'title' | 'summary' | 'target_role';

export interface CvFieldSuggestion {
  id: string;
  field: CvFieldSuggestionField;
  fieldLabel: string;
  currentValue: string | null;
  suggestedValue: string | null;
  source: ApplicationSource;
  status: 'pending' | 'applied' | 'dismissed';
  createdAt: string;
}

export interface PlatformSyncStatus {
  id: ApplicationSource;
  name: string;
  status: 'ready' | 'needs-extension' | 'needs-session' | 'syncing';
  lastSyncAt: string | null;
}

export type ConnectedSyncEntity =
  | 'missions'
  | 'applications'
  | 'candidate_profile'
  | 'connector_health'
  | 'alert_preferences';

export type ConnectedSyncState = 'healthy' | 'pending' | 'error' | 'idle';

export interface ConnectedSyncStatus {
  deviceId: string;
  deviceLabel: string;
  entity: ConnectedSyncEntity;
  label: string;
  state: ConnectedSyncState;
  lastPullAt: string | null;
  lastPushAt: string | null;
  pendingUploadCount: number;
  pendingDownloadCount: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  retryAfterAt: string | null;
  updatedAt: string;
}

export type DashboardSyncConflictEntity = 'applications' | 'candidate_profile';
export type DashboardSyncConflictStatus = 'pending' | 'resolved' | 'dismissed';
export type DashboardSyncConflictActor = 'dashboard' | 'extension' | 'system';

export interface DashboardSyncConflictRow {
  id: string;
  device_id: string | null;
  entity: string;
  entity_id: string;
  field: string;
  local_value: string | null;
  remote_value: string | null;
  local_updated_by: string;
  remote_updated_by: string;
  status: string;
  detected_at: string;
}

export interface DashboardSyncConflict {
  id: string;
  deviceId: string | null;
  deviceLabel: string;
  entity: DashboardSyncConflictEntity;
  entityLabel: string;
  entityId: string;
  field: string;
  localValue: string | null;
  remoteValue: string | null;
  localUpdatedBy: DashboardSyncConflictActor;
  remoteUpdatedBy: DashboardSyncConflictActor;
  status: DashboardSyncConflictStatus;
  detectedAt: string;
}

export type ApplicationTimelineCreatedBy = 'dashboard' | 'extension' | 'system';

export interface ApplicationTimelineEvent {
  id: string;
  applicationId: string;
  fromStage: ApplicationStage | null;
  fromLabel: string | null;
  toStage: ApplicationStage;
  toLabel: string;
  note: string | null;
  occurredAt: string;
  createdBy: ApplicationTimelineCreatedBy;
  createdByLabel: string;
}

export interface DashboardCanonicalApplicationRow {
  id: string;
  mission_id: string;
  stage: string;
  notes: string;
  user_rating: number | null;
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
  url: string | null;
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
  criteria: unknown;
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

export interface DashboardCandidateProfileFieldSuggestionRow {
  id: string;
  field: string;
  current_value: string | null;
  suggested_value: string | null;
  source: string;
  status: string;
  created_at: string;
}

export interface DashboardConnectorHealthEventRow {
  source: string;
  status: 'ready' | 'needs_permission' | 'needs_session' | 'blocked' | 'error' | 'syncing';
  occurred_at: string;
}

export interface DashboardExtensionDeviceRow {
  id: string;
  install_id: string;
  browser: string | null;
  extension_version: string;
  last_seen_at: string | null;
}

export interface DashboardSyncStatusRow {
  device_id: string;
  entity: string;
  last_pull_at: string | null;
  last_push_at: string | null;
  pending_upload_count: number;
  pending_download_count: number;
  last_error_code: string | null;
  last_error_message: string | null;
  retry_after_at: string | null;
  updated_at: string;
}

export interface DashboardApplicationPipelineEventRow {
  id: string;
  application_id: string;
  from_stage: string | null;
  to_stage: string;
  note: string | null;
  occurred_at: string;
  created_by: string;
}

export interface ApplicationStageUpdatePatch {
  stage: ApplicationStage;
  applied_at?: string | null;
  archived_at?: string | null;
  updated_by: 'dashboard';
}

export interface ApplicationSelectionInsertPatch {
  stage: 'selected';
  notes: string;
  revision: 1;
  updated_by: 'dashboard';
}

export interface MissionArchiveInsertPatch {
  stage: 'archived';
  notes: string;
  revision: 1;
  updated_by: 'dashboard';
  archived_at: string;
}

export interface ApplicationDetailsUpdatePatch {
  notes: string;
  user_rating: number | null;
  next_action_at: string | null;
  updated_by: 'dashboard';
}

export interface CvProfileUpdatePatch {
  title: string;
  summary: string;
  target_role: string | null;
}

export interface ConnectedDataDeletionRequest {
  confirmed: true;
  confirmation: 'SUPPRIMER';
}

export interface EmptyCvSnapshotInput {
  updatedAt: string;
}

export type CvFieldSuggestionResolutionAction = 'apply' | 'dismiss';

export interface CvFieldSuggestionResolutionInput {
  field: string;
  suggestedValue: string | null;
  action: CvFieldSuggestionResolutionAction;
  resolvedAt: string;
}

export interface CvFieldSuggestionResolution {
  suggestion: {
    status: 'applied' | 'dismissed';
    resolved_at: string;
  };
  profile:
    | {
        title: string;
        updated_by: 'dashboard';
      }
    | {
        summary: string;
        updated_by: 'dashboard';
      }
    | {
        target_role: string | null;
        updated_by: 'dashboard';
      }
    | null;
}

export interface SyncConflictResolutionPatch {
  status: 'resolved' | 'dismissed';
  resolved_at: string;
}

export type SyncConflictResolutionAction = 'applied' | 'resolved' | 'dismissed';

export interface ApplicationFilters {
  query: string;
  source: 'all' | ApplicationSource;
}

export interface MissionFeedFilters {
  query: string;
  source: 'all' | ApplicationSource;
  minScore: number | null;
  freshness: 'all' | MissionFreshness;
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

function isConnectedSyncEntity(value: unknown): value is ConnectedSyncEntity {
  return (
    value === 'missions' ||
    value === 'applications' ||
    value === 'candidate_profile' ||
    value === 'connector_health' ||
    value === 'alert_preferences'
  );
}

function isDashboardSyncConflictEntity(value: unknown): value is DashboardSyncConflictEntity {
  return value === 'applications' || value === 'candidate_profile';
}

function isDashboardSyncConflictStatus(value: unknown): value is DashboardSyncConflictStatus {
  return value === 'pending' || value === 'resolved' || value === 'dismissed';
}

function isDashboardSyncConflictActor(value: unknown): value is DashboardSyncConflictActor {
  return value === 'dashboard' || value === 'extension' || value === 'system';
}

function isCvFieldSuggestionField(value: unknown): value is CvFieldSuggestionField {
  return value === 'title' || value === 'summary' || value === 'target_role';
}

function isCvFieldSuggestionStatus(value: unknown): value is CvFieldSuggestion['status'] {
  return value === 'pending' || value === 'applied' || value === 'dismissed';
}

function isApplicationTimelineCreatedBy(value: unknown): value is ApplicationTimelineCreatedBy {
  return value === 'dashboard' || value === 'extension' || value === 'system';
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

const CONNECTED_SYNC_ENTITY_LABELS: Record<ConnectedSyncEntity, string> = {
  missions: 'Missions',
  applications: 'Candidatures',
  candidate_profile: 'Profil CV',
  connector_health: 'Santé connecteurs',
  alert_preferences: 'Alertes missions',
};

const SYNC_CONFLICT_ENTITY_LABELS: Record<DashboardSyncConflictEntity, string> = {
  applications: 'Candidature',
  candidate_profile: 'Profil CV',
};

const APPLICATION_STAGE_LABELS: Record<ApplicationStage, string> = {
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

const APPLICATION_TIMELINE_CREATED_BY_LABELS: Record<ApplicationTimelineCreatedBy, string> = {
  dashboard: 'Dashboard',
  extension: 'Extension',
  system: 'Système',
};

const CV_FIELD_SUGGESTION_LABELS: Record<CvFieldSuggestionField, string> = {
  title: 'Titre',
  summary: 'Résumé',
  target_role: 'Rôle cible',
};

const EMPTY_TJM_RADAR: TjmRadarSnapshot = {
  missionCount: 0,
  averageDailyRate: null,
  minDailyRate: null,
  maxDailyRate: null,
  trend: 'unknown',
  trendDelta: null,
  topSource: null,
  topStack: null,
  sourceSegments: [],
  stackSegments: [],
};

export const DEFAULT_DASHBOARD_ALERT_PREFERENCES: DashboardAlertPreferences = {
  enabled: true,
  scoreThreshold: 70,
  minDailyRate: 0,
  requiredStacks: [],
  maxResults: 5,
  updatedAt: '',
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
    sourceUrl: favorite.url,
    appliedAt: null,
    nextActionAt: null,
    notes: '',
    userRating: null,
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
        sourceUrl: mission.url,
        appliedAt: application.applied_at,
        nextActionAt: application.next_action_at,
        notes: application.notes,
        userRating: application.user_rating,
      },
    ];
  });
}

export function mergeApplicationCompatibilityFallbacks(
  canonicalApplications: MissionApplication[],
  favoriteApplications: MissionApplication[]
): MissionApplication[] {
  const canonicalIds = new Set(canonicalApplications.map((application) => application.id));
  const canonicalUrls = new Set(
    canonicalApplications.flatMap((application) =>
      application.sourceUrl ? [application.sourceUrl] : []
    )
  );

  const compatibleFavorites = favoriteApplications.filter((application) => {
    if (canonicalIds.has(application.id)) {
      return false;
    }

    return !application.sourceUrl || !canonicalUrls.has(application.sourceUrl);
  });

  return [...canonicalApplications, ...compatibleFavorites];
}

export function missionRowsToFeedItems(
  missionRows: DashboardMissionFeedRow[],
  scoresByMissionId: Map<string, DashboardMissionFeedScoreRow>,
  applicationsByMissionId: Map<string, DashboardMissionFeedApplicationRow>,
  duplicateRows: DashboardMissionDuplicateRow[],
  now: Date
): MissionFeedItem[] {
  const duplicateCounts = countMissionDuplicates(duplicateRows);
  const duplicateMissionIds = new Set(duplicateRows.map((row) => row.duplicate_mission_id));
  const freshCutoff = now.getTime() - 48 * 60 * 60 * 1000;

  return missionRows
    .flatMap((mission) => {
      if (!isApplicationSource(mission.source) || duplicateMissionIds.has(mission.id)) {
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
          scoreCriteria: parseMissionScoreCriteria(score?.criteria ?? null),
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
  }

  return counts;
}

function parseScoreCriterion(criteria: unknown, key: keyof MissionScoreCriteria): number | null {
  if (!criteria || typeof criteria !== 'object') {
    return null;
  }

  const value = (criteria as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

function parseMissionScoreCriteria(criteria: unknown): MissionScoreCriteria {
  return {
    stack: parseScoreCriterion(criteria, 'stack'),
    tjm: parseScoreCriterion(criteria, 'tjm'),
    location: parseScoreCriterion(criteria, 'location'),
    remote: parseScoreCriterion(criteria, 'remote'),
    seniorityBonus: parseScoreCriterion(criteria, 'seniorityBonus'),
    startDateBonus: parseScoreCriterion(criteria, 'startDateBonus'),
  };
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

export function pipelineEventRowsToTimeline(
  rows: DashboardApplicationPipelineEventRow[]
): ApplicationTimelineEvent[] {
  return rows
    .flatMap((row) => {
      if (!isApplicationStage(row.to_stage) || !isApplicationTimelineCreatedBy(row.created_by)) {
        return [];
      }

      const fromStage = isApplicationStage(row.from_stage) ? row.from_stage : null;

      return [
        {
          id: row.id,
          applicationId: row.application_id,
          fromStage,
          fromLabel: fromStage ? APPLICATION_STAGE_LABELS[fromStage] : null,
          toStage: row.to_stage,
          toLabel: APPLICATION_STAGE_LABELS[row.to_stage],
          note: row.note,
          occurredAt: row.occurred_at,
          createdBy: row.created_by,
          createdByLabel: APPLICATION_TIMELINE_CREATED_BY_LABELS[row.created_by],
        },
      ];
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

function createGeneratedAssetPreview(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();

  if (normalized.length <= 180) {
    return normalized;
  }

  return `${normalized.slice(0, 177).trimEnd()}...`;
}

export function buildTjmRadarSnapshot(missions: MissionFeedItem[]): TjmRadarSnapshot {
  const ratedMissions = missions.filter(
    (mission): mission is MissionFeedItem & { dailyRate: number } =>
      typeof mission.dailyRate === 'number' && mission.dailyRate > 0
  );

  if (ratedMissions.length === 0) {
    return { ...EMPTY_TJM_RADAR, sourceSegments: [], stackSegments: [] };
  }

  const rates = ratedMissions.map((mission) => mission.dailyRate);
  const sourceSegments = buildTjmSegments(
    ratedMissions.map((mission) => ({
      label: SOURCE_LABELS[mission.source],
      dailyRate: mission.dailyRate,
    }))
  );
  const stackSegments = buildTjmSegments(
    ratedMissions.flatMap((mission) =>
      mission.stack
        .map((skill) => skill.trim())
        .filter(Boolean)
        .map((skill) => ({
          label: skill,
          dailyRate: mission.dailyRate,
        }))
    )
  );
  const trend = calculateTjmTrend(ratedMissions);

  return {
    missionCount: ratedMissions.length,
    averageDailyRate: averageRounded(rates),
    minDailyRate: Math.min(...rates),
    maxDailyRate: Math.max(...rates),
    trend: trend.trend,
    trendDelta: trend.delta,
    topSource: sourceSegments[0]?.label ?? null,
    topStack: stackSegments[0]?.label ?? null,
    sourceSegments,
    stackSegments,
  };
}

function buildTjmSegments(items: { label: string; dailyRate: number }[]): TjmRadarSegment[] {
  const groups = new Map<string, { label: string; rates: number[] }>();

  for (const item of items) {
    const key = item.label.toLowerCase();
    const group = groups.get(key) ?? { label: item.label, rates: [] };
    group.rates.push(item.dailyRate);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      label: group.label,
      averageDailyRate: averageRounded(group.rates),
      minDailyRate: Math.min(...group.rates),
      maxDailyRate: Math.max(...group.rates),
      missionCount: group.rates.length,
    }))
    .sort(
      (a, b) =>
        b.missionCount - a.missionCount ||
        b.averageDailyRate - a.averageDailyRate ||
        a.label.localeCompare(b.label)
    );
}

function calculateTjmTrend(missions: (MissionFeedItem & { dailyRate: number })[]): {
  trend: TjmTrend;
  delta: number | null;
} {
  const chronological = [...missions].sort((a, b) => a.scrapedAt.localeCompare(b.scrapedAt));

  if (chronological.length < 4) {
    return { trend: 'unknown', delta: null };
  }

  const midpoint = Math.floor(chronological.length / 2);
  const previousAverage = averageRounded(
    chronological.slice(0, midpoint).map((mission) => mission.dailyRate)
  );
  const recentAverage = averageRounded(
    chronological.slice(midpoint).map((mission) => mission.dailyRate)
  );
  const delta = recentAverage - previousAverage;

  if (Math.abs(delta) < 25) {
    return { trend: 'stable', delta };
  }

  return { trend: delta > 0 ? 'up' : 'down', delta };
}

function averageRounded(values: number[]): number {
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

export function profileRowsToCvSnapshot(
  profile: DashboardCandidateProfileRow,
  skills: DashboardCandidateSkillRow[],
  experiences: DashboardCandidateExperienceRow[] = [],
  education: DashboardCandidateEducationRow[] = [],
  links: DashboardCandidateLinkRow[] = [],
  imports: DashboardProfileImportRow[] = [],
  suggestions: DashboardCandidateProfileFieldSuggestionRow[] = []
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
    suggestions: suggestions.flatMap((item) => {
      if (
        !isApplicationSource(item.source) ||
        !isCvFieldSuggestionField(item.field) ||
        !isCvFieldSuggestionStatus(item.status)
      ) {
        return [];
      }

      return [
        {
          id: item.id,
          field: item.field,
          fieldLabel: CV_FIELD_SUGGESTION_LABELS[item.field],
          currentValue: item.current_value,
          suggestedValue: item.suggested_value,
          source: item.source,
          status: item.status,
          createdAt: item.created_at,
        },
      ];
    }),
  };
}

export function buildEmptyCvSnapshot(input: EmptyCvSnapshotInput): CvSnapshot {
  return {
    id: 'empty-cv',
    title: '',
    summary: '',
    updatedAt: input.updatedAt,
    completeness: 0,
    targetRole: '',
    skills: [],
    experiences: [],
    education: [],
    links: [],
    imports: [],
    suggestions: [],
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

export function syncRowsToConnectedSyncStatuses(
  rows: DashboardSyncStatusRow[],
  devicesById: Map<string, DashboardExtensionDeviceRow>
): ConnectedSyncStatus[] {
  return rows
    .flatMap((row) => {
      if (!isConnectedSyncEntity(row.entity)) {
        return [];
      }

      const device = devicesById.get(row.device_id) ?? null;

      return [
        {
          deviceId: row.device_id,
          deviceLabel: formatExtensionDeviceLabel(device, row.device_id),
          entity: row.entity,
          label: CONNECTED_SYNC_ENTITY_LABELS[row.entity],
          state: getConnectedSyncState(row),
          lastPullAt: row.last_pull_at,
          lastPushAt: row.last_push_at,
          pendingUploadCount: row.pending_upload_count,
          pendingDownloadCount: row.pending_download_count,
          lastErrorCode: row.last_error_code,
          lastErrorMessage: row.last_error_message,
          retryAfterAt: row.retry_after_at,
          updatedAt: row.updated_at,
        },
      ];
    })
    .sort(
      (a, b) =>
        getConnectedSyncStateRank(a.state) - getConnectedSyncStateRank(b.state) ||
        b.updatedAt.localeCompare(a.updatedAt) ||
        a.label.localeCompare(b.label)
    );
}

export function syncConflictRowsToDashboardConflicts(
  rows: DashboardSyncConflictRow[],
  devicesById: Map<string, DashboardExtensionDeviceRow>
): DashboardSyncConflict[] {
  return rows
    .flatMap((row) => {
      if (
        !isDashboardSyncConflictEntity(row.entity) ||
        !isDashboardSyncConflictStatus(row.status) ||
        !isDashboardSyncConflictActor(row.local_updated_by) ||
        !isDashboardSyncConflictActor(row.remote_updated_by)
      ) {
        return [];
      }

      const device = row.device_id ? (devicesById.get(row.device_id) ?? null) : null;

      return [
        {
          id: row.id,
          deviceId: row.device_id,
          deviceLabel: row.device_id
            ? formatExtensionDeviceLabel(device, row.device_id)
            : 'Dashboard',
          entity: row.entity,
          entityLabel: SYNC_CONFLICT_ENTITY_LABELS[row.entity],
          entityId: row.entity_id,
          field: row.field,
          localValue: row.local_value,
          remoteValue: row.remote_value,
          localUpdatedBy: row.local_updated_by,
          remoteUpdatedBy: row.remote_updated_by,
          status: row.status,
          detectedAt: row.detected_at,
        },
      ];
    })
    .sort(
      (a, b) =>
        getSyncConflictStatusRank(a.status) - getSyncConflictStatusRank(b.status) ||
        b.detectedAt.localeCompare(a.detectedAt) ||
        a.entityLabel.localeCompare(b.entityLabel) ||
        a.field.localeCompare(b.field)
    );
}

function formatExtensionDeviceLabel(
  device: DashboardExtensionDeviceRow | null,
  fallbackId: string
): string {
  if (!device) {
    return `Extension ${fallbackId.slice(0, 8)}`;
  }

  const browser = device.browser ?? 'Chrome';
  return `${browser} ${device.extension_version}`;
}

function getConnectedSyncState(row: DashboardSyncStatusRow): ConnectedSyncState {
  if (row.last_error_code || row.last_error_message) {
    return 'error';
  }

  if (row.pending_upload_count > 0 || row.pending_download_count > 0) {
    return 'pending';
  }

  if (row.last_pull_at || row.last_push_at) {
    return 'healthy';
  }

  return 'idle';
}

function getConnectedSyncStateRank(state: ConnectedSyncState): number {
  if (state === 'error') {
    return 0;
  }
  if (state === 'pending') {
    return 1;
  }
  if (state === 'idle') {
    return 2;
  }
  return 3;
}

function getSyncConflictStatusRank(status: DashboardSyncConflictStatus): number {
  if (status === 'pending') {
    return 0;
  }
  if (status === 'resolved') {
    return 1;
  }
  return 2;
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

export function buildMissionSelectionInsertPatch(): ApplicationSelectionInsertPatch {
  return {
    stage: 'selected',
    notes: '',
    revision: 1,
    updated_by: 'dashboard',
  };
}

export function buildMissionArchiveInsertPatch(archivedAt: string): MissionArchiveInsertPatch {
  return {
    stage: 'archived',
    notes: '',
    revision: 1,
    updated_by: 'dashboard',
    archived_at: archivedAt,
  };
}

export function buildApplicationDetailsUpdatePatch(
  notes: string,
  userRating: number | null,
  nextActionDate: string | null
): ApplicationDetailsUpdatePatch | null {
  if (userRating !== null && (!Number.isInteger(userRating) || userRating < 1 || userRating > 5)) {
    return null;
  }

  if (nextActionDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(nextActionDate)) {
    return null;
  }

  return {
    notes: notes.trim(),
    user_rating: userRating,
    next_action_at: nextActionDate ? `${nextActionDate}T12:00:00.000Z` : null,
    updated_by: 'dashboard',
  };
}

export function buildCvProfileUpdatePatch(
  title: string,
  summary: string,
  targetRole: string
): CvProfileUpdatePatch | null {
  const normalizedTitle = title.trim();
  const normalizedSummary = summary.trim();
  const normalizedTargetRole = targetRole.trim();

  if (
    normalizedTitle.length === 0 ||
    normalizedTitle.length > 120 ||
    normalizedSummary.length > 4000 ||
    normalizedTargetRole.length > 120
  ) {
    return null;
  }

  return {
    title: normalizedTitle,
    summary: normalizedSummary,
    target_role: normalizedTargetRole.length > 0 ? normalizedTargetRole : null,
  };
}

export function buildConnectedDataDeletionRequest(
  confirmation: string
): ConnectedDataDeletionRequest | null {
  if (confirmation !== 'SUPPRIMER') {
    return null;
  }

  return {
    confirmed: true,
    confirmation,
  };
}

export function buildCvFieldSuggestionResolution(
  input: CvFieldSuggestionResolutionInput
): CvFieldSuggestionResolution | null {
  if (!isCvFieldSuggestionField(input.field)) {
    return null;
  }

  if (input.action === 'dismiss') {
    return {
      suggestion: {
        status: 'dismissed',
        resolved_at: input.resolvedAt,
      },
      profile: null,
    };
  }

  if (input.action !== 'apply') {
    return null;
  }

  if (input.field === 'title') {
    if (!input.suggestedValue || input.suggestedValue.trim().length === 0) {
      return null;
    }

    return {
      suggestion: {
        status: 'applied',
        resolved_at: input.resolvedAt,
      },
      profile: {
        title: input.suggestedValue.trim(),
        updated_by: 'dashboard',
      },
    };
  }

  if (input.field === 'summary') {
    return {
      suggestion: {
        status: 'applied',
        resolved_at: input.resolvedAt,
      },
      profile: {
        summary: input.suggestedValue?.trim() ?? '',
        updated_by: 'dashboard',
      },
    };
  }

  return {
    suggestion: {
      status: 'applied',
      resolved_at: input.resolvedAt,
    },
    profile: {
      target_role: input.suggestedValue?.trim() || null,
      updated_by: 'dashboard',
    },
  };
}

export function buildSyncConflictResolutionPatch(
  action: SyncConflictResolutionAction,
  resolvedAt: string
): SyncConflictResolutionPatch {
  return {
    status: action === 'dismissed' ? 'dismissed' : 'resolved',
    resolved_at: resolvedAt,
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

const normalizeSearch = (value: string) => value.trim().toLowerCase();

export const filterApplications = (
  applications: MissionApplication[],
  filters: ApplicationFilters,
  sourceLabels: Record<ApplicationSource, string>
) => {
  const normalizedQuery = normalizeSearch(filters.query);

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

export const filterMissionFeedItems = (
  missions: MissionFeedItem[],
  filters: MissionFeedFilters,
  sourceLabels: Record<ApplicationSource, string>
) => {
  const normalizedQuery = normalizeSearch(filters.query);
  const minScore =
    typeof filters.minScore === 'number' && Number.isFinite(filters.minScore)
      ? Math.max(0, Math.min(100, filters.minScore))
      : null;

  return missions.filter((mission) => {
    const matchesSource = filters.source === 'all' || mission.source === filters.source;
    const matchesScore = minScore === null || mission.score >= minScore;
    const matchesFreshness = filters.freshness === 'all' || mission.freshness === filters.freshness;

    if (!matchesSource || !matchesScore || !matchesFreshness) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return [
      mission.title,
      mission.client ?? '',
      mission.location ?? '',
      sourceLabels[mission.source],
      ...mission.stack,
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalizedQuery);
  });
};

const COMPARISON_STAGES = new Set<ApplicationStage>([
  'selected',
  'application_prepared',
  'applied',
  'interview',
  'offer',
]);

const COMPARISON_STAGE_PRIORITY: Record<ApplicationStage, number> = {
  detected: 0,
  selected: 1,
  application_prepared: 2,
  applied: 3,
  interview: 4,
  offer: 5,
  accepted: 0,
  rejected: 0,
  archived: 0,
};

export function buildMissionComparisonSnapshot(
  applications: MissionApplication[],
  limit = 3
): MissionComparisonSnapshot {
  const candidates = applications
    .filter((application) => COMPARISON_STAGES.has(application.stage))
    .sort(compareApplicationsForShortlist)
    .slice(0, Math.max(0, limit));

  if (candidates.length === 0) {
    return {
      items: [],
      bestScoreId: null,
      bestRateId: null,
      earliestFollowUpId: null,
      averageScore: 0,
      averageDailyRate: null,
    };
  }

  const scoreRanks = rankBy(candidates, (application) => application.score, 'desc');
  const dailyRateRanks = rankByNullable(candidates, (application) => application.dailyRate, 'desc');
  const followUpRanks = rankByNullable(
    candidates,
    (application) => application.nextActionAt,
    'asc'
  );
  const averageDailyRate = averageNullable(candidates.map((application) => application.dailyRate));

  return {
    items: candidates.map((application) => ({
      id: application.id,
      title: application.title,
      company: application.company,
      source: application.source,
      stage: application.stage,
      score: application.score,
      dailyRate: application.dailyRate,
      location: application.location,
      sourceUrl: application.sourceUrl,
      nextActionAt: application.nextActionAt,
      userRating: application.userRating,
      scoreRank: scoreRanks.get(application.id) ?? 1,
      dailyRateRank: dailyRateRanks.get(application.id) ?? null,
      followUpRank: followUpRanks.get(application.id) ?? null,
      strengths: buildComparisonStrengths(application, averageDailyRate),
      risks: buildComparisonRisks(application),
    })),
    bestScoreId: scoreRanksToFirstId(scoreRanks),
    bestRateId: scoreRanksToFirstId(dailyRateRanks),
    earliestFollowUpId: scoreRanksToFirstId(followUpRanks),
    averageScore: getAverageApplicationScore(candidates),
    averageDailyRate,
  };
}

function compareApplicationsForShortlist(
  left: MissionApplication,
  right: MissionApplication
): number {
  return (
    COMPARISON_STAGE_PRIORITY[right.stage] - COMPARISON_STAGE_PRIORITY[left.stage] ||
    right.score - left.score ||
    (right.userRating ?? 0) - (left.userRating ?? 0) ||
    (right.dailyRate ?? 0) - (left.dailyRate ?? 0) ||
    (left.nextActionAt ?? '9999-12-31').localeCompare(right.nextActionAt ?? '9999-12-31') ||
    left.title.localeCompare(right.title)
  );
}

function rankBy<T extends { id: string }>(
  items: T[],
  selector: (item: T) => number,
  direction: 'asc' | 'desc'
): Map<string, number> {
  return new Map(
    [...items]
      .sort((left, right) => {
        const delta = selector(left) - selector(right);
        return direction === 'asc' ? delta : -delta;
      })
      .map((item, index) => [item.id, index + 1])
  );
}

function rankByNullable<T extends { id: string }, V extends number | string>(
  items: T[],
  selector: (item: T) => V | null,
  direction: 'asc' | 'desc'
): Map<string, number> {
  return new Map(
    items
      .flatMap((item) => {
        const value = selector(item);
        return value === null ? [] : [{ item, value }];
      })
      .sort((left, right) => {
        const delta =
          typeof left.value === 'number' && typeof right.value === 'number'
            ? left.value - right.value
            : String(left.value).localeCompare(String(right.value));
        return direction === 'asc' ? delta : -delta;
      })
      .map(({ item }, index) => [item.id, index + 1])
  );
}

function scoreRanksToFirstId(ranks: Map<string, number>): string | null {
  for (const [id, rank] of ranks.entries()) {
    if (rank === 1) {
      return id;
    }
  }

  return null;
}

function averageNullable(values: (number | null)[]): number | null {
  const numericValues = values.filter((value): value is number => value !== null);

  if (numericValues.length === 0) {
    return null;
  }

  return averageRounded(numericValues);
}

function buildComparisonStrengths(
  application: MissionApplication,
  averageDailyRate: number | null
): string[] {
  const strengths: string[] = [];

  if (application.score >= 85) {
    strengths.push('Score fort');
  }

  if (
    application.dailyRate !== null &&
    averageDailyRate !== null &&
    application.dailyRate >= averageDailyRate
  ) {
    strengths.push('TJM au-dessus de la shortlist');
  }

  if (application.userRating !== null && application.userRating >= 4) {
    strengths.push('Rating utilisateur élevé');
  }

  if (application.stage === 'interview' || application.stage === 'offer') {
    strengths.push('Pipeline avancé');
  }

  return strengths.length > 0 ? strengths : ['Opportunité à qualifier'];
}

function buildComparisonRisks(application: MissionApplication): string[] {
  const risks: string[] = [];

  if (application.score < 70) {
    risks.push('Score faible');
  }

  if (application.dailyRate === null) {
    risks.push('TJM absent');
  }

  if (
    application.nextActionAt === null &&
    (application.stage === 'applied' ||
      application.stage === 'interview' ||
      application.stage === 'offer')
  ) {
    risks.push('Relance non planifiée');
  }

  return risks;
}

export function dashboardAlertPreferencesRowToSnapshot(
  row: DashboardAlertPreferencesRow | null,
  fallbackUpdatedAt: string
): DashboardAlertPreferences {
  if (!row) {
    return {
      ...DEFAULT_DASHBOARD_ALERT_PREFERENCES,
      requiredStacks: [],
      updatedAt: fallbackUpdatedAt,
    };
  }

  return {
    enabled: row.enabled,
    scoreThreshold: row.score_threshold,
    minDailyRate: row.min_daily_rate,
    requiredStacks: normalizeRequiredStacks(row.required_stacks),
    maxResults: row.max_results,
    updatedAt: row.updated_at,
  };
}

export function buildDashboardAlertPreferencesPatch(input: {
  enabled: boolean;
  scoreThreshold: number;
  minDailyRate: number;
  requiredStacksText: string;
  maxResults: number;
}): DashboardAlertPreferencesPatch | null {
  if (
    !Number.isInteger(input.scoreThreshold) ||
    input.scoreThreshold < 0 ||
    input.scoreThreshold > 100 ||
    !Number.isInteger(input.minDailyRate) ||
    input.minDailyRate < 0 ||
    input.minDailyRate > 5000 ||
    !Number.isInteger(input.maxResults) ||
    input.maxResults < 1 ||
    input.maxResults > 20
  ) {
    return null;
  }

  return {
    enabled: input.enabled,
    score_threshold: input.scoreThreshold,
    min_daily_rate: input.minDailyRate,
    required_stacks: normalizeRequiredStacks(
      input.requiredStacksText
        .split(',')
        .map((stack) => stack.trim())
        .filter(Boolean)
    ),
    max_results: input.maxResults,
  };
}

function normalizeRequiredStacks(stacks: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const stack of stacks) {
    const clean = stack.trim();
    const key = clean.toLowerCase();

    if (!clean || seen.has(key)) {
      continue;
    }

    normalized.push(clean.slice(0, 40));
    seen.add(key);
  }

  return normalized.slice(0, 12);
}

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
