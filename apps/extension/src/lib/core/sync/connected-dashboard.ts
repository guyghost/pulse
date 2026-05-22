import type { ApplicationEventCreator, ApplicationStage } from '@pulse/domain';
import type { ConnectorHealthSnapshot } from '../types/health';
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
}

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
  };
}
