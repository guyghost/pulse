import {
  APPLICATION_TRANSITIONS,
  type ApplicationEventCreator,
  type ApplicationStage,
} from '@pulse/domain';
import type { CanonicalCandidateProfileDraft } from '../profile-extractors/types';
import type { MissionDuplicateRelation } from '../scoring/dedup';
import type { ConnectorHealthSnapshot } from '../types/health';
import type { GeneratedAsset, GenerationType } from '../types/generation';
import type { Mission, MissionSource, RemoteType } from '../types/mission';
import type { SeniorityLevel, UserProfile } from '../types/profile';
import type { Grade } from '../types/score';
import type { MissionTracking, StatusTransition } from '../types/tracking';
import {
  normalizeConnectedAlertPreferences,
  type ConnectedAlertPreferences,
} from '../types/alert-preferences';

export type SyncEntity =
  | 'missions'
  | 'applications'
  | 'candidate_profile'
  | 'connector_health'
  | 'alert_preferences';

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
  revision: number;
  updated_by: 'extension';
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
  next_action_at: string | null;
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

export type TimestampFormatter = (timestamp: number) => string;

export type GeneratedApplicationAssetType = 'pitch' | 'cover_message' | 'cv_summary';

export interface GeneratedApplicationAssetUpsertRow {
  user_id: string;
  application_id: string;
  client_asset_id: string;
  type: GeneratedApplicationAssetType;
  content: string;
  model: string;
  revision: number;
  updated_by: 'extension';
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

export type ProfileExtractorHealthCode =
  | 'permission_required'
  | 'session_required'
  | 'profile_not_found'
  | 'dom_changed'
  | 'rate_limited_or_blocked'
  | 'sync_failed'
  | 'unknown';

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
  location: string | null;
  target_role: string | null;
  completeness: number;
  revision: number;
  updated_by: 'extension';
}

export interface ExistingCandidateProfileSnapshot {
  id: string;
  title: string;
  summary: string;
  location: string | null;
  target_role: string | null;
  revision: number;
  updated_at: string;
  updated_by: 'dashboard' | 'extension' | 'system';
}

export interface RemoteCandidateProfileSnapshot {
  id: string;
  title: string;
  summary: string;
  location: string | null;
  target_role: string | null;
  tjm_min: number | null;
  tjm_max: number | null;
  remote_preference: RemoteType | 'any' | null;
  seniority: SeniorityLevel | null;
  updated_at: string;
  skills: string[];
}

export type CandidateProfileSuggestionField = 'title' | 'summary' | 'location' | 'target_role';
export type ApplicationSyncConflictField = 'stage' | 'notes' | 'user_rating' | 'next_action_at';
export type SyncConflictField = ApplicationSyncConflictField | CandidateProfileSuggestionField;

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
  entity: 'applications' | 'candidate_profile';
  entity_id: string;
  field: SyncConflictField;
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
  mission_source: MissionSource | null;
  mission_external_id: string | null;
  stage: ApplicationStage;
  user_rating: number | null;
  notes: string;
  next_action_at: string | null;
  revision: number;
  updated_at: string;
}

export interface RemoteAlertPreferencesSnapshot {
  enabled: boolean;
  score_threshold: number;
  min_daily_rate: number;
  required_stacks: string[];
  max_results: number;
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

export function remoteAlertPreferencesToConnectedPreferences(
  snapshot: RemoteAlertPreferencesSnapshot
): ConnectedAlertPreferences {
  return normalizeConnectedAlertPreferences({
    enabled: snapshot.enabled,
    scoreThreshold: snapshot.score_threshold,
    minDailyRate: snapshot.min_daily_rate,
    requiredStacks: snapshot.required_stacks,
    maxResults: snapshot.max_results,
    updatedAt: snapshot.updated_at,
  });
}

function clampDailyRate(value: number | null | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return Math.max(0, Math.min(5000, Math.round(fallback)));
  }

  return Math.max(0, Math.min(5000, Math.round(value)));
}

function normalizeSkillList(skills: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const skill of skills) {
    const trimmed = skill.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(trimmed);
    if (normalized.length === 20) {
      break;
    }
  }

  return normalized;
}

export function remoteCandidateProfileToUserProfile(
  snapshot: RemoteCandidateProfileSnapshot,
  existingProfile: UserProfile | null
): UserProfile {
  const tjmMin = clampDailyRate(snapshot.tjm_min, existingProfile?.tjmMin ?? 0);
  const tjmMax = Math.max(
    tjmMin,
    clampDailyRate(snapshot.tjm_max, existingProfile?.tjmMax ?? 5000)
  );
  const firstName = existingProfile?.firstName.trim() || 'Freelance';
  const jobTitle =
    snapshot.target_role?.trim() ||
    snapshot.title.trim() ||
    existingProfile?.jobTitle.trim() ||
    'Freelance tech';
  const dashboardSkills = normalizeSkillList(snapshot.skills);

  return {
    firstName,
    stack: dashboardSkills.length > 0 ? dashboardSkills : [...(existingProfile?.stack ?? [])],
    tjmMin,
    tjmMax,
    location: snapshot.location?.trim() || existingProfile?.location || '',
    remote: snapshot.remote_preference ?? existingProfile?.remote ?? 'any',
    seniority: snapshot.seniority ?? existingProfile?.seniority ?? 'senior',
    jobTitle,
    searchKeywords: existingProfile ? [...existingProfile.searchKeywords] : [],
    scoringWeights: existingProfile?.scoringWeights
      ? { ...existingProfile.scoringWeights }
      : undefined,
  };
}

export function shouldClearLocalCandidateProfile(
  existingProfile: UserProfile | null,
  lastConnectedProfile: UserProfile | null
): boolean {
  if (!existingProfile || !lastConnectedProfile) {
    return false;
  }

  const weights = existingProfile.scoringWeights;
  const connectedWeights = lastConnectedProfile.scoringWeights;
  const sameWeights =
    weights === undefined && connectedWeights === undefined
      ? true
      : weights !== undefined &&
        connectedWeights !== undefined &&
        weights.stack === connectedWeights.stack &&
        weights.location === connectedWeights.location &&
        weights.tjm === connectedWeights.tjm &&
        weights.remote === connectedWeights.remote;

  return (
    existingProfile.firstName === lastConnectedProfile.firstName &&
    existingProfile.jobTitle === lastConnectedProfile.jobTitle &&
    existingProfile.location === lastConnectedProfile.location &&
    existingProfile.remote === lastConnectedProfile.remote &&
    existingProfile.seniority === lastConnectedProfile.seniority &&
    existingProfile.tjmMin === lastConnectedProfile.tjmMin &&
    existingProfile.tjmMax === lastConnectedProfile.tjmMax &&
    existingProfile.stack.length === lastConnectedProfile.stack.length &&
    existingProfile.stack.every((item, index) => item === lastConnectedProfile.stack[index]) &&
    existingProfile.searchKeywords.length === lastConnectedProfile.searchKeywords.length &&
    existingProfile.searchKeywords.every(
      (item, index) => item === lastConnectedProfile.searchKeywords[index]
    ) &&
    sameWeights
  );
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
    revision: 1,
    updated_by: 'extension',
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

function firstTransitionTo(
  tracking: MissionTracking,
  stage: ApplicationStage,
  formatTimestamp: TimestampFormatter
): string | null {
  const transition = tracking.history.find((item) => item.to === stage);
  return transition ? formatTimestamp(transition.timestamp) : null;
}

export function buildApplicationUpsertRow(
  tracking: MissionTracking,
  userId: string,
  remoteMissionId: string,
  revision: number,
  updatedBy: ApplicationEventCreator,
  formatTimestamp: TimestampFormatter
): ApplicationUpsertRow {
  return {
    user_id: userId,
    mission_id: remoteMissionId,
    stage: tracking.currentStatus,
    user_rating: tracking.userRating,
    notes: tracking.notes,
    next_action_at: tracking.nextActionAt ?? null,
    applied_at: firstTransitionTo(tracking, 'applied', formatTimestamp),
    archived_at: firstTransitionTo(tracking, 'archived', formatTimestamp),
    revision,
    updated_by: updatedBy,
  };
}

export function buildDetectedApplicationInsertRow(
  userId: string,
  remoteMissionId: string
): ApplicationUpsertRow {
  return {
    user_id: userId,
    mission_id: remoteMissionId,
    stage: 'detected',
    user_rating: null,
    notes: '',
    next_action_at: null,
    applied_at: null,
    archived_at: null,
    revision: 1,
    updated_by: 'extension',
  };
}

export function buildDetectedApplicationPipelineEventRow(
  mission: Mission,
  userId: string,
  applicationId: string,
  clientEventPrefix: string
): ApplicationPipelineEventRow {
  return {
    user_id: userId,
    application_id: applicationId,
    from_stage: null,
    to_stage: 'detected',
    note: null,
    metadata: { localMissionId: mission.id },
    occurred_at: mission.scrapedAt.toISOString(),
    created_by: 'extension',
    client_event_id: [
      clientEventPrefix,
      mission.id,
      String(mission.scrapedAt.getTime()),
      'none',
      'detected',
    ].join(':'),
  };
}

export function buildApplicationPipelineEventRows(
  tracking: MissionTracking,
  userId: string,
  applicationId: string,
  createdBy: ApplicationEventCreator,
  clientEventPrefix: string,
  formatTimestamp: TimestampFormatter
): ApplicationPipelineEventRow[] {
  return tracking.history.map((transition) => ({
    user_id: userId,
    application_id: applicationId,
    from_stage: transition.from,
    to_stage: transition.to,
    note: transition.note,
    metadata: { localMissionId: tracking.missionId },
    occurred_at: formatTimestamp(transition.timestamp),
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
    revision: 1,
    updated_by: 'extension',
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

function profileExtractorStatusFromCode(
  ok: boolean,
  code: ProfileExtractorHealthCode | null
): ConnectorHealthSyncStatus {
  if (ok) {
    return 'ready';
  }
  if (code === 'permission_required') {
    return 'needs_permission';
  }
  if (code === 'session_required') {
    return 'needs_session';
  }
  if (code === 'rate_limited_or_blocked') {
    return 'blocked';
  }
  return 'error';
}

export function normalizeProfileExtractorHealthCode(
  value: string | null | undefined
): ProfileExtractorHealthCode | null {
  if (
    value === 'permission_required' ||
    value === 'session_required' ||
    value === 'profile_not_found' ||
    value === 'dom_changed' ||
    value === 'rate_limited_or_blocked' ||
    value === 'sync_failed'
  ) {
    return value;
  }

  return value ? 'unknown' : null;
}

export function buildProfileExtractorHealthEventRow(input: {
  userId: string;
  deviceId: string;
  source: string;
  ok: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  occurredAt: Date;
}): ConnectorHealthEventRow {
  const code = normalizeProfileExtractorHealthCode(input.errorCode);

  return {
    user_id: input.userId,
    device_id: input.deviceId,
    source: input.source,
    status: profileExtractorStatusFromCode(input.ok, code),
    error_code: input.ok ? null : code,
    error_message: input.ok ? null : (input.errorMessage ?? null),
    details: {
      kind: 'profile_extractor',
      extractorId: input.source,
    },
    occurred_at: input.occurredAt.toISOString(),
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

function deriveCandidateProfileLocation(draft: CanonicalCandidateProfileDraft): string | null {
  const currentExperience = draft.experiences.find(
    (experience) => experience.isCurrent && experience.location?.trim()
  );
  const firstLocatedExperience =
    currentExperience ?? draft.experiences.find((experience) => experience.location?.trim());

  return firstLocatedExperience?.location?.trim() || null;
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
      location: deriveCandidateProfileLocation(input.draft),
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

export function buildCandidateProfileImportErrorRow(input: {
  draft: CanonicalCandidateProfileDraft;
  userId: string;
  importedAt: Date;
  extractorVersion: string;
  errorCode: string;
  errorMessage: string;
  rawHash?: string | null;
}): ProfileImportInsertRow {
  return {
    user_id: input.userId,
    source: input.draft.source,
    status: 'error',
    imported_at: input.importedAt.toISOString(),
    extractor_version: input.extractorVersion,
    error_code: input.errorCode,
    error_message: input.errorMessage,
    raw_hash: input.rawHash ?? null,
    field_counts: {
      experiences: input.draft.experiences.length,
      education: input.draft.education.length,
      skills: input.draft.skills.length,
      links: input.draft.links.length,
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
    location: deriveCandidateProfileLocation(input.draft),
    target_role: input.draft.title || null,
  };
  const currentValues: Record<CandidateProfileSuggestionField, string | null> = {
    title: profile.title,
    summary: profile.summary,
    location: profile.location,
    target_role: profile.target_role,
  };
  const fields: CandidateProfileSuggestionField[] = ['title', 'summary', 'location', 'target_role'];

  return fields.flatMap((field) => {
    if (field === 'location' && suggestedValues[field] === null) {
      return [];
    }

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

export function filterNewCandidateProfileFieldSuggestionRows(
  rows: CandidateProfileFieldSuggestionRow[],
  pendingFields: readonly CandidateProfileSuggestionField[]
): CandidateProfileFieldSuggestionRow[] {
  if (rows.length === 0 || pendingFields.length === 0) {
    return rows;
  }

  const pending = new Set<CandidateProfileSuggestionField>(pendingFields);
  return rows.filter((row) => !pending.has(row.field));
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

export function filterNewSyncConflictRows(
  rows: SyncConflictInsertRow[],
  pendingFields: readonly SyncConflictField[]
): SyncConflictInsertRow[] {
  if (rows.length === 0 || pendingFields.length === 0) {
    return rows;
  }

  const pending = new Set<SyncConflictField>(pendingFields);
  return rows.filter((row) => !pending.has(row.field));
}

function conflictValue(value: ApplicationStage | number | string | null): string | null {
  return value === null ? null : String(value);
}

export function buildApplicationSyncConflictRows(input: {
  userId: string;
  deviceId: string;
  existing: MissionTracking | null;
  remote: RemoteApplicationSnapshot;
  detectedAt: string;
}): SyncConflictInsertRow[] {
  if (!input.existing) {
    return [];
  }

  const localRevision = Math.max(1, input.existing.history.length);
  if (localRevision < input.remote.revision) {
    return [];
  }

  const fields: Array<{
    field: ApplicationSyncConflictField;
    local: ApplicationStage | number | string | null;
    remote: ApplicationStage | number | string | null;
  }> = [
    { field: 'stage', local: input.existing.currentStatus, remote: input.remote.stage },
    { field: 'notes', local: input.existing.notes, remote: input.remote.notes },
    { field: 'user_rating', local: input.existing.userRating, remote: input.remote.user_rating },
    {
      field: 'next_action_at',
      local: input.existing.nextActionAt ?? null,
      remote: input.remote.next_action_at,
    },
  ];

  return fields.flatMap(({ field, local, remote }) => {
    const localValue = conflictValue(local);
    const remoteValue = conflictValue(remote);
    if (localValue === remoteValue) {
      return [];
    }

    return [
      {
        user_id: input.userId,
        device_id: input.deviceId,
        entity: 'applications',
        entity_id: input.remote.id,
        field,
        local_value: localValue,
        remote_value: remoteValue,
        local_updated_by: 'extension',
        remote_updated_by: 'dashboard',
        status: 'pending',
        detected_at: input.detectedAt,
      },
    ];
  });
}

const REMOTE_APPLICATION_IMPORT_PATHS = {
  detected: ['detected'],
  selected: ['detected', 'selected'],
  application_prepared: ['detected', 'selected', 'application_prepared'],
  applied: ['detected', 'selected', 'application_prepared', 'applied'],
  interview: ['detected', 'selected', 'application_prepared', 'applied', 'interview'],
  offer: ['detected', 'selected', 'application_prepared', 'applied', 'offer'],
  accepted: ['detected', 'selected', 'application_prepared', 'applied', 'offer', 'accepted'],
  rejected: ['detected', 'selected', 'application_prepared', 'applied', 'rejected'],
  archived: ['detected', 'archived'],
} as const satisfies Record<ApplicationStage, readonly ApplicationStage[]>;

function findApplicationStagePath(
  fromStage: ApplicationStage | null,
  toStage: ApplicationStage
): ApplicationStage[] {
  if (fromStage === toStage) {
    return [];
  }

  const importPath: readonly ApplicationStage[] = REMOTE_APPLICATION_IMPORT_PATHS[toStage];
  if (fromStage === null) {
    return [...importPath];
  }

  const fromIndex = importPath.indexOf(fromStage);
  if (fromIndex >= 0) {
    return [...importPath.slice(fromIndex + 1)];
  }

  const queue: Array<{ stage: ApplicationStage; path: ApplicationStage[] }> = [
    { stage: fromStage, path: [] },
  ];
  const visited = new Set<ApplicationStage>([fromStage]);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (!current) {
      continue;
    }

    for (const nextStage of APPLICATION_TRANSITIONS[current.stage]) {
      if (visited.has(nextStage)) {
        continue;
      }

      const nextPath = [...current.path, nextStage];
      if (nextStage === toStage) {
        return nextPath;
      }

      visited.add(nextStage);
      queue.push({ stage: nextStage, path: nextPath });
    }
  }

  return [];
}

function buildRemoteApplicationTransitions(input: {
  fromStage: ApplicationStage | null;
  toStage: ApplicationStage;
  pulledAt: number;
  note: string;
}): StatusTransition[] {
  const path = findApplicationStagePath(input.fromStage, input.toStage);
  const firstTimestamp = input.pulledAt - Math.max(0, path.length - 1);
  let previousStage = input.fromStage;

  return path.map((stage, index) => {
    const transition: StatusTransition = {
      from: previousStage,
      to: stage,
      timestamp: firstTimestamp + index,
      note: index === path.length - 1 ? input.note : null,
    };
    previousStage = stage;
    return transition;
  });
}

export function buildTrackingFromRemoteApplication(
  application: RemoteApplicationSnapshot,
  localMissionId: string,
  pulledAt: number
): MissionTracking {
  return {
    missionId: localMissionId,
    currentStatus: application.stage,
    history: buildRemoteApplicationTransitions({
      fromStage: null,
      toStage: application.stage,
      pulledAt,
      note: `Import dashboard revision ${application.revision}`,
    }),
    generatedAssetIds: [],
    userRating: application.user_rating,
    notes: application.notes,
    nextActionAt: application.next_action_at,
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
      ? existing.history.concat(
          buildRemoteApplicationTransitions({
            fromStage: existing.currentStatus,
            toStage: application.stage,
            pulledAt,
            note: `Sync dashboard revision ${application.revision}`,
          })
        )
      : existing.history,
    userRating: application.user_rating,
    notes: application.notes,
    nextActionAt: application.next_action_at,
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

  return latestRemoteUpdate ?? input.previousCursor;
}
