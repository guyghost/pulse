import { describe, expect, it, vi } from 'vitest';
import { markEntityPendingExtensionPull } from '../../../src/lib/server/sync-status';

type SupabaseErrorLike = {
  message: string;
};

type QueryResult<T> = {
  data: T | null;
  error: SupabaseErrorLike | null;
};

type EqCall = {
  column: string;
  value: string;
};

type SelectThenable<T> = PromiseLike<QueryResult<T[]>> & {
  eq(column: string, value: string): SelectThenable<T>;
};

type UpdateThenable = PromiseLike<QueryResult<null>> & {
  eq(column: string, value: string): UpdateThenable;
};

type ExtensionDeviceIdentityRow = {
  id: string;
};

type SyncStatusIdentityRow = {
  device_id: string;
};

type InsertRow = {
  user_id: string;
  device_id: string;
  entity: string;
  pending_upload_count: number;
  pending_download_count: number;
  updated_at: string;
};

type UpsertOptions = {
  onConflict: string;
  ignoreDuplicates: boolean;
};

function createSelectBuilder<T>(result: QueryResult<T[]>, eqCalls: EqCall[]): SelectThenable<T> {
  const builder: SelectThenable<T> = {
    eq(column: string, value: string) {
      eqCalls.push({ column, value });
      return builder;
    },
    then: Promise.resolve(result).then.bind(Promise.resolve(result)),
  };

  return builder;
}

function createUpdateBuilder(result: QueryResult<null>, eqCalls: EqCall[]): UpdateThenable {
  const builder: UpdateThenable = {
    eq(column: string, value: string) {
      eqCalls.push({ column, value });
      return builder;
    },
    then: Promise.resolve(result).then.bind(Promise.resolve(result)),
  };

  return builder;
}

function createSupabaseMock(options: {
  devices: ExtensionDeviceIdentityRow[];
  statuses: SyncStatusIdentityRow[];
  deviceError?: SupabaseErrorLike;
  statusError?: SupabaseErrorLike;
  updateError?: SupabaseErrorLike;
  insertError?: SupabaseErrorLike;
}) {
  const deviceEqCalls: EqCall[] = [];
  const statusSelectEqCalls: EqCall[] = [];
  const statusUpdateEqCalls: EqCall[] = [];
  const insertedRows: InsertRow[][] = [];
  const upsertedRows: Array<{ rows: InsertRow[]; options: UpsertOptions }> = [];
  const updateValues: unknown[] = [];

  return {
    calls: {
      deviceEqCalls,
      statusSelectEqCalls,
      statusUpdateEqCalls,
      insertedRows,
      upsertedRows,
      updateValues,
    },
    supabase: {
      from: vi.fn((table: string): unknown => {
        if (table === 'extension_devices') {
          return {
            select: vi.fn(() =>
              createSelectBuilder<ExtensionDeviceIdentityRow>(
                {
                  data: options.deviceError ? null : options.devices,
                  error: options.deviceError ?? null,
                },
                deviceEqCalls
              )
            ),
          };
        }

        if (table === 'sync_status') {
          return {
            select: vi.fn(() =>
              createSelectBuilder<SyncStatusIdentityRow>(
                {
                  data: options.statusError ? null : options.statuses,
                  error: options.statusError ?? null,
                },
                statusSelectEqCalls
              )
            ),
            update: vi.fn((values: unknown) => {
              updateValues.push(values);
              return createUpdateBuilder(
                { data: null, error: options.updateError ?? null },
                statusUpdateEqCalls
              );
            }),
            insert: vi.fn((rows: InsertRow[]) => {
              insertedRows.push(rows);
              return Promise.resolve({ data: null, error: options.insertError ?? null });
            }),
            upsert: vi.fn((rows: InsertRow[], upsertOptions: UpsertOptions) => {
              upsertedRows.push({ rows, options: upsertOptions });
              return Promise.resolve({ data: null, error: options.insertError ?? null });
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    },
  };
}

describe('dashboard sync status server helper', () => {
  it('marks existing application sync statuses pending and creates missing device rows', async () => {
    const { supabase, calls } = createSupabaseMock({
      devices: [{ id: 'device-1' }, { id: 'device-2' }],
      statuses: [{ device_id: 'device-1' }],
    });

    const result = await markEntityPendingExtensionPull(
      supabase,
      'user-1',
      'applications',
      '2026-05-22T10:00:00.000Z'
    );

    expect(result).toEqual({ ok: true, devices: 2, inserted: 1, updated: 1 });
    expect(calls.deviceEqCalls).toEqual([{ column: 'user_id', value: 'user-1' }]);
    expect(calls.statusSelectEqCalls).toEqual([
      { column: 'user_id', value: 'user-1' },
      { column: 'entity', value: 'applications' },
    ]);
    expect(calls.statusUpdateEqCalls).toEqual([
      { column: 'user_id', value: 'user-1' },
      { column: 'entity', value: 'applications' },
    ]);
    expect(calls.updateValues).toEqual([
      {
        pending_download_count: 1,
        last_error_code: null,
        last_error_message: null,
        retry_after_at: null,
        updated_at: '2026-05-22T10:00:00.000Z',
      },
    ]);
    expect(calls.insertedRows).toEqual([]);
    expect(calls.upsertedRows).toEqual([
      {
        rows: [
          {
            user_id: 'user-1',
            device_id: 'device-2',
            entity: 'applications',
            pending_upload_count: 0,
            pending_download_count: 1,
            updated_at: '2026-05-22T10:00:00.000Z',
          },
        ],
        options: {
          onConflict: 'device_id,entity',
          ignoreDuplicates: true,
        },
      },
    ]);
  });

  it('does not touch sync_status when the user has no registered extension device', async () => {
    const { supabase, calls } = createSupabaseMock({
      devices: [],
      statuses: [],
    });

    const result = await markEntityPendingExtensionPull(
      supabase,
      'user-1',
      'applications',
      '2026-05-22T10:00:00.000Z'
    );

    expect(result).toEqual({ ok: true, devices: 0, inserted: 0, updated: 0 });
    expect(calls.statusSelectEqCalls).toEqual([]);
    expect(calls.statusUpdateEqCalls).toEqual([]);
    expect(calls.insertedRows).toEqual([]);
  });

  it('returns a typed failure when sync status rows cannot be read', async () => {
    const { supabase, calls } = createSupabaseMock({
      devices: [{ id: 'device-1' }],
      statuses: [],
      statusError: { message: 'permission denied' },
    });

    const result = await markEntityPendingExtensionPull(
      supabase,
      'user-1',
      'applications',
      '2026-05-22T10:00:00.000Z'
    );

    expect(result).toEqual({ ok: false, reason: 'status-read-failed' });
    expect(calls.statusUpdateEqCalls).toEqual([]);
    expect(calls.insertedRows).toEqual([]);
  });
});
