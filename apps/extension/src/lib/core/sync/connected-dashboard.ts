import type { ApplicationEventCreator, ApplicationStage } from '@pulse/domain';
import type { CanonicalCandidateProfileDraft } from '../profile-extractors/types';
import type { MissionDuplicateRelation } from '../scoring/dedup';
import type { ConnectorHealthSnapshot } from '../types/health';
import type { GeneratedAsset, GenerationType } from '../types/generation';
import type { Mission, MissionSource, RemoteType } from '../types/mission';
import type { Grade } from '../types/score';
import type { MissionTracking } from '../types/tracking';

export type SyncEntity = 'missions' | 'applications' | 'candidate_profile' | 'connector_health';

export type ConnectorHealthSyncStatus =
  | 'ready'
  | 'needs_permission'
  | 'needs_session'
  | 'blocked'
  | 'error'
  | 'syncing';

export interface MissionUpsertRow {
  user_id: string;
  source: MissionSource;
  external_id: string;
  canonical_key: string;
  title: string;
  client: string | null;
  description: string;
  stack: string[];
  tjm: number | null;
  location: string | null;
  remote: RemoteType | null;
  duration: string | null;
  start_date: string | null;
  published_at: string | null;
  scraped_at: string;
  url: string;
  raw_snapshot: Record<string, unknown>;
}

export interface MissionScoreUpsertRow {
  mission_id: string;
  deterministic_score: number;
  semantic_score: number | null;
  total_score: number;
  grade: Grade | null;
  criteria: Record<string, unknown>;
  semantic_reason: string | null;
  scorer_version: string;
  scored_at: string;
}

export interface MissionDuplicateUpsertRow {
  user_id: string;
  canonical_mission_id: string;
  duplicate_mission_id: string;
  confidence: number;
  reason: string;
}

export interface ApplicationUpsertRow {
  user_id: string;
  mission_id: string;
  stage: ApplicationStage;
  user_rating: number | null;
  notes: string;
  applied_at: string | null;
  archived_at: string | null;
  revision: number;
  updated_by: ApplicationEventCreator;
}

export interface ApplicationPipelineEventRow {
  user_id: string;
  application_id: string;
  from_stage: ApplicationStage | null;
  to_stage: ApplicationStage;
  note: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_by: ApplicationEventCreator;
  client_event_id: string;
}

export type GeneratedApplicationAssetType = 'pitch' | 'cover_message' | 'cv_summary';

export interface GeneratedApplicationAssetUpsertRow {
  user_id: string;
  application_id: string;
  client_asset_id: string;
  type: GeneratedApplicationAssetType;
  content: string;
  model: string;
  created_at: string;
}

export interface ConnectorHealthEventRow {
  user_id: string;
  device_id: string;
  source: string;
  status: ConnectorHealthSyncStatus;
  error_code: string | null;
  error_message: string | null;
  details: Record<string, unknown>;
  occurred_at: string;
}

export interface SyncStatusRow {
  user_id: string;
  device_id: string;
  entity: SyncEntity;
  last_pull_at: string | null;
  last_push_at: string | null;
  pending_upload_count: number;
  pending_download_count: number;
  last_error_code: string | null;
  last_error_message: string | null;
  retry_after_at: string | null;
}

export interface CandidateProfileUpsertRow {
  user_id: string;
  title: string;
  summary: string;
  target_role: string | null;
  completeness: number;
  revision: number;
  updated_by: 'extension';
}

export interface ExistingCandidateProfileSnapshot {
  id: string;
  title: string;
  summary: string;
  target_role: string | null;
  revision: number;
  updated_at: string;
  updated_by: 'dashboard' | 'extension' | 'system';
}

export type CandidateProfileSuggestionField = 'title' | 'summary' | 'target_role';

export interface CandidateProfileFieldSuggestionRow {
  user_id: string;
  profile_id: string;
  field: CandidateProfileSuggestionField;
  current_value: string | null;
  suggested_value: string | null;
  source: string;
  status: 'pending';
}

export interface SyncConflictInsertRow {
  user_id: string;
  device_id: string;
  entity: 'candidate_profile';
  entity_id: string;
  field: CandidateProfileSuggestionField;
  local_value: string | null;
  remote_value: string | null;
  local_updated_by: 'extension';
  remote_updated_by: 'dashboard';
  status: 'pending';
  detected_at: string;
}

export interface CandidateExperienceInsertRow {
  profile_id: string;
  title: string;
  company: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  description: string;
  skills: string[];
  source: string;
  source_external_id: string | null;
  position_index: number;
}

export interface CandidateEducationInsertRow {
  profile_id: string;
  school: string;
  degree: string | null;
  field: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string;
  source: string;
  position_index: number;
}

export interface CandidateSkillUpsertRow {
  profile_id: string;
  skill: string;
  source: string;
  confidence: number;
}

export interface CandidateLinkInsertRow {
  profile_id: string;
  label: string;
  url: string;
  source: string;
}

export interface ProfileImportInsertRow {
  user_id: string;
  source: string;
  status: 'success' | 'partial' | 'error';
  imported_at: string;
  extractor_version: string;
  error_code: string | null;
  error_message: string | null;
  raw_hash: string | null;
  field_counts: Record<string, number>;
}

export interface CandidateProfileImportRows {
  profile: CandidateProfileUpsertRow;
  experiences: CandidateExperienceInsertRow[];
  education: CandidateEducationInsertRow[];
  skills: CandidateSkillUpsertRow[];
  links: CandidateLinkInsertRow[];
  importEvent: ProfileImportInsertRow;
}

export interface RemoteApplicationSnapshot {
  id: string;
  mission_id: string;
  stage: ApplicationStage;
  user_rating: number | null;
  notes: string;
  revision: number;
  updated_at: string;
}

export interface BuildSyncStatusRowInput {
  userId: string;
  deviceId: string;
  entity: SyncEntity;
  lastPullAt?: Date | null;
  lastPushAt?: Date | null;
  pendingUploadCount?: number;
  pendingDownloadCount?: number;
  error?: { code: string; message: string } | null;
  retryAfterAt?: Date | null;
}

export interface BuildApplicationPullCursorInput {
  remoteApplications: RemoteApplicationSnapshot[];
  skippedCount: number;
  previousCursor: string | null;
  pulledAt: string;
}

const GENERATED_ASSET_TYPE_MAP: Record<GenerationType, GeneratedApplicationAssetType> = {
  pitch: 'pitch',
  'cover-message': 'cover_message',
  'cv-summary': 'cv_summary',
};

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeCanonicalPart(value: string | null): string {
  if (!value) {
    return '';
  }

  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function buildMissionCanonicalKey(mission: Mission): string {
  return [mission.title, mission.client, mission.location]
    .map(normalizeCanonicalPart)
    .filter(Boolean)
    .join(' ');
}

export function buildMissionUpsertRow(mission: Mission, userId: string): MissionUpsertRow {
  return {
    user_id: userId,
    source: mission.source,
    external_id: mission.id,
    canonical_key: buildMissionCanonicalKey(mission),
    title: mission.title,
    client: mission.client,
    description: mission.description,
    stack: [...mission.stack],
    tjm: mission.tjm,
    location: mission.location,
    remote: mission.remote,
    duration: mission.duration,
    start_date: mission.startDate,
    published_at: mission.publishedAt,
    scraped_at: mission.scrapedAt.toISOString(),
    url: mission.url,
    raw_snapshot: {
      seniority: mission.seniority,
      score: mission.scoreBreakdown?.total ?? mission.score,
      semanticScore: mission.scoreBreakdown?.semantic ?? mission.semanticScore,
      semanticReason: mission.scoreBreakdown?.semanticReason ?? mission.semanticReason,
    },
  };
}

export function buildMissionScoreUpsertRow(
  mission: Mission,
  remoteMissionId: string,
  scoredAt: Date,
  scorerVersion: string
): MissionScoreUpsertRow {
  const deterministicScore = mission.scoreBreakdown?.deterministic ?? mission.score ?? 0;
  const totalScore = mission.scoreBreakdown?.total ?? mission.score ?? deterministicScore;

  return {
    mission_id: remoteMissionId,
    deterministic_score: clampScore(deterministicScore),
    semantic_score:
      typeof (mission.scoreBreakdown?.semantic ?? mission.semanticScore) === 'number'
        ? clampScore(mission.scoreBreakdown?.semantic ?? mission.semanticScore ?? 0)
        : null,
    total_score: clampScore(totalScore),
    grade: mission.scoreBreakdown?.grade ?? null,
    criteria: mission.scoreBreakdown?.criteria ? { ...mission.scoreBreakdown.criteria } : {},
    semantic_reason: mission.scoreBreakdown?.semanticReason ?? mission.semanticReason,
    scorer_version: scorerVersion,
    scored_at: scoredAt.toISOString(),
  };
}

export function buildMissionDuplicateUpsertRows(
  relations: MissionDuplicateRelation[],
  userId: string,
  remoteMissionIds: Map<string, string>
): MissionDuplicateUpsertRow[] {
  return relations.flatMap((relation) => {
    const canonicalMissionId = remoteMissionIds.get(relation.canonicalMissionId);
    const duplicateMissionId = remoteMissionIds.get(relation.duplicateMissionId);
    if (!canonicalMissionId || !duplicateMissionId || canonicalMissionId === duplicateMissionId) {
      return [];
    }

    return [
      {
        user_id: userId,
        canonical_mission_id: canonicalMissionId,
        duplicate_mission_id: duplicateMissionId,
        confidence: Math.max(0, Math.min(1, relation.confidence)),
        reason: relation.reason,
      },
    ];
  });
}

function firstTransitionTo(tracking: MissionTracking, stage: ApplicationStage): string | null {
  const transition = tracking.history.find((item) => item.to === stage);
  return transition ? new Date(transition.timestamp).toISOString() : null;
}

export function buildApplicationUpsertRow(
  tracking: MissionTracking,
  userId: string,
  remoteMissionId: string,
  revision: number,
  updatedBy: ApplicationEventCreator
): ApplicationUpsertRow {
  return {
    user_id: userId,
    mission_id: remoteMissionId,
    stage: tracking.currentStatus,
    user_rating: tracking.userRating,
    notes: tracking.notes,
    applied_at: firstTransitionTo(tracking, 'applied'),
    archived_at: firstTransitionTo(tracking, 'archived'),
    revision,
    updated_by: updatedBy,
  };
}

export function buildApplicationPipelineEventRows(
  tracking: MissionTracking,
  userId: string,
  applicationId: string,
  createdBy: ApplicationEventCreator,
  clientEventPrefix: string
): ApplicationPipelineEventRow[] {
  return tracking.history.map((transition) => ({
    user_id: userId,
    application_id: applicationId,
    from_stage: transition.from,
    to_stage: transition.to,
    note: transition.note,
    metadata: { localMissionId: tracking.missionId },
    occurred_at: new Date(transition.timestamp).toISOString(),
    created_by: createdBy,
    client_event_id: [
      clientEventPrefix,
      tracking.missionId,
      String(transition.timestamp),
      transition.from ?? 'none',
      transition.to,
    ].join(':'),
  }));
}

export function buildGeneratedApplicationAssetUpsertRow(
  asset: GeneratedAsset,
  userId: string,
  applicationId: string,
  createdAt: string
): GeneratedApplicationAssetUpsertRow {
  return {
    user_id: userId,
    application_id: applicationId,
    client_asset_id: asset.id,
    type: GENERATED_ASSET_TYPE_MAP[asset.type],
    content: asset.content,
    model: asset.modelUsed,
    created_at: createdAt,
  };
}

function healthStatusFromSnapshot(snapshot: ConnectorHealthSnapshot): ConnectorHealthSyncStatus {
  if (snapshot.circuitState === 'open') {
    return 'blocked';
  }
  if (snapshot.circuitState === 'half-open') {
    return 'syncing';
  }
  if (snapshot.totalFailures > 0 && snapshot.lastSuccessAt === null) {
    return 'error';
  }
  return 'ready';
}

function healthErrorCode(snapshot: ConnectorHealthSnapshot): string | null {
  if (snapshot.circuitState === 'open') {
    return 'circuit_open';
  }
  if (snapshot.totalFailures > 0 && snapshot.lastSuccessAt === null) {
    return 'connector_error';
  }
  return null;
}

export function buildConnectorHealthEventRow(
  snapshot: ConnectorHealthSnapshot,
  userId: string,
  deviceId: string,
  occurredAt: Date,
  errorMessage: string | null = null
): ConnectorHealthEventRow {
  return {
    user_id: userId,
    device_id: deviceId,
    source: snapshot.connectorId,
    status: healthStatusFromSnapshot(snapshot),
    error_code: healthErrorCode(snapshot),
    error_message: errorMessage,
    details: {
      circuitState: snapshot.circuitState,
      consecutiveFailures: snapshot.consecutiveFailures,
      totalFailures: snapshot.totalFailures,
      totalSuccesses: snapshot.totalSuccesses,
      lastSuccessAt: snapshot.lastSuccessAt,
      lastFailureAt: snapshot.lastFailureAt,
      lastStateChangeAt: snapshot.lastStateChangeAt,
      recentLatenciesMs: [...snapshot.recentLatenciesMs],
    },
    occurred_at: occurredAt.toISOString(),
  };
}

export function buildSyncStatusRow(input: BuildSyncStatusRowInput): SyncStatusRow {
  return {
    user_id: input.userId,
    device_id: input.deviceId,
    entity: input.entity,
    last_pull_at: input.lastPullAt ? input.lastPullAt.toISOString() : null,
    last_push_at: input.lastPushAt ? input.lastPushAt.toISOString() : null,
    pending_upload_count: input.pendingUploadCount ?? 0,
    pending_download_count: input.pendingDownloadCount ?? 0,
    last_error_code: input.error?.code ?? null,
    last_error_message: input.error?.message ?? null,
    retry_after_at: input.error ? (input.retryAfterAt?.toISOString() ?? null) : null,
  };
}

export function buildCandidateProfileImportRows(input: {
  draft: CanonicalCandidateProfileDraft;
  userId: string;
  profileId: string;
  importedAt: Date;
  extractorVersion: string;
  revision: number;
  rawHash?: string | null;
}): CandidateProfileImportRows {
  const completeness = clampScore(input.draft.confidence * 100);

  return {
    profile: {
      user_id: input.userId,
      title: input.draft.title || 'Profil LinkedIn importé',
      summary: input.draft.summary,
      target_role: input.draft.title || null,
      completeness,
      revision: input.revision,
      updated_by: 'extension',
    },
    experiences: input.draft.experiences.map((experience) => ({
      profile_id: input.profileId,
      title: experience.title,
      company: experience.company,
      location: experience.location,
      start_date: experience.startDate,
      end_date: experience.endDate,
      is_current: experience.isCurrent,
      description: experience.description,
      skills: [...experience.skills],
      source: experience.source,
      source_external_id: experience.sourceExternalId,
      position_index: experience.positionIndex,
    })),
    education: input.draft.education.map((education) => ({
      profile_id: input.profileId,
      school: education.school,
      degree: education.degree,
      field: education.field,
      start_date: education.startDate,
      end_date: education.endDate,
      description: education.description,
      source: education.source,
      position_index: education.positionIndex,
    })),
    skills: input.draft.skills.map((skill) => ({
      profile_id: input.profileId,
      skill: skill.skill,
      source: skill.source,
      confidence: skill.confidence,
    })),
    links: input.draft.links.map((link) => ({
      profile_id: input.profileId,
      label: link.label,
      url: link.url,
      source: link.source,
    })),
    importEvent: {
      user_id: input.userId,
      source: input.draft.source,
      status: completeness >= 50 ? 'success' : 'partial',
      imported_at: input.importedAt.toISOString(),
      extractor_version: input.extractorVersion,
      error_code: null,
      error_message: null,
      raw_hash: input.rawHash ?? null,
      field_counts: {
        experiences: input.draft.experiences.length,
        education: input.draft.education.length,
        skills: input.draft.skills.length,
        links: input.draft.links.length,
      },
    },
  };
}

export function buildCandidateProfileFieldSuggestionRows(input: {
  draft: CanonicalCandidateProfileDraft;
  userId: string;
  profile: ExistingCandidateProfileSnapshot | null;
}): CandidateProfileFieldSuggestionRow[] {
  if (!input.profile || input.profile.updated_by !== 'dashboard') {
    return [];
  }

  const profile = input.profile;
  const suggestedValues: Record<CandidateProfileSuggestionField, string | null> = {
    title: input.draft.title || 'Profil LinkedIn importé',
    summary: input.draft.summary,
    target_role: input.draft.title || null,
  };
  const currentValues: Record<CandidateProfileSuggestionField, string | null> = {
    title: profile.title,
    summary: profile.summary,
    target_role: profile.target_role,
  };
  const fields: CandidateProfileSuggestionField[] = ['title', 'summary', 'target_role'];

  return fields.flatMap((field) => {
    if (currentValues[field] === suggestedValues[field]) {
      return [];
    }

    return [
      {
        user_id: input.userId,
        profile_id: profile.id,
        field,
        current_value: currentValues[field],
        suggested_value: suggestedValues[field],
        source: input.draft.source,
        status: 'pending',
      },
    ];
  });
}

export function buildCandidateProfileSyncConflictRows(input: {
  suggestions: CandidateProfileFieldSuggestionRow[];
  deviceId: string;
  profileId: string;
  detectedAt: string;
}): SyncConflictInsertRow[] {
  return input.suggestions.map((suggestion) => ({
    user_id: suggestion.user_id,
    device_id: input.deviceId,
    entity: 'candidate_profile',
    entity_id: input.profileId,
    field: suggestion.field,
    local_value: suggestion.suggested_value,
    remote_value: suggestion.current_value,
    local_updated_by: 'extension',
    remote_updated_by: 'dashboard',
    status: 'pending',
    detected_at: input.detectedAt,
  }));
}

export function buildTrackingFromRemoteApplication(
  application: RemoteApplicationSnapshot,
  localMissionId: string,
  pulledAt: number
): MissionTracking {
  return {
    missionId: localMissionId,
    currentStatus: application.stage,
    history: [
      {
        from: null,
        to: application.stage,
        timestamp: pulledAt,
        note: `Import dashboard revision ${application.revision}`,
      },
    ],
    generatedAssetIds: [],
    userRating: application.user_rating,
    notes: application.notes,
  };
}

export function mergeRemoteApplicationTracking(
  existing: MissionTracking | null,
  application: RemoteApplicationSnapshot,
  localMissionId: string,
  pulledAt: number
): MissionTracking {
  if (!existing) {
    return buildTrackingFromRemoteApplication(application, localMissionId, pulledAt);
  }

  const statusChanged = existing.currentStatus !== application.stage;

  return {
    ...existing,
    currentStatus: application.stage,
    history: statusChanged
      ? [
          ...existing.history,
          {
            from: existing.currentStatus,
            to: application.stage,
            timestamp: pulledAt,
            note: `Sync dashboard revision ${application.revision}`,
          },
        ]
      : existing.history,
    userRating: application.user_rating,
    notes: application.notes,
  };
}

export function buildApplicationPullCursor(input: BuildApplicationPullCursorInput): string | null {
  if (input.skippedCount > 0) {
    return input.previousCursor;
  }

  const latestRemoteUpdate = input.remoteApplications
    .map((application) => application.updated_at)
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort((a, b) => b.localeCompare(a))[0];

  return latestRemoteUpdate ?? input.pulledAt;
}
