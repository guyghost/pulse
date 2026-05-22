import type { User } from '@supabase/supabase-js';
import {
  buildApplicationPipelineEventRows,
  buildApplicationPullCursor,
  buildApplicationUpsertRow,
  buildCandidateProfileFieldSuggestionRows,
  buildCandidateProfileImportRows,
  buildCandidateProfileSyncConflictRows,
  buildConnectorHealthEventRow,
  buildGeneratedApplicationAssetUpsertRow,
  buildMissionDuplicateUpsertRows,
  buildMissionScoreUpsertRow,
  buildMissionUpsertRow,
  buildSyncStatusRow,
  mergeRemoteApplicationTracking,
  type ApplicationPipelineEventRow,
  type ApplicationUpsertRow,
  type CandidateEducationInsertRow,
  type CandidateExperienceInsertRow,
  type CandidateProfileFieldSuggestionRow,
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
  type SyncStatusRow,
  type SyncConflictInsertRow,
} from '../../core/sync/connected-dashboard';
import type { CanonicalCandidateProfileDraft } from '../../core/profile-extractors/types';
import type { MissionDuplicateRelation } from '../../core/scoring/dedup';
import type { GeneratedAsset } from '../../core/types/generation';
import type { ConnectorHealthSnapshot } from '../../core/types/health';
import type { Mission, MissionSource } from '../../core/types/mission';
import type { MissionTracking } from '../../core/types/tracking';
import { getSupabaseClient } from '../auth/supabase-client';
import { getMissionById } from '../storage/db';
import { getGeneratedAsset } from '../storage/generated-assets';
import { getTracking, saveTrackings } from '../storage/tracking';

const INSTALL_ID_STORAGE_KEY = 'missionpulse.connectedSync.installId';
const APPLICATION_PULL_CURSOR_STORAGE_KEY =
  'missionpulse.connectedSync.cursor.applications.lastPullAt';
const DEFAULT_SCORER_VERSION = 'missionpulse-v1';
const LINKEDIN_PROFILE_EXTRACTOR_VERSION = 'linkedin-v1';
const SYNC_RETRY_DELAY_MS = 5 * 60 * 1000;

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
  upsertApplications(rows: ApplicationUpsertRow[]): Promise<RemoteApplicationIdentity[]>;
  listApplicationsUpdatedSince(input: {
    userId: string;
    since: string | null;
  }): Promise<RemoteApplicationSnapshot[]>;
  upsertApplicationPipelineEvents(rows: ApplicationPipelineEventRow[]): Promise<void>;
  upsertGeneratedApplicationAssets(rows: GeneratedApplicationAssetUpsertRow[]): Promise<void>;
  insertConnectorHealthEvents(rows: ConnectorHealthEventRow[]): Promise<void>;
  getCandidateProfile(userId: string): Promise<ExistingCandidateProfileSnapshot | null>;
  upsertCandidateProfile(row: CandidateProfileUpsertRow): Promise<{ id: string; revision: number }>;
  replaceCandidateProfileChildren(input: {
    profileId: string;
    experiences: CandidateExperienceInsertRow[];
    education: CandidateEducationInsertRow[];
    skills: CandidateSkillUpsertRow[];
    links: CandidateLinkInsertRow[];
  }): Promise<void>;
  insertCandidateProfileFieldSuggestions(rows: CandidateProfileFieldSuggestionRow[]): Promise<void>;
  insertSyncConflicts(rows: SyncConflictInsertRow[]): Promise<void>;
  insertProfileImport(row: ProfileImportInsertRow): Promise<void>;
  upsertSyncStatus(row: SyncStatusRow): Promise<void>;
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

function parseRemoteApplicationSnapshots(data: unknown): RemoteApplicationSnapshot[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.flatMap((item) => {
    if (
      isRecord(item) &&
      typeof item.id === 'string' &&
      typeof item.mission_id === 'string' &&
      isApplicationStage(item.stage) &&
      (typeof item.user_rating === 'number' || item.user_rating === null) &&
      typeof item.notes === 'string' &&
      typeof item.revision === 'number' &&
      typeof item.updated_at === 'string'
    ) {
      return [
        {
          id: item.id,
          mission_id: item.mission_id,
          stage: item.stage,
          user_rating: item.user_rating,
          notes: item.notes,
          revision: item.revision,
          updated_at: item.updated_at,
        },
      ];
    }
    return [];
  });
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
    upsertApplications: async (rows) =>
      rows.length === 0
        ? []
        : selectOrThrow(
            supabase.from('applications').upsert(rows, { onConflict: 'user_id,mission_id' }),
            'id,mission_id',
            parseRemoteApplicationIdentities
          ),
    listApplicationsUpdatedSince: async ({ userId, since }) => {
      let query = supabase
        .from('applications')
        .select('id,mission_id,stage,user_rating,notes,revision,updated_at')
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
                'extension'
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

    const remoteApplications = await gateway.upsertApplications(eligible.map((item) => item.row));
    const applicationIdsByMission = new Map(
      remoteApplications.map((application) => [application.mission_id, application.id])
    );
    const eventRows = eligible.flatMap((item) => {
      const applicationId = applicationIdsByMission.get(item.row.mission_id);
      return applicationId
        ? buildApplicationPipelineEventRows(
            item.tracking,
            input.userId,
            applicationId,
            'extension',
            input.installId
          )
        : [];
    });
    const assetRows = eligible.flatMap((item) => {
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
        pendingUploadCount: skippedCount,
      })
    );

    return { ok: true, value: { pushedCount: remoteApplications.length, skippedCount } };
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
    let skippedCount = 0;

    for (const application of remoteApplications) {
      const localMissionId = input.localMissionIdsByRemoteId.get(application.mission_id);
      if (!localMissionId) {
        skippedCount++;
        continue;
      }

      trackings.push(
        mergeRemoteApplicationTracking(
          input.existingTrackings.get(localMissionId) ?? null,
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
    const suggestionRows = buildCandidateProfileFieldSuggestionRows({
      draft: input.draft,
      userId: input.userId,
      profile: existingProfile,
    });
    const conflictRows = buildCandidateProfileSyncConflictRows({
      suggestions: suggestionRows,
      deviceId: input.deviceId,
      profileId: profile.id,
      detectedAt: input.now.toISOString(),
    });

    await gateway.replaceCandidateProfileChildren({
      profileId: profile.id,
      experiences: rows.experiences,
      education: rows.education,
      skills: rows.skills,
      links: rows.links,
    });
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
        experiences: rows.experiences.length,
        education: rows.education.length,
        skills: rows.skills.length,
        links: rows.links.length,
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
    await chrome.storage.local.set({ lastGlobalSync: context.now.getTime() });
  }

  return result;
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

  const pushedHealth = await pushConnectorHealthToConnectedDashboard(context.gateway, {
    userId: context.userId,
    deviceId: context.deviceId,
    snapshots: input.healthSnapshots,
    now: context.now,
  });

  if (!pushedHealth.ok) {
    return pushedHealth;
  }

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
  if (pulledApplications.ok && pulledApplications.value.trackings.length > 0) {
    await setApplicationPullCursor(pulledApplications.value.nextCursor);
    await saveTrackings(pulledApplications.value.trackings);
  } else if (pulledApplications.ok) {
    await setApplicationPullCursor(pulledApplications.value.nextCursor);
  }

  return { ok: true, value: { applications: pushedApplications.value.pushedCount } };
}

export async function getConnectedDashboardSyncStatus(): Promise<ConnectedDashboardSyncStatus> {
  let authenticated = false;
  try {
    const supabase = getSupabaseClient() as unknown as SupabaseLike;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    authenticated = Boolean(session?.user.id);
  } catch {
    authenticated = false;
  }

  const stored = await chrome.storage.local.get([INSTALL_ID_STORAGE_KEY, 'lastGlobalSync']);
  const installId = stored[INSTALL_ID_STORAGE_KEY];
  const lastGlobalSync = stored.lastGlobalSync;

  return {
    authenticated,
    installId: typeof installId === 'string' ? installId : null,
    lastGlobalSync: typeof lastGlobalSync === 'number' ? lastGlobalSync : null,
  };
}
