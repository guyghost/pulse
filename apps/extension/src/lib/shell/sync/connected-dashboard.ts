import type { User } from '@supabase/supabase-js';
import {
  buildApplicationPipelineEventRows,
  buildApplicationUpsertRow,
  buildConnectorHealthEventRow,
  buildMissionScoreUpsertRow,
  buildMissionUpsertRow,
  buildSyncStatusRow,
  type ApplicationPipelineEventRow,
  type ApplicationUpsertRow,
  type ConnectorHealthEventRow,
  type MissionScoreUpsertRow,
  type MissionUpsertRow,
  type SyncStatusRow,
} from '../../core/sync/connected-dashboard';
import type { ConnectorHealthSnapshot } from '../../core/types/health';
import type { Mission, MissionSource } from '../../core/types/mission';
import type { MissionTracking } from '../../core/types/tracking';
import { getSupabaseClient } from '../auth/supabase-client';
import { getMissionById } from '../storage/db';
import { getTracking } from '../storage/tracking';

const INSTALL_ID_STORAGE_KEY = 'missionpulse.connectedSync.installId';
const DEFAULT_SCORER_VERSION = 'missionpulse-v1';

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
  upsertApplications(rows: ApplicationUpsertRow[]): Promise<RemoteApplicationIdentity[]>;
  upsertApplicationPipelineEvents(rows: ApplicationPipelineEventRow[]): Promise<void>;
  insertConnectorHealthEvents(rows: ConnectorHealthEventRow[]): Promise<void>;
  upsertSyncStatus(row: SyncStatusRow): Promise<void>;
}

export interface ConnectedSyncError {
  code: 'unauthenticated' | 'remote-error' | 'mission-not-found' | 'tracking-not-found';
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
  now: Date;
}

export interface PushApplicationsResult {
  pushedCount: number;
  skippedCount: number;
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

export interface ConnectedDashboardSnapshotInput {
  missions: Mission[];
  trackings: MissionTracking[];
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

interface SupabaseTableLike {
  upsert(rows: unknown, options?: Record<string, unknown>): SupabaseWriteBuilder;
  insert(rows: unknown): SupabaseWriteBuilder;
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
    upsertApplications: async (rows) =>
      rows.length === 0
        ? []
        : selectOrThrow(
            supabase.from('applications').upsert(rows, { onConflict: 'user_id,mission_id' }),
            'id,mission_id',
            parseRemoteApplicationIdentities
          ),
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
    const missionRows = input.missions.map((mission) =>
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
        pendingUploadCount: input.missions.length,
        error: { code: syncError.code, message: syncError.message },
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

    await gateway.upsertApplicationPipelineEvents(eventRows);
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
  healthSnapshots: ConnectorHealthSnapshot[] = []
): Promise<ConnectedSyncResult<{ missions: number; connectorHealth: number }>> {
  const synced = await syncConnectedDashboardSnapshot({
    missions,
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
    now: context.now,
  });

  if (!pushedApplications.ok) {
    return pushedApplications;
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
    now: context.now,
  });
  if (!pushedApplications.ok) {
    return pushedApplications;
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
