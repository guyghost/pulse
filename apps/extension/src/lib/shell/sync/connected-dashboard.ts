import type { User } from '@supabase/supabase-js';
import {
  buildApplicationPipelineEventRows,
  buildApplicationSyncConflictRows,
  buildApplicationPullCursor,
  buildApplicationUpsertRow,
  buildCandidateProfileFieldSuggestionRows,
  buildCandidateProfileImportRows,
  buildCandidateProfileSyncConflictRows,
  buildConnectorHealthEventRow,
  buildDetectedApplicationInsertRow,
  buildDetectedApplicationPipelineEventRow,
  buildGeneratedApplicationAssetUpsertRow,
  buildMissionDuplicateUpsertRows,
  buildMissionScoreUpsertRow,
  buildMissionUpsertRow,
  buildProfileExtractorHealthEventRow,
  buildSyncStatusRow,
  filterNewCandidateProfileFieldSuggestionRows,
  filterNewSyncConflictRows,
  mergeRemoteApplicationTracking,
  remoteCandidateProfileToUserProfile,
  remoteAlertPreferencesToConnectedPreferences,
  shouldClearLocalCandidateProfile,
  type ApplicationPipelineEventRow,
  type ApplicationUpsertRow,
  type CandidateEducationInsertRow,
  type CandidateExperienceInsertRow,
  type CandidateProfileFieldSuggestionRow,
  type CandidateProfileSuggestionField,
  type CandidateLinkInsertRow,
  type CandidateProfileUpsertRow,
  type CandidateSkillUpsertRow,
  type ConnectorHealthEventRow,
  type ExistingCandidateProfileSnapshot,
  type GeneratedApplicationAssetUpsertRow,
  type MissionDuplicateUpsertRow,
  type MissionScoreUpsertRow,
  type MissionUpsertRow,
  type ProfileImportInsertRow,
  type RemoteApplicationSnapshot,
  type RemoteAlertPreferencesSnapshot,
  type RemoteCandidateProfileSnapshot,
  type SyncEntity,
  type SyncStatusRow,
  type SyncConflictInsertRow,
  type SyncConflictField,
} from '../../core/sync/connected-dashboard';
import type { ConnectedAlertPreferences } from '../../core/types/alert-preferences';
import type { CanonicalCandidateProfileDraft } from '../../core/profile-extractors/types';
import type { MissionDuplicateRelation } from '../../core/scoring/dedup';
import type { GeneratedAsset } from '../../core/types/generation';
import type { ConnectorHealthSnapshot } from '../../core/types/health';
import type { Mission, MissionSource } from '../../core/types/mission';
import type { UserProfile } from '../../core/types/profile';
import type { MissionTracking } from '../../core/types/tracking';
import { isMissionSource } from '../../core/types/type-guards';
import { getSupabaseClient } from '../auth/supabase-client';
import { clearProfile, getMissionById, getProfile, saveProfile } from '../storage/db';
import {
  clearConnectedAlertPreferences,
  saveConnectedAlertPreferences,
} from '../storage/connected-alert-preferences';
import {
  clearConnectedCandidateProfileCache,
  getConnectedCandidateProfileCache,
  saveConnectedCandidateProfileCache,
} from '../storage/connected-profile-cache';
import { getGeneratedAsset } from '../storage/generated-assets';
import { getTracking, saveTrackings } from '../storage/tracking';

const INSTALL_ID_STORAGE_KEY = 'missionpulse.connectedSync.installId';
const APPLICATION_PULL_CURSOR_STORAGE_KEY =
  'missionpulse.connectedSync.cursor.applications.lastPullAt';
const DEFAULT_SCORER_VERSION = 'missionpulse-v1';
const LINKEDIN_PROFILE_EXTRACTOR_VERSION = 'linkedin-v1';
const SYNC_RETRY_DELAY_MS = 5 * 60 * 1000;

const CONNECTED_SYNC_ENTITY_LABELS: Record<SyncEntity, string> = {
  missions: 'Missions',
  applications: 'Candidatures',
  candidate_profile: 'Profil CV',
  connector_health: 'Santé connecteurs',
  alert_preferences: 'Alertes missions',
};

export interface RemoteMissionIdentity {
  id: string;
  source: MissionSource;
  external_id: string;
}

export interface RemoteApplicationIdentity {
  id: string;
  mission_id: string;
}

export interface ExtensionDeviceRow {
  user_id: string;
  install_id: string;
  browser: string | null;
  extension_version: string;
  last_seen_at: string;
}

export interface ConnectedDashboardSyncGateway {
  upsertExtensionDevice(row: ExtensionDeviceRow): Promise<{ id: string }>;
  upsertMissions(rows: MissionUpsertRow[]): Promise<RemoteMissionIdentity[]>;
  upsertMissionScores(rows: MissionScoreUpsertRow[]): Promise<void>;
  upsertMissionDuplicates(rows: MissionDuplicateUpsertRow[]): Promise<void>;
  insertDetectedApplications(rows: ApplicationUpsertRow[]): Promise<RemoteApplicationIdentity[]>;
  upsertApplications(rows: ApplicationUpsertRow[]): Promise<RemoteApplicationIdentity[]>;
  listApplicationsByMissionIds(input: {
    userId: string;
    missionIds: string[];
  }): Promise<RemoteApplicationSnapshot[]>;
  listApplicationsUpdatedSince(input: {
    userId: string;
    since: string | null;
  }): Promise<RemoteApplicationSnapshot[]>;
  upsertApplicationPipelineEvents(rows: ApplicationPipelineEventRow[]): Promise<void>;
  upsertGeneratedApplicationAssets(rows: GeneratedApplicationAssetUpsertRow[]): Promise<void>;
  insertConnectorHealthEvents(rows: ConnectorHealthEventRow[]): Promise<void>;
  getCandidateProfile(userId: string): Promise<ExistingCandidateProfileSnapshot | null>;
  getCandidateProfileForScoring(userId: string): Promise<RemoteCandidateProfileSnapshot | null>;
  listPendingCandidateProfileSuggestionFields(input: {
    userId: string;
    profileId: string;
    source: string;
  }): Promise<CandidateProfileSuggestionField[]>;
  upsertCandidateProfile(row: CandidateProfileUpsertRow): Promise<{ id: string; revision: number }>;
  replaceCandidateProfileChildren(input: {
    profileId: string;
    experiences: CandidateExperienceInsertRow[];
    education: CandidateEducationInsertRow[];
    skills: CandidateSkillUpsertRow[];
    links: CandidateLinkInsertRow[];
  }): Promise<void>;
  insertCandidateProfileFieldSuggestions(rows: CandidateProfileFieldSuggestionRow[]): Promise<void>;
  listPendingSyncConflictFields(input: {
    userId: string;
    deviceId: string;
    entity: SyncConflictInsertRow['entity'];
    entityId: string;
  }): Promise<SyncConflictField[]>;
  insertSyncConflicts(rows: SyncConflictInsertRow[]): Promise<void>;
  insertProfileImport(row: ProfileImportInsertRow): Promise<void>;
  upsertSyncStatus(row: SyncStatusRow): Promise<void>;
  getDashboardAlertPreferences(userId: string): Promise<ConnectedAlertPreferences | null>;
}

export interface ConnectedSyncError {
  code:
    | 'unauthenticated'
    | 'remote-error'
    | 'mission-not-found'
    | 'tracking-not-found'
    | 'profile-sync-failed';
  message: string;
  retryable: boolean;
}

export type ConnectedSyncResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ConnectedSyncError };

export interface RegisterExtensionDeviceInput {
  userId: string;
  installId: string;
  browser: string | null;
  extensionVersion: string;
  now: Date;
}

export interface PushMissionsInput {
  userId: string;
  deviceId: string;
  installId: string;
  missions: Mission[];
  sourceMissions?: Mission[];
  duplicateRelations?: MissionDuplicateRelation[];
  now: Date;
  scorerVersion: string;
}

export interface PushMissionsResult {
  pushedCount: number;
  remoteMissionIds: Map<string, string>;
}

export interface PushApplicationsInput {
  userId: string;
  deviceId: string;
  installId: string;
  trackings: MissionTracking[];
  remoteMissionIds: Map<string, string>;
  generatedAssetsByMissionId?: Map<string, GeneratedAsset[]>;
  now: Date;
}

export interface PushApplicationsResult {
  pushedCount: number;
  skippedCount: number;
}

export interface PullApplicationsInput {
  userId: string;
  deviceId: string;
  localMissionIdsByRemoteId: Map<string, string>;
  existingTrackings: Map<string, MissionTracking>;
  since: Date | null;
  now: Date;
}

export interface PullApplicationsResult {
  pulledCount: number;
  skippedCount: number;
  trackings: MissionTracking[];
  nextCursor: string | null;
}

export interface PullAlertPreferencesInput {
  userId: string;
  deviceId: string;
  now: Date;
}

export interface PullAlertPreferencesResult {
  pulled: boolean;
  preferences: ConnectedAlertPreferences | null;
}

export interface PullCandidateProfileInput {
  userId: string;
  deviceId: string;
  existingProfile: UserProfile | null;
  now: Date;
}

export interface PullCandidateProfileResult {
  pulled: boolean;
  profile: UserProfile | null;
}

export interface PushConnectorHealthInput {
  userId: string;
  deviceId: string;
  snapshots: ConnectorHealthSnapshot[];
  now: Date;
}

export interface PushConnectorHealthResult {
  pushedCount: number;
}

export interface PushCandidateProfileImportInput {
  userId: string;
  deviceId: string;
  draft: CanonicalCandidateProfileDraft;
  now: Date;
  extractorVersion: string;
  rawHash?: string | null;
}

export interface PushCandidateProfileImportResult {
  profileId: string;
  experiences: number;
  education: number;
  skills: number;
  links: number;
  suggestions: number;
}

export interface SyncProfileExtractorHealthInput {
  source: 'linkedin';
  ok: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  occurredAt?: Date;
}

export interface ConnectedDashboardSnapshotInput {
  missions: Mission[];
  sourceMissions?: Mission[];
  duplicateRelations?: MissionDuplicateRelation[];
  trackings: MissionTracking[];
  generatedAssetsByMissionId?: Map<string, GeneratedAsset[]>;
  healthSnapshots: ConnectorHealthSnapshot[];
}

export interface ConnectedDashboardSnapshotResult {
  missions: number;
  applications: number;
  skippedApplications: number;
  connectorHealth: number;
}

export interface ConnectedDashboardSyncStatus {
  authenticated: boolean;
  installId: string | null;
  lastGlobalSync: number | null;
  entities: ConnectedDashboardEntitySyncStatus[];
}

export type ConnectedDashboardSyncState = 'healthy' | 'pending' | 'error' | 'idle';

export interface ConnectedDashboardEntitySyncStatus {
  entity: SyncEntity;
  label: string;
  state: ConnectedDashboardSyncState;
  lastPullAt: string | null;
  lastPushAt: string | null;
  pendingUploadCount: number;
  pendingDownloadCount: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  retryAfterAt: string | null;
  updatedAt: string;
}

interface SupabaseAuthLike {
  getSession(): Promise<{
    data: { session: { user: Pick<User, 'id'> } | null };
    error?: { message: string } | null;
  }>;
}

interface SupabaseWriteBuilder {
  select(columns: string): Promise<{ data: unknown; error: { message: string } | null }>;
}

interface SupabaseReadBuilder {
  eq(column: string, value: unknown): SupabaseReadBuilder;
  gt(column: string, value: unknown): SupabaseReadBuilder;
  in(column: string, values: unknown[]): SupabaseReadBuilder;
  order(
    column: string,
    options?: Record<string, unknown>
  ): Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

interface SupabaseMutationFilterBuilder {
  eq(column: string, value: unknown): SupabaseMutationFilterBuilder;
  select(columns: string): Promise<{ data: unknown; error: { message: string } | null }>;
}

interface SupabaseTableLike {
  upsert(rows: unknown, options?: Record<string, unknown>): SupabaseWriteBuilder;
  insert(rows: unknown): SupabaseWriteBuilder;
  select(columns: string): SupabaseReadBuilder;
  delete(): SupabaseMutationFilterBuilder;
}

interface SupabaseLike {
  auth: SupabaseAuthLike;
  from(table: string): SupabaseTableLike;
}

function remoteError(error: unknown): ConnectedSyncError {
  return {
    code: 'remote-error',
    message: error instanceof Error ? error.message : String(error),
    retryable: true,
  };
}

function buildRetryAfterAt(now: Date): Date {
  return new Date(now.getTime() + SYNC_RETRY_DELAY_MS);
}

function formatEpochMs(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

async function markConnectedDashboardSynced(now: Date): Promise<void> {
  try {
    await chrome.storage.local.set({ lastGlobalSync: now.getTime() });
  } catch {
    // Non-critical: entity sync_status rows remain the authoritative remote state.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseRemoteMissionIdentities(data: unknown): RemoteMissionIdentity[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.flatMap((item) => {
    if (
      isRecord(item) &&
      typeof item.id === 'string' &&
      typeof item.source === 'string' &&
      typeof item.external_id === 'string'
    ) {
      return [
        {
          id: item.id,
          source: item.source as MissionSource,
          external_id: item.external_id,
        },
      ];
    }
    return [];
  });
}

function parseRemoteApplicationIdentities(data: unknown): RemoteApplicationIdentity[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.flatMap((item) => {
    if (isRecord(item) && typeof item.id === 'string' && typeof item.mission_id === 'string') {
      return [{ id: item.id, mission_id: item.mission_id }];
    }
    return [];
  });
}

function isApplicationStage(value: unknown): value is RemoteApplicationSnapshot['stage'] {
  return (
    value === 'detected' ||
    value === 'selected' ||
    value === 'application_prepared' ||
    value === 'applied' ||
    value === 'interview' ||
    value === 'offer' ||
    value === 'accepted' ||
    value === 'rejected' ||
    value === 'archived'
  );
}

function isSyncEntity(value: unknown): value is SyncEntity {
  return (
    value === 'missions' ||
    value === 'applications' ||
    value === 'candidate_profile' ||
    value === 'connector_health' ||
    value === 'alert_preferences'
  );
}

function parseRemoteAlertPreferences(data: unknown): ConnectedAlertPreferences | null {
  const value = Array.isArray(data) ? data[0] : data;

  if (
    isRecord(value) &&
    typeof value.enabled === 'boolean' &&
    typeof value.score_threshold === 'number' &&
    typeof value.min_daily_rate === 'number' &&
    Array.isArray(value.required_stacks) &&
    value.required_stacks.every((stack) => typeof stack === 'string') &&
    typeof value.max_results === 'number' &&
    typeof value.updated_at === 'string'
  ) {
    const snapshot: RemoteAlertPreferencesSnapshot = {
      enabled: value.enabled,
      score_threshold: value.score_threshold,
      min_daily_rate: value.min_daily_rate,
      required_stacks: value.required_stacks,
      max_results: value.max_results,
      updated_at: value.updated_at,
    };
    return remoteAlertPreferencesToConnectedPreferences(snapshot);
  }

  return null;
}

function parseRemoteApplicationSnapshots(data: unknown): RemoteApplicationSnapshot[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.flatMap((item) => {
    const mission = isRecord(item) ? parseRemoteApplicationMissionIdentity(item.missions) : null;
    if (
      isRecord(item) &&
      typeof item.id === 'string' &&
      typeof item.mission_id === 'string' &&
      isApplicationStage(item.stage) &&
      (typeof item.user_rating === 'number' || item.user_rating === null) &&
      typeof item.notes === 'string' &&
      (typeof item.next_action_at === 'string' || item.next_action_at === null) &&
      typeof item.revision === 'number' &&
      typeof item.updated_at === 'string'
    ) {
      return [
        {
          id: item.id,
          mission_id: item.mission_id,
          mission_source: mission?.source ?? null,
          mission_external_id: mission?.externalId ?? null,
          stage: item.stage,
          user_rating: item.user_rating,
          notes: item.notes,
          next_action_at: item.next_action_at,
          revision: item.revision,
          updated_at: item.updated_at,
        },
      ];
    }
    return [];
  });
}

function parseRemoteApplicationMissionIdentity(
  value: unknown
): { source: MissionSource; externalId: string } | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (
    isRecord(row) &&
    isMissionSource(row.source) &&
    typeof row.external_id === 'string' &&
    row.external_id.length > 0
  ) {
    return { source: row.source, externalId: row.external_id };
  }

  return null;
}

interface RemoteSyncStatusSnapshot {
  entity: SyncEntity;
  last_pull_at: string | null;
  last_push_at: string | null;
  pending_upload_count: number;
  pending_download_count: number;
  last_error_code: string | null;
  last_error_message: string | null;
  retry_after_at: string | null;
  updated_at: string;
}

function parseRemoteSyncStatusSnapshots(data: unknown): RemoteSyncStatusSnapshot[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.flatMap((item) => {
    if (
      isRecord(item) &&
      isSyncEntity(item.entity) &&
      (typeof item.last_pull_at === 'string' || item.last_pull_at === null) &&
      (typeof item.last_push_at === 'string' || item.last_push_at === null) &&
      typeof item.pending_upload_count === 'number' &&
      typeof item.pending_download_count === 'number' &&
      (typeof item.last_error_code === 'string' || item.last_error_code === null) &&
      (typeof item.last_error_message === 'string' || item.last_error_message === null) &&
      (typeof item.retry_after_at === 'string' || item.retry_after_at === null) &&
      typeof item.updated_at === 'string'
    ) {
      return [
        {
          entity: item.entity,
          last_pull_at: item.last_pull_at,
          last_push_at: item.last_push_at,
          pending_upload_count: item.pending_upload_count,
          pending_download_count: item.pending_download_count,
          last_error_code: item.last_error_code,
          last_error_message: item.last_error_message,
          retry_after_at: item.retry_after_at,
          updated_at: item.updated_at,
        },
      ];
    }

    return [];
  });
}

function parseDeviceId(data: unknown): string | null {
  const value = Array.isArray(data) ? data[0] : data;
  return isRecord(value) && typeof value.id === 'string' ? value.id : null;
}

function parseSingleId(data: unknown): { id: string } {
  if (
    Array.isArray(data) &&
    data.length > 0 &&
    isRecord(data[0]) &&
    typeof data[0].id === 'string'
  ) {
    return { id: data[0].id };
  }
  if (isRecord(data) && typeof data.id === 'string') {
    return { id: data.id };
  }
  throw new Error('Supabase response did not include an id');
}

function parseProfileIdentity(data: unknown): { id: string; revision: number } {
  const value = Array.isArray(data) ? data[0] : data;
  if (isRecord(value) && typeof value.id === 'string' && typeof value.revision === 'number') {
    return { id: value.id, revision: value.revision };
  }
  throw new Error('Supabase response did not include profile identity');
}

function isProfileUpdatedBy(
  value: unknown
): value is ExistingCandidateProfileSnapshot['updated_by'] {
  return value === 'dashboard' || value === 'extension' || value === 'system';
}

function isRemotePreference(
  value: unknown
): value is RemoteCandidateProfileSnapshot['remote_preference'] {
  return (
    value === 'full' ||
    value === 'hybrid' ||
    value === 'onsite' ||
    value === 'any' ||
    value === null
  );
}

function isSeniorityLevel(value: unknown): value is RemoteCandidateProfileSnapshot['seniority'] {
  return value === 'junior' || value === 'confirmed' || value === 'senior' || value === null;
}

function parseExistingCandidateProfile(data: unknown): ExistingCandidateProfileSnapshot | null {
  const value = Array.isArray(data) ? data[0] : data;

  if (value === null || value === undefined) {
    return null;
  }

  if (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.summary === 'string' &&
    (typeof value.target_role === 'string' || value.target_role === null) &&
    typeof value.revision === 'number' &&
    typeof value.updated_at === 'string' &&
    isProfileUpdatedBy(value.updated_by)
  ) {
    return {
      id: value.id,
      title: value.title,
      summary: value.summary,
      target_role: value.target_role,
      revision: value.revision,
      updated_at: value.updated_at,
      updated_by: value.updated_by,
    };
  }

  return null;
}

function parseRemoteCandidateProfileBase(
  data: unknown
): Omit<RemoteCandidateProfileSnapshot, 'skills'> | null {
  const value = Array.isArray(data) ? data[0] : data;

  if (value === null || value === undefined) {
    return null;
  }

  if (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.summary === 'string' &&
    (typeof value.location === 'string' || value.location === null) &&
    (typeof value.target_role === 'string' || value.target_role === null) &&
    (typeof value.tjm_min === 'number' || value.tjm_min === null) &&
    (typeof value.tjm_max === 'number' || value.tjm_max === null) &&
    isRemotePreference(value.remote_preference) &&
    isSeniorityLevel(value.seniority) &&
    typeof value.updated_at === 'string'
  ) {
    return {
      id: value.id,
      title: value.title,
      summary: value.summary,
      location: value.location,
      target_role: value.target_role,
      tjm_min: value.tjm_min,
      tjm_max: value.tjm_max,
      remote_preference: value.remote_preference,
      seniority: value.seniority,
      updated_at: value.updated_at,
    };
  }

  return null;
}

function parseCandidateSkillRows(data: unknown): string[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.flatMap((row) => (isRecord(row) && typeof row.skill === 'string' ? [row.skill] : []));
}

function isCandidateProfileSuggestionField(
  value: unknown
): value is CandidateProfileSuggestionField {
  return value === 'title' || value === 'summary' || value === 'target_role';
}

function parsePendingCandidateProfileSuggestionFields(
  data: unknown
): CandidateProfileSuggestionField[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.flatMap((row) =>
    isRecord(row) && isCandidateProfileSuggestionField(row.field) ? [row.field] : []
  );
}

function isSyncConflictField(value: unknown): value is SyncConflictField {
  return (
    value === 'stage' ||
    value === 'notes' ||
    value === 'user_rating' ||
    value === 'next_action_at' ||
    isCandidateProfileSuggestionField(value)
  );
}

function parsePendingSyncConflictFields(data: unknown): SyncConflictField[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.flatMap((row) =>
    isRecord(row) && isSyncConflictField(row.field) ? [row.field] : []
  );
}

async function selectOrThrow<T>(
  builder: SupabaseWriteBuilder,
  columns: string,
  parse: (data: unknown) => T
): Promise<T> {
  const { data, error } = await builder.select(columns);
  if (error) {
    throw new Error(error.message);
  }
  return parse(data);
}

export function createSupabaseConnectedDashboardGateway(
  supabase: SupabaseLike
): ConnectedDashboardSyncGateway {
  return {
    upsertExtensionDevice: async (row) =>
      selectOrThrow(
        supabase.from('extension_devices').upsert(row, { onConflict: 'user_id,install_id' }),
        'id',
        parseSingleId
      ),
    upsertMissions: async (rows) =>
      rows.length === 0
        ? []
        : selectOrThrow(
            supabase.from('missions').upsert(rows, { onConflict: 'user_id,source,external_id' }),
            'id,source,external_id',
            parseRemoteMissionIdentities
          ),
    upsertMissionScores: async (rows) => {
      if (rows.length === 0) {
        return;
      }
      await selectOrThrow(
        supabase.from('mission_scores').upsert(rows, { onConflict: 'mission_id' }),
        'mission_id',
        () => undefined
      );
    },
    upsertMissionDuplicates: async (rows) => {
      if (rows.length === 0) {
        return;
      }
      await selectOrThrow(
        supabase
          .from('mission_duplicates')
          .upsert(rows, { onConflict: 'canonical_mission_id,duplicate_mission_id' }),
        'canonical_mission_id,duplicate_mission_id',
        () => undefined
      );
    },
    insertDetectedApplications: async (rows) =>
      rows.length === 0
        ? []
        : selectOrThrow(
            supabase.from('applications').upsert(rows, {
              onConflict: 'user_id,mission_id',
              ignoreDuplicates: true,
            }),
            'id,mission_id',
            parseRemoteApplicationIdentities
          ),
    upsertApplications: async (rows) =>
      rows.length === 0
        ? []
        : selectOrThrow(
            supabase.from('applications').upsert(rows, { onConflict: 'user_id,mission_id' }),
            'id,mission_id',
            parseRemoteApplicationIdentities
          ),
    listApplicationsByMissionIds: async ({ userId, missionIds }) => {
      if (missionIds.length === 0) {
        return [];
      }
      const { data, error } = await supabase
        .from('applications')
        .select(
          'id,mission_id,stage,user_rating,notes,next_action_at,revision,updated_at,missions!inner(source,external_id)'
        )
        .eq('user_id', userId)
        .in('mission_id', missionIds)
        .order('updated_at', { ascending: true });
      if (error) {
        throw new Error(error.message);
      }
      return parseRemoteApplicationSnapshots(data);
    },
    listApplicationsUpdatedSince: async ({ userId, since }) => {
      let query = supabase
        .from('applications')
        .select(
          'id,mission_id,stage,user_rating,notes,next_action_at,revision,updated_at,missions!inner(source,external_id)'
        )
        .eq('user_id', userId);
      if (since) {
        query = query.gt('updated_at', since);
      }
      const { data, error } = await query.order('updated_at', { ascending: true });
      if (error) {
        throw new Error(error.message);
      }
      return parseRemoteApplicationSnapshots(data);
    },
    upsertApplicationPipelineEvents: async (rows) => {
      if (rows.length === 0) {
        return;
      }
      await selectOrThrow(
        supabase
          .from('application_pipeline_events')
          .upsert(rows, { onConflict: 'user_id,client_event_id', ignoreDuplicates: true }),
        'client_event_id',
        () => undefined
      );
    },
    upsertGeneratedApplicationAssets: async (rows) => {
      if (rows.length === 0) {
        return;
      }
      await selectOrThrow(
        supabase
          .from('generated_application_assets')
          .upsert(rows, { onConflict: 'user_id,client_asset_id' }),
        'id',
        () => undefined
      );
    },
    insertConnectorHealthEvents: async (rows) => {
      if (rows.length === 0) {
        return;
      }
      await selectOrThrow(
        supabase.from('connector_health_events').insert(rows),
        'id',
        () => undefined
      );
    },
    getCandidateProfile: async (userId) => {
      const query = supabase
        .from('candidate_profiles')
        .select('id,title,summary,target_role,revision,updated_at,updated_by')
        .eq('user_id', userId);
      const { data, error } = await query.order('updated_at', { ascending: false });
      if (error) {
        throw new Error(error.message);
      }
      return parseExistingCandidateProfile(data);
    },
    listPendingCandidateProfileSuggestionFields: async ({ userId, profileId, source }) => {
      const { data, error } = await supabase
        .from('candidate_profile_field_suggestions')
        .select('field')
        .eq('user_id', userId)
        .eq('profile_id', profileId)
        .eq('source', source)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      return parsePendingCandidateProfileSuggestionFields(data);
    },
    getCandidateProfileForScoring: async (userId) => {
      const profileQuery = supabase
        .from('candidate_profiles')
        .select(
          'id,title,summary,location,target_role,tjm_min,tjm_max,remote_preference,seniority,updated_at'
        )
        .eq('user_id', userId);
      const { data: profileData, error: profileError } = await profileQuery.order('updated_at', {
        ascending: false,
      });
      if (profileError) {
        throw new Error(profileError.message);
      }

      const profile = parseRemoteCandidateProfileBase(profileData);
      if (!profile) {
        return null;
      }

      const { data: skillData, error: skillError } = await supabase
        .from('candidate_skills')
        .select('skill')
        .eq('profile_id', profile.id)
        .order('skill', { ascending: true });
      if (skillError) {
        throw new Error(skillError.message);
      }

      return { ...profile, skills: parseCandidateSkillRows(skillData) };
    },
    upsertCandidateProfile: async (row) =>
      selectOrThrow(
        supabase.from('candidate_profiles').upsert(row, { onConflict: 'user_id' }),
        'id,revision',
        parseProfileIdentity
      ),
    replaceCandidateProfileChildren: async ({
      profileId,
      experiences,
      education,
      skills,
      links,
    }) => {
      await selectOrThrow(
        supabase.from('candidate_experiences').delete().eq('profile_id', profileId),
        'id',
        () => undefined
      );
      await selectOrThrow(
        supabase.from('candidate_education').delete().eq('profile_id', profileId),
        'id',
        () => undefined
      );
      await selectOrThrow(
        supabase.from('candidate_links').delete().eq('profile_id', profileId),
        'id',
        () => undefined
      );
      await selectOrThrow(
        supabase.from('candidate_skills').delete().eq('profile_id', profileId),
        'skill',
        () => undefined
      );

      if (experiences.length > 0) {
        await selectOrThrow(
          supabase.from('candidate_experiences').insert(experiences),
          'id',
          () => undefined
        );
      }
      if (education.length > 0) {
        await selectOrThrow(
          supabase.from('candidate_education').insert(education),
          'id',
          () => undefined
        );
      }
      if (skills.length > 0) {
        await selectOrThrow(
          supabase.from('candidate_skills').upsert(skills, { onConflict: 'profile_id,skill' }),
          'profile_id,skill',
          () => undefined
        );
      }
      if (links.length > 0) {
        await selectOrThrow(supabase.from('candidate_links').insert(links), 'id', () => undefined);
      }
    },
    insertCandidateProfileFieldSuggestions: async (rows) => {
      if (rows.length === 0) {
        return;
      }
      await selectOrThrow(
        supabase.from('candidate_profile_field_suggestions').insert(rows),
        'id',
        () => undefined
      );
    },
    listPendingSyncConflictFields: async ({ userId, deviceId, entity, entityId }) => {
      const { data, error } = await supabase
        .from('sync_conflicts')
        .select('field')
        .eq('user_id', userId)
        .eq('device_id', deviceId)
        .eq('entity', entity)
        .eq('entity_id', entityId)
        .eq('status', 'pending')
        .order('detected_at', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      return parsePendingSyncConflictFields(data);
    },
    insertSyncConflicts: async (rows) => {
      if (rows.length === 0) {
        return;
      }
      await selectOrThrow(supabase.from('sync_conflicts').insert(rows), 'id', () => undefined);
    },
    insertProfileImport: async (row) => {
      await selectOrThrow(supabase.from('profile_imports').insert(row), 'id', () => undefined);
    },
    upsertSyncStatus: async (row) => {
      await selectOrThrow(
        supabase.from('sync_status').upsert(row, { onConflict: 'device_id,entity' }),
        'device_id,entity',
        () => undefined
      );
    },
    getDashboardAlertPreferences: async (userId) => {
      const { data, error } = await supabase
        .from('dashboard_alert_preferences')
        .select('enabled,score_threshold,min_daily_rate,required_stacks,max_results,updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      return parseRemoteAlertPreferences(data);
    },
  };
}

export async function registerExtensionDevice(
  gateway: ConnectedDashboardSyncGateway,
  input: RegisterExtensionDeviceInput
): Promise<ConnectedSyncResult<{ id: string }>> {
  try {
    const device = await gateway.upsertExtensionDevice({
      user_id: input.userId,
      install_id: input.installId,
      browser: input.browser,
      extension_version: input.extensionVersion,
      last_seen_at: input.now.toISOString(),
    });
    return { ok: true, value: device };
  } catch (error) {
    return { ok: false, error: remoteError(error) };
  }
}

export async function pushMissionsToConnectedDashboard(
  gateway: ConnectedDashboardSyncGateway,
  input: PushMissionsInput
): Promise<ConnectedSyncResult<PushMissionsResult>> {
  try {
    const allSourceMissions = new Map<string, Mission>();
    for (const mission of [...input.missions, ...(input.sourceMissions ?? [])]) {
      allSourceMissions.set(mission.id, mission);
    }
    const missionRows = [...allSourceMissions.values()].map((mission) =>
      buildMissionUpsertRow(mission, input.userId)
    );
    const remoteMissions = await gateway.upsertMissions(missionRows);
    const remoteMissionIds = new Map<string, string>();

    for (const mission of remoteMissions) {
      remoteMissionIds.set(mission.external_id, mission.id);
    }

    const scoreRows = input.missions.flatMap((mission) => {
      const remoteMissionId = remoteMissionIds.get(mission.id);
      return remoteMissionId
        ? [buildMissionScoreUpsertRow(mission, remoteMissionId, input.now, input.scorerVersion)]
        : [];
    });
    await gateway.upsertMissionScores(scoreRows);
    await gateway.upsertMissionDuplicates(
      buildMissionDuplicateUpsertRows(
        input.duplicateRelations ?? [],
        input.userId,
        remoteMissionIds
      )
    );
    const detectedApplications = await gateway.insertDetectedApplications(
      input.missions.flatMap((mission) => {
        const remoteMissionId = remoteMissionIds.get(mission.id);
        return remoteMissionId
          ? [buildDetectedApplicationInsertRow(input.userId, remoteMissionId)]
          : [];
      })
    );
    const missionsByRemoteId = new Map(
      input.missions.flatMap((mission) => {
        const remoteMissionId = remoteMissionIds.get(mission.id);
        return remoteMissionId ? [[remoteMissionId, mission] as const] : [];
      })
    );
    await gateway.upsertApplicationPipelineEvents(
      detectedApplications.flatMap((application) => {
        const mission = missionsByRemoteId.get(application.mission_id);
        return mission
          ? [
              buildDetectedApplicationPipelineEventRow(
                mission,
                input.userId,
                application.id,
                input.installId
              ),
            ]
          : [];
      })
    );
    await gateway.upsertSyncStatus(
      buildSyncStatusRow({
        userId: input.userId,
        deviceId: input.deviceId,
        entity: 'applications',
        lastPushAt: input.now,
      })
    );
    await gateway.upsertSyncStatus(
      buildSyncStatusRow({
        userId: input.userId,
        deviceId: input.deviceId,
        entity: 'missions',
        lastPushAt: input.now,
      })
    );

    return { ok: true, value: { pushedCount: remoteMissionIds.size, remoteMissionIds } };
  } catch (error) {
    const syncError = remoteError(error);
    await gateway.upsertSyncStatus(
      buildSyncStatusRow({
        userId: input.userId,
        deviceId: input.deviceId,
        entity: 'missions',
        pendingUploadCount: input.sourceMissions?.length ?? input.missions.length,
        error: { code: syncError.code, message: syncError.message },
        retryAfterAt: buildRetryAfterAt(input.now),
      })
    );
    return { ok: false, error: syncError };
  }
}

export async function pushApplicationsToConnectedDashboard(
  gateway: ConnectedDashboardSyncGateway,
  input: PushApplicationsInput
): Promise<ConnectedSyncResult<PushApplicationsResult>> {
  try {
    const eligible = input.trackings.flatMap((tracking) => {
      const remoteMissionId = input.remoteMissionIds.get(tracking.missionId);
      return remoteMissionId
        ? [
            {
              tracking,
              row: buildApplicationUpsertRow(
                tracking,
                input.userId,
                remoteMissionId,
                Math.max(1, tracking.history.length),
                'extension',
                formatEpochMs
              ),
            },
          ]
        : [];
    });
    const skippedCount = input.trackings.length - eligible.length;

    if (eligible.length === 0) {
      await gateway.upsertSyncStatus(
        buildSyncStatusRow({
          userId: input.userId,
          deviceId: input.deviceId,
          entity: 'applications',
          lastPushAt: input.now,
          pendingUploadCount: skippedCount,
        })
      );
      return { ok: true, value: { pushedCount: 0, skippedCount } };
    }

    const existingRemoteApplications = await gateway.listApplicationsByMissionIds({
      userId: input.userId,
      missionIds: eligible.map((item) => item.row.mission_id),
    });
    const existingRemoteByMissionId = new Map(
      existingRemoteApplications.map((application) => [application.mission_id, application])
    );
    const writable = eligible.filter((item) => {
      const remote = existingRemoteByMissionId.get(item.row.mission_id);
      return !remote || remote.revision <= item.row.revision;
    });
    const staleCount = eligible.length - writable.length;

    if (writable.length === 0) {
      await gateway.upsertSyncStatus(
        buildSyncStatusRow({
          userId: input.userId,
          deviceId: input.deviceId,
          entity: 'applications',
          lastPushAt: input.now,
          pendingUploadCount: skippedCount + staleCount,
          pendingDownloadCount: staleCount,
        })
      );
      return { ok: true, value: { pushedCount: 0, skippedCount: skippedCount + staleCount } };
    }

    const remoteApplications = await gateway.upsertApplications(writable.map((item) => item.row));
    const applicationIdsByMission = new Map(
      remoteApplications.map((application) => [application.mission_id, application.id])
    );
    const eventRows = writable.flatMap((item) => {
      const applicationId = applicationIdsByMission.get(item.row.mission_id);
      return applicationId
        ? buildApplicationPipelineEventRows(
            item.tracking,
            input.userId,
            applicationId,
            'extension',
            input.installId,
            formatEpochMs
          )
        : [];
    });
    const assetRows = writable.flatMap((item) => {
      const applicationId = applicationIdsByMission.get(item.row.mission_id);
      const assets = input.generatedAssetsByMissionId?.get(item.tracking.missionId) ?? [];
      return applicationId
        ? assets.map((asset) =>
            buildGeneratedApplicationAssetUpsertRow(
              asset,
              input.userId,
              applicationId,
              new Date(asset.createdAt).toISOString()
            )
          )
        : [];
    });

    await gateway.upsertApplicationPipelineEvents(eventRows);
    await gateway.upsertGeneratedApplicationAssets(assetRows);
    await gateway.upsertSyncStatus(
      buildSyncStatusRow({
        userId: input.userId,
        deviceId: input.deviceId,
        entity: 'applications',
        lastPushAt: input.now,
        pendingUploadCount: skippedCount + staleCount,
        pendingDownloadCount: staleCount,
      })
    );

    return {
      ok: true,
      value: { pushedCount: remoteApplications.length, skippedCount: skippedCount + staleCount },
    };
  } catch (error) {
    const syncError = remoteError(error);
    await gateway.upsertSyncStatus(
      buildSyncStatusRow({
        userId: input.userId,
        deviceId: input.deviceId,
        entity: 'applications',
        pendingUploadCount: input.trackings.length,
        error: { code: syncError.code, message: syncError.message },
        retryAfterAt: buildRetryAfterAt(input.now),
      })
    );
    return { ok: false, error: syncError };
  }
}

export async function pullApplicationsFromConnectedDashboard(
  gateway: ConnectedDashboardSyncGateway,
  input: PullApplicationsInput
): Promise<ConnectedSyncResult<PullApplicationsResult>> {
  try {
    const remoteApplications = await gateway.listApplicationsUpdatedSince({
      userId: input.userId,
      since: input.since ? input.since.toISOString() : null,
    });
    const trackings: MissionTracking[] = [];
    const conflictRows: SyncConflictInsertRow[] = [];
    let skippedCount = 0;

    for (const application of remoteApplications) {
      const localMissionId =
        input.localMissionIdsByRemoteId.get(application.mission_id) ??
        application.mission_external_id;
      if (!localMissionId) {
        skippedCount++;
        continue;
      }

      const existingTracking = input.existingTrackings.get(localMissionId) ?? null;
      const candidateConflictRows = buildApplicationSyncConflictRows({
        userId: input.userId,
        deviceId: input.deviceId,
        existing: existingTracking,
        remote: application,
        detectedAt: input.now.toISOString(),
      });
      const pendingConflictFields =
        candidateConflictRows.length > 0
          ? await gateway.listPendingSyncConflictFields({
              userId: input.userId,
              deviceId: input.deviceId,
              entity: 'applications',
              entityId: application.id,
            })
          : [];
      conflictRows.push(...filterNewSyncConflictRows(candidateConflictRows, pendingConflictFields));

      trackings.push(
        mergeRemoteApplicationTracking(
          existingTracking,
          application,
          localMissionId,
          input.now.getTime()
        )
      );
    }

    const nextCursor = buildApplicationPullCursor({
      remoteApplications,
      skippedCount,
      previousCursor: input.since ? input.since.toISOString() : null,
      pulledAt: input.now.toISOString(),
    });

    await gateway.insertSyncConflicts(conflictRows);
    await gateway.upsertSyncStatus(
      buildSyncStatusRow({
        userId: input.userId,
        deviceId: input.deviceId,
        entity: 'applications',
        lastPullAt: input.now,
        pendingDownloadCount: skippedCount,
      })
    );

    return {
      ok: true,
      value: { pulledCount: trackings.length, skippedCount, trackings, nextCursor },
    };
  } catch (error) {
    const syncError = remoteError(error);
    await gateway.upsertSyncStatus(
      buildSyncStatusRow({
        userId: input.userId,
        deviceId: input.deviceId,
        entity: 'applications',
        error: { code: syncError.code, message: syncError.message },
        retryAfterAt: buildRetryAfterAt(input.now),
      })
    );
    return { ok: false, error: syncError };
  }
}

export async function pullAlertPreferencesFromConnectedDashboard(
  gateway: ConnectedDashboardSyncGateway,
  input: PullAlertPreferencesInput
): Promise<ConnectedSyncResult<PullAlertPreferencesResult>> {
  try {
    const preferences = await gateway.getDashboardAlertPreferences(input.userId);

    if (preferences) {
      await saveConnectedAlertPreferences(preferences);
    } else {
      await clearConnectedAlertPreferences();
    }

    await gateway.upsertSyncStatus(
      buildSyncStatusRow({
        userId: input.userId,
        deviceId: input.deviceId,
        entity: 'alert_preferences',
        lastPullAt: input.now,
      })
    );

    return { ok: true, value: { pulled: Boolean(preferences), preferences } };
  } catch (error) {
    const syncError = remoteError(error);
    await gateway.upsertSyncStatus(
      buildSyncStatusRow({
        userId: input.userId,
        deviceId: input.deviceId,
        entity: 'alert_preferences',
        error: { code: syncError.code, message: syncError.message },
        retryAfterAt: buildRetryAfterAt(input.now),
      })
    );
    return { ok: false, error: syncError };
  }
}

export async function pullCandidateProfileFromConnectedDashboard(
  gateway: ConnectedDashboardSyncGateway,
  input: PullCandidateProfileInput
): Promise<ConnectedSyncResult<PullCandidateProfileResult>> {
  try {
    const snapshot = await gateway.getCandidateProfileForScoring(input.userId);
    const profile = snapshot
      ? remoteCandidateProfileToUserProfile(snapshot, input.existingProfile)
      : null;

    await gateway.upsertSyncStatus(
      buildSyncStatusRow({
        userId: input.userId,
        deviceId: input.deviceId,
        entity: 'candidate_profile',
        lastPullAt: input.now,
      })
    );

    return { ok: true, value: { pulled: Boolean(profile), profile } };
  } catch (error) {
    const syncError = remoteError(error);
    await gateway.upsertSyncStatus(
      buildSyncStatusRow({
        userId: input.userId,
        deviceId: input.deviceId,
        entity: 'candidate_profile',
        error: { code: syncError.code, message: syncError.message },
        retryAfterAt: buildRetryAfterAt(input.now),
      })
    );
    return { ok: false, error: syncError };
  }
}

export async function pushConnectorHealthToConnectedDashboard(
  gateway: ConnectedDashboardSyncGateway,
  input: PushConnectorHealthInput
): Promise<ConnectedSyncResult<PushConnectorHealthResult>> {
  try {
    const rows = input.snapshots.map((snapshot) =>
      buildConnectorHealthEventRow(snapshot, input.userId, input.deviceId, input.now)
    );
    await gateway.insertConnectorHealthEvents(rows);
    await gateway.upsertSyncStatus(
      buildSyncStatusRow({
        userId: input.userId,
        deviceId: input.deviceId,
        entity: 'connector_health',
        lastPushAt: input.now,
      })
    );
    return { ok: true, value: { pushedCount: rows.length } };
  } catch (error) {
    const syncError = remoteError(error);
    await gateway.upsertSyncStatus(
      buildSyncStatusRow({
        userId: input.userId,
        deviceId: input.deviceId,
        entity: 'connector_health',
        pendingUploadCount: input.snapshots.length,
        error: { code: syncError.code, message: syncError.message },
        retryAfterAt: buildRetryAfterAt(input.now),
      })
    );
    return { ok: false, error: syncError };
  }
}

export async function pushCandidateProfileImportToConnectedDashboard(
  gateway: ConnectedDashboardSyncGateway,
  input: PushCandidateProfileImportInput
): Promise<ConnectedSyncResult<PushCandidateProfileImportResult>> {
  const provisionalRows = buildCandidateProfileImportRows({
    draft: input.draft,
    userId: input.userId,
    profileId: 'pending-profile-id',
    importedAt: input.now,
    extractorVersion: input.extractorVersion,
    revision: 1,
    rawHash: input.rawHash,
  });

  try {
    const existingProfile = await gateway.getCandidateProfile(input.userId);
    const isDashboardEditedProfile = existingProfile?.updated_by === 'dashboard';
    const profile = isDashboardEditedProfile
      ? { id: existingProfile.id, revision: existingProfile.revision }
      : await gateway.upsertCandidateProfile(provisionalRows.profile);
    const rows = buildCandidateProfileImportRows({
      draft: input.draft,
      userId: input.userId,
      profileId: profile.id,
      importedAt: input.now,
      extractorVersion: input.extractorVersion,
      revision: profile.revision,
      rawHash: input.rawHash,
    });
    const pendingSuggestionFields = isDashboardEditedProfile
      ? await gateway.listPendingCandidateProfileSuggestionFields({
          userId: input.userId,
          profileId: profile.id,
          source: input.draft.source,
        })
      : [];
    const suggestionRows = filterNewCandidateProfileFieldSuggestionRows(
      buildCandidateProfileFieldSuggestionRows({
        draft: input.draft,
        userId: input.userId,
        profile: existingProfile,
      }),
      pendingSuggestionFields
    );
    const conflictRows = buildCandidateProfileSyncConflictRows({
      suggestions: suggestionRows,
      deviceId: input.deviceId,
      profileId: profile.id,
      detectedAt: input.now.toISOString(),
    });

    const syncedChildren = isDashboardEditedProfile
      ? { experiences: 0, education: 0, skills: 0, links: 0 }
      : {
          experiences: rows.experiences.length,
          education: rows.education.length,
          skills: rows.skills.length,
          links: rows.links.length,
        };

    if (!isDashboardEditedProfile) {
      await gateway.replaceCandidateProfileChildren({
        profileId: profile.id,
        experiences: rows.experiences,
        education: rows.education,
        skills: rows.skills,
        links: rows.links,
      });
    }
    await gateway.insertCandidateProfileFieldSuggestions(suggestionRows);
    await gateway.insertSyncConflicts(conflictRows);
    await gateway.insertProfileImport(rows.importEvent);
    await gateway.upsertSyncStatus(
      buildSyncStatusRow({
        userId: input.userId,
        deviceId: input.deviceId,
        entity: 'candidate_profile',
        lastPushAt: input.now,
      })
    );

    return {
      ok: true,
      value: {
        profileId: profile.id,
        experiences: syncedChildren.experiences,
        education: syncedChildren.education,
        skills: syncedChildren.skills,
        links: syncedChildren.links,
        suggestions: suggestionRows.length,
      },
    };
  } catch (error) {
    const baseError = remoteError(error);
    const syncError: ConnectedSyncError = {
      code: 'profile-sync-failed',
      message: baseError.message,
      retryable: true,
    };
    await gateway.upsertSyncStatus(
      buildSyncStatusRow({
        userId: input.userId,
        deviceId: input.deviceId,
        entity: 'candidate_profile',
        pendingUploadCount: 1,
        error: { code: syncError.code, message: syncError.message },
        retryAfterAt: buildRetryAfterAt(input.now),
      })
    );
    return { ok: false, error: syncError };
  }
}

async function hashCandidateProfileDraft(
  draft: CanonicalCandidateProfileDraft
): Promise<string | null> {
  try {
    const encoded = new TextEncoder().encode(JSON.stringify(draft));
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return `sha256:${[...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')}`;
  } catch {
    return null;
  }
}

export async function syncConnectedDashboardProfileImport(
  draft: CanonicalCandidateProfileDraft
): Promise<ConnectedSyncResult<PushCandidateProfileImportResult>> {
  const context = await getRuntimeContext();
  if ('code' in context) {
    return { ok: false, error: context };
  }

  const rawHash = await hashCandidateProfileDraft(draft);
  const result = await pushCandidateProfileImportToConnectedDashboard(context.gateway, {
    userId: context.userId,
    deviceId: context.deviceId,
    draft,
    now: context.now,
    extractorVersion: LINKEDIN_PROFILE_EXTRACTOR_VERSION,
    rawHash,
  });

  if (result.ok) {
    await markConnectedDashboardSynced(context.now);
  }

  return result;
}

export async function syncConnectedDashboardProfileExtractorHealth(
  input: SyncProfileExtractorHealthInput
): Promise<ConnectedSyncResult<{ pushedCount: number }>> {
  const context = await getRuntimeContext();
  if ('code' in context) {
    return { ok: false, error: context };
  }

  try {
    await context.gateway.insertConnectorHealthEvents([
      buildProfileExtractorHealthEventRow({
        userId: context.userId,
        deviceId: context.deviceId,
        source: input.source,
        ok: input.ok,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        occurredAt: input.occurredAt ?? context.now,
      }),
    ]);
    await context.gateway.upsertSyncStatus(
      buildSyncStatusRow({
        userId: context.userId,
        deviceId: context.deviceId,
        entity: 'connector_health',
        lastPushAt: context.now,
      })
    );
    await markConnectedDashboardSynced(context.now);

    return { ok: true, value: { pushedCount: 1 } };
  } catch (error) {
    const syncError = remoteError(error);
    await context.gateway.upsertSyncStatus(
      buildSyncStatusRow({
        userId: context.userId,
        deviceId: context.deviceId,
        entity: 'connector_health',
        pendingUploadCount: 1,
        error: { code: syncError.code, message: syncError.message },
        retryAfterAt: buildRetryAfterAt(context.now),
      })
    );
    return { ok: false, error: syncError };
  }
}

export async function getOrCreateConnectedSyncInstallId(
  createId: () => string = () => crypto.randomUUID()
): Promise<string> {
  const existing = await chrome.storage.local.get(INSTALL_ID_STORAGE_KEY);
  const stored = existing[INSTALL_ID_STORAGE_KEY];
  if (typeof stored === 'string' && stored.length > 0) {
    return stored;
  }

  const installId = createId();
  await chrome.storage.local.set({ [INSTALL_ID_STORAGE_KEY]: installId });
  return installId;
}

async function getApplicationPullCursor(): Promise<string | null> {
  const stored = await chrome.storage.local.get(APPLICATION_PULL_CURSOR_STORAGE_KEY);
  const cursor = stored[APPLICATION_PULL_CURSOR_STORAGE_KEY];
  return typeof cursor === 'string' && Number.isFinite(Date.parse(cursor)) ? cursor : null;
}

async function setApplicationPullCursor(cursor: string | null): Promise<void> {
  if (!cursor) {
    return;
  }

  await chrome.storage.local.set({ [APPLICATION_PULL_CURSOR_STORAGE_KEY]: cursor });
}

function getEntitySyncState(row: RemoteSyncStatusSnapshot): ConnectedDashboardSyncState {
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

function getEntitySyncStateRank(state: ConnectedDashboardSyncState): number {
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

function syncStatusRowsToEntityStatuses(
  rows: RemoteSyncStatusSnapshot[]
): ConnectedDashboardEntitySyncStatus[] {
  return rows
    .map((row) => ({
      entity: row.entity,
      label: CONNECTED_SYNC_ENTITY_LABELS[row.entity],
      state: getEntitySyncState(row),
      lastPullAt: row.last_pull_at,
      lastPushAt: row.last_push_at,
      pendingUploadCount: row.pending_upload_count,
      pendingDownloadCount: row.pending_download_count,
      lastErrorCode: row.last_error_code,
      lastErrorMessage: row.last_error_message,
      retryAfterAt: row.retry_after_at,
      updatedAt: row.updated_at,
    }))
    .sort(
      (a, b) =>
        getEntitySyncStateRank(a.state) - getEntitySyncStateRank(b.state) ||
        b.updatedAt.localeCompare(a.updatedAt) ||
        a.label.localeCompare(b.label)
    );
}

async function getRegisteredDeviceId(
  supabase: SupabaseLike,
  userId: string,
  installId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('extension_devices')
    .select('id')
    .eq('user_id', userId)
    .eq('install_id', installId)
    .order('last_seen_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return parseDeviceId(data);
}

async function getRemoteEntitySyncStatuses(
  supabase: SupabaseLike,
  userId: string,
  deviceId: string
): Promise<ConnectedDashboardEntitySyncStatus[]> {
  const { data, error } = await supabase
    .from('sync_status')
    .select(
      'entity,last_pull_at,last_push_at,pending_upload_count,pending_download_count,last_error_code,last_error_message,retry_after_at,updated_at'
    )
    .eq('user_id', userId)
    .eq('device_id', deviceId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return syncStatusRowsToEntityStatuses(parseRemoteSyncStatusSnapshots(data));
}

async function getRuntimeContext(): Promise<
  | {
      userId: string;
      installId: string;
      deviceId: string;
      gateway: ConnectedDashboardSyncGateway;
      now: Date;
    }
  | ConnectedSyncError
> {
  let supabase: SupabaseLike;
  try {
    supabase = getSupabaseClient() as unknown as SupabaseLike;
  } catch (error) {
    return { code: 'unauthenticated', message: remoteError(error).message, retryable: true };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user.id) {
    return {
      code: 'unauthenticated',
      message: 'MissionPulse Supabase session is not available.',
      retryable: true,
    };
  }

  const now = new Date();
  const gateway = createSupabaseConnectedDashboardGateway(supabase);
  const installId = await getOrCreateConnectedSyncInstallId();
  const manifest = chrome.runtime.getManifest();
  const registered = await registerExtensionDevice(gateway, {
    userId: session.user.id,
    installId,
    browser: typeof navigator === 'undefined' ? null : navigator.userAgent,
    extensionVersion: manifest.version,
    now,
  });

  if (!registered.ok) {
    return registered.error;
  }

  return {
    userId: session.user.id,
    installId,
    deviceId: registered.value.id,
    gateway,
    now,
  };
}

export async function syncConnectedDashboardScan(
  missions: Mission[],
  healthSnapshots: ConnectorHealthSnapshot[] = [],
  options: {
    sourceMissions?: Mission[];
    duplicateRelations?: MissionDuplicateRelation[];
  } = {}
): Promise<ConnectedSyncResult<{ missions: number; connectorHealth: number }>> {
  const synced = await syncConnectedDashboardSnapshot({
    missions,
    sourceMissions: options.sourceMissions,
    duplicateRelations: options.duplicateRelations,
    trackings: [],
    healthSnapshots,
  });

  if (!synced.ok) {
    return synced;
  }

  return {
    ok: true,
    value: {
      missions: synced.value.missions,
      connectorHealth: synced.value.connectorHealth,
    },
  };
}

export async function syncConnectedDashboardSnapshot(
  input: ConnectedDashboardSnapshotInput
): Promise<ConnectedSyncResult<ConnectedDashboardSnapshotResult>> {
  const context = await getRuntimeContext();
  if ('code' in context) {
    return { ok: false, error: context };
  }

  const pushedMissions = await pushMissionsToConnectedDashboard(context.gateway, {
    userId: context.userId,
    deviceId: context.deviceId,
    installId: context.installId,
    missions: input.missions,
    sourceMissions: input.sourceMissions,
    duplicateRelations: input.duplicateRelations,
    now: context.now,
    scorerVersion: DEFAULT_SCORER_VERSION,
  });

  if (!pushedMissions.ok) {
    return pushedMissions;
  }

  const pushedApplications = await pushApplicationsToConnectedDashboard(context.gateway, {
    userId: context.userId,
    deviceId: context.deviceId,
    installId: context.installId,
    trackings: input.trackings,
    remoteMissionIds: pushedMissions.value.remoteMissionIds,
    generatedAssetsByMissionId: input.generatedAssetsByMissionId,
    now: context.now,
  });

  if (!pushedApplications.ok) {
    return pushedApplications;
  }

  const existingTrackings = new Map(
    input.trackings.map((tracking) => [tracking.missionId, tracking])
  );
  const remoteMissionIdsByLocalId = pushedMissions.value.remoteMissionIds;
  const localMissionIdsByRemoteId = new Map(
    [...remoteMissionIdsByLocalId.entries()].map(([localMissionId, remoteMissionId]) => [
      remoteMissionId,
      localMissionId,
    ])
  );
  const applicationPullCursor = await getApplicationPullCursor();
  const pulledApplications = await pullApplicationsFromConnectedDashboard(context.gateway, {
    userId: context.userId,
    deviceId: context.deviceId,
    localMissionIdsByRemoteId,
    existingTrackings,
    since: applicationPullCursor ? new Date(applicationPullCursor) : null,
    now: context.now,
  });

  if (!pulledApplications.ok) {
    return pulledApplications;
  }

  await setApplicationPullCursor(pulledApplications.value.nextCursor);

  if (pulledApplications.value.trackings.length > 0) {
    await saveTrackings(pulledApplications.value.trackings);
  }

  const existingProfile = await getProfile();
  const pulledCandidateProfile = await pullCandidateProfileFromConnectedDashboard(context.gateway, {
    userId: context.userId,
    deviceId: context.deviceId,
    existingProfile,
    now: context.now,
  });

  if (!pulledCandidateProfile.ok) {
    return pulledCandidateProfile;
  }

  if (pulledCandidateProfile.value.profile) {
    try {
      await saveProfile(pulledCandidateProfile.value.profile);
      await saveConnectedCandidateProfileCache(pulledCandidateProfile.value.profile);
    } catch (error) {
      const syncError: ConnectedSyncError = {
        code: 'profile-sync-failed',
        message: error instanceof Error ? error.message : 'Local profile save failed.',
        retryable: true,
      };
      await context.gateway.upsertSyncStatus(
        buildSyncStatusRow({
          userId: context.userId,
          deviceId: context.deviceId,
          entity: 'candidate_profile',
          error: { code: syncError.code, message: syncError.message },
          retryAfterAt: buildRetryAfterAt(context.now),
        })
      );
      return { ok: false, error: syncError };
    }
  } else {
    try {
      const lastConnectedProfile = await getConnectedCandidateProfileCache();
      if (shouldClearLocalCandidateProfile(existingProfile, lastConnectedProfile)) {
        await clearProfile();
      }
      await clearConnectedCandidateProfileCache();
    } catch (error) {
      const syncError: ConnectedSyncError = {
        code: 'profile-sync-failed',
        message: error instanceof Error ? error.message : 'Local profile clear failed.',
        retryable: true,
      };
      await context.gateway.upsertSyncStatus(
        buildSyncStatusRow({
          userId: context.userId,
          deviceId: context.deviceId,
          entity: 'candidate_profile',
          error: { code: syncError.code, message: syncError.message },
          retryAfterAt: buildRetryAfterAt(context.now),
        })
      );
      return { ok: false, error: syncError };
    }
  }

  const pushedHealth = await pushConnectorHealthToConnectedDashboard(context.gateway, {
    userId: context.userId,
    deviceId: context.deviceId,
    snapshots: input.healthSnapshots,
    now: context.now,
  });

  if (!pushedHealth.ok) {
    return pushedHealth;
  }

  const pulledAlertPreferences = await pullAlertPreferencesFromConnectedDashboard(context.gateway, {
    userId: context.userId,
    deviceId: context.deviceId,
    now: context.now,
  });

  if (!pulledAlertPreferences.ok) {
    return pulledAlertPreferences;
  }

  await markConnectedDashboardSynced(context.now);

  return {
    ok: true,
    value: {
      missions: pushedMissions.value.pushedCount,
      applications: pushedApplications.value.pushedCount,
      skippedApplications: pushedApplications.value.skippedCount,
      connectorHealth: pushedHealth.value.pushedCount,
    },
  };
}

export async function syncConnectedDashboardTracking(
  missionId: string
): Promise<ConnectedSyncResult<{ applications: number }>> {
  const context = await getRuntimeContext();
  if ('code' in context) {
    return { ok: false, error: context };
  }

  const [mission, tracking] = await Promise.all([
    getMissionById(missionId),
    getTracking(missionId),
  ]);
  if (!mission) {
    return {
      ok: false,
      error: {
        code: 'mission-not-found',
        message: `Mission ${missionId} not found.`,
        retryable: false,
      },
    };
  }
  if (!tracking) {
    return {
      ok: false,
      error: {
        code: 'tracking-not-found',
        message: `Tracking ${missionId} not found.`,
        retryable: false,
      },
    };
  }

  const generatedAssets = (
    await Promise.all(tracking.generatedAssetIds.map((assetId) => getGeneratedAsset(assetId)))
  ).filter((asset): asset is GeneratedAsset => asset !== null);

  const pushedMissions = await pushMissionsToConnectedDashboard(context.gateway, {
    userId: context.userId,
    deviceId: context.deviceId,
    installId: context.installId,
    missions: [mission],
    now: context.now,
    scorerVersion: DEFAULT_SCORER_VERSION,
  });
  if (!pushedMissions.ok) {
    return pushedMissions;
  }

  const pushedApplications = await pushApplicationsToConnectedDashboard(context.gateway, {
    userId: context.userId,
    deviceId: context.deviceId,
    installId: context.installId,
    trackings: [tracking],
    remoteMissionIds: pushedMissions.value.remoteMissionIds,
    generatedAssetsByMissionId: new Map([[tracking.missionId, generatedAssets]]),
    now: context.now,
  });
  if (!pushedApplications.ok) {
    return pushedApplications;
  }

  const applicationPullCursor = await getApplicationPullCursor();
  const pulledApplications = await pullApplicationsFromConnectedDashboard(context.gateway, {
    userId: context.userId,
    deviceId: context.deviceId,
    localMissionIdsByRemoteId: new Map(
      [...pushedMissions.value.remoteMissionIds.entries()].map(
        ([localMissionId, remoteMissionId]) => [remoteMissionId, localMissionId]
      )
    ),
    existingTrackings: new Map([[tracking.missionId, tracking]]),
    since: applicationPullCursor ? new Date(applicationPullCursor) : null,
    now: context.now,
  });

  if (!pulledApplications.ok) {
    return pulledApplications;
  }

  if (pulledApplications.value.trackings.length > 0) {
    await setApplicationPullCursor(pulledApplications.value.nextCursor);
    await saveTrackings(pulledApplications.value.trackings);
  } else {
    await setApplicationPullCursor(pulledApplications.value.nextCursor);
  }

  await markConnectedDashboardSynced(context.now);

  return { ok: true, value: { applications: pushedApplications.value.pushedCount } };
}

export async function getConnectedDashboardSyncStatus(): Promise<ConnectedDashboardSyncStatus> {
  let authenticated = false;
  let userId: string | null = null;
  let supabase: SupabaseLike | null = null;
  try {
    supabase = getSupabaseClient() as unknown as SupabaseLike;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    userId = session?.user.id ?? null;
    authenticated = Boolean(userId);
  } catch {
    authenticated = false;
  }

  const stored = await chrome.storage.local.get([INSTALL_ID_STORAGE_KEY, 'lastGlobalSync']);
  const installId = stored[INSTALL_ID_STORAGE_KEY];
  const lastGlobalSync = stored.lastGlobalSync;
  let entities: ConnectedDashboardEntitySyncStatus[] = [];

  if (authenticated && userId && supabase && typeof installId === 'string') {
    try {
      const deviceId = await getRegisteredDeviceId(supabase, userId, installId);
      entities = deviceId ? await getRemoteEntitySyncStatuses(supabase, userId, deviceId) : [];
    } catch {
      entities = [];
    }
  }

  return {
    authenticated,
    installId: typeof installId === 'string' ? installId : null,
    lastGlobalSync: typeof lastGlobalSync === 'number' ? lastGlobalSync : null,
    entities,
  };
}
