export type DashboardWritableSyncEntity =
  | 'applications'
  | 'candidate_profile'
  | 'alert_preferences';

type SupabaseErrorLike = {
  message: string;
};

type SupabaseResult<T> = {
  data: T | null;
  error: SupabaseErrorLike | null;
};

type ExtensionDeviceIdentityRow = {
  id: string;
};

type SyncStatusIdentityRow = {
  device_id: string;
};

type PendingPullSyncStatusInsertRow = {
  user_id: string;
  device_id: string;
  entity: DashboardWritableSyncEntity;
  pending_upload_count: number;
  pending_download_count: number;
  updated_at: string;
};

type SelectBuilder<T> = {
  eq(column: string, value: string): SelectBuilder<T> & Promise<SupabaseResult<T[]>>;
};

type UpdateBuilder = {
  eq(column: string, value: string): UpdateBuilder & Promise<SupabaseResult<null>>;
};

type InsertBuilder = Promise<SupabaseResult<null>>;

type ExtensionDevicesTable = {
  select(columns: string): SelectBuilder<ExtensionDeviceIdentityRow>;
};

type SyncStatusTable = {
  select(columns: string): SelectBuilder<SyncStatusIdentityRow>;
  update(values: {
    pending_download_count: number;
    last_error_code: null;
    last_error_message: null;
    updated_at: string;
  }): UpdateBuilder;
  insert(rows: PendingPullSyncStatusInsertRow[]): InsertBuilder;
  upsert(
    rows: PendingPullSyncStatusInsertRow[],
    options: { onConflict: 'device_id,entity'; ignoreDuplicates: true }
  ): InsertBuilder;
};

type DashboardSyncStatusSupabase = {
  from(table: string): unknown;
};

export type MarkEntityPendingPullResult =
  | { ok: true; devices: number; inserted: number; updated: number }
  | {
      ok: false;
      reason: 'device-read-failed' | 'status-read-failed' | 'update-failed' | 'insert-failed';
    };

function extensionDevicesTable(supabase: DashboardSyncStatusSupabase): ExtensionDevicesTable {
  return supabase.from('extension_devices') as ExtensionDevicesTable;
}

function syncStatusTable(supabase: DashboardSyncStatusSupabase): SyncStatusTable {
  return supabase.from('sync_status') as SyncStatusTable;
}

export async function markEntityPendingExtensionPull(
  supabase: DashboardSyncStatusSupabase,
  userId: string,
  entity: DashboardWritableSyncEntity,
  updatedAt: string
): Promise<MarkEntityPendingPullResult> {
  const devicesResult = await extensionDevicesTable(supabase).select('id').eq('user_id', userId);

  if (devicesResult.error) {
    return { ok: false, reason: 'device-read-failed' };
  }

  const devices = devicesResult.data ?? [];
  if (devices.length === 0) {
    return { ok: true, devices: 0, inserted: 0, updated: 0 };
  }

  const statusesResult = await syncStatusTable(supabase)
    .select('device_id')
    .eq('user_id', userId)
    .eq('entity', entity);

  if (statusesResult.error) {
    return { ok: false, reason: 'status-read-failed' };
  }

  const existingDeviceIds = new Set((statusesResult.data ?? []).map((row) => row.device_id));
  const missingDeviceIds = devices
    .map((device) => device.id)
    .filter((deviceId) => !existingDeviceIds.has(deviceId));

  if (existingDeviceIds.size > 0) {
    const updateResult = await syncStatusTable(supabase)
      .update({
        pending_download_count: 1,
        last_error_code: null,
        last_error_message: null,
        updated_at: updatedAt,
      })
      .eq('user_id', userId)
      .eq('entity', entity);

    if (updateResult.error) {
      return { ok: false, reason: 'update-failed' };
    }
  }

  if (missingDeviceIds.length > 0) {
    const insertResult = await syncStatusTable(supabase).upsert(
      missingDeviceIds.map((deviceId) => ({
        user_id: userId,
        device_id: deviceId,
        entity,
        pending_upload_count: 0,
        pending_download_count: 1,
        updated_at: updatedAt,
      })),
      { onConflict: 'device_id,entity', ignoreDuplicates: true }
    );

    if (insertResult.error) {
      return { ok: false, reason: 'insert-failed' };
    }
  }

  return {
    ok: true,
    devices: devices.length,
    inserted: missingDeviceIds.length,
    updated: existingDeviceIds.size,
  };
}
