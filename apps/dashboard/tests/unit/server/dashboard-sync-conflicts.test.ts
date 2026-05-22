import { afterEach, describe, expect, it, vi } from 'vitest';

type QueryResult<T> = {
  data: T | null;
  error: { code?: string; message: string } | null;
};

type EqCall = {
  table: string;
  column: string;
  value: unknown;
};

type SyncConflictRow = {
  id: string;
  entity: string;
  entity_id: string;
  field: string;
  local_value: string | null;
  revision: number;
};

type ApplicationRow = {
  id: string;
  stage: string;
  revision: number;
};

const supabaseMock = vi.hoisted(() => ({
  current: null as ReturnType<typeof createSupabaseConflictMock> | null,
}));

const syncStatusMock = vi.hoisted(() => ({
  markEntityPendingExtensionPull: vi.fn(),
}));

const pipelineEventsMock = vi.hoisted(() => ({
  upsertDashboardPipelineEvent: vi.fn(async () => true),
}));

vi.mock('../../../src/lib/server/supabase', () => ({
  createSupabaseServerClient: vi.fn(() => {
    if (!supabaseMock.current) {
      throw new Error('Supabase sync conflict mock not configured.');
    }
    return supabaseMock.current.supabase;
  }),
}));

vi.mock('../../../src/lib/server/sync-status', () => ({
  markEntityPendingExtensionPull: syncStatusMock.markEntityPendingExtensionPull,
}));

vi.mock('../../../src/lib/server/pipeline-events', () => ({
  upsertDashboardPipelineEvent: pipelineEventsMock.upsertDashboardPipelineEvent,
}));

vi.mock('$env/dynamic/public', () => ({
  env: {
    PUBLIC_SUPABASE_URL: 'https://supabase.example',
    PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  },
}));

function createSelectBuilder<Row>(row: Row | null, eqCalls: EqCall[], table: string) {
  const builder = {
    eq(column: string, value: unknown) {
      eqCalls.push({ table, column, value });
      return builder;
    },
    async single<T>(): Promise<QueryResult<T>> {
      return row
        ? { data: row as T, error: null }
        : { data: null, error: { message: 'not found' } };
    },
  };

  return builder;
}

function createUpdateBuilder(
  table: string,
  result: QueryResult<{ id: string }>,
  eqCalls: EqCall[]
) {
  const builder = {
    eq(column: string, value: unknown) {
      eqCalls.push({ table, column, value });
      return builder;
    },
    select(_columns: string) {
      return builder;
    },
    async single<T>(): Promise<QueryResult<T>> {
      return result as QueryResult<T>;
    },
  };

  return builder;
}

function createSupabaseConflictMock(input: {
  conflict: SyncConflictRow;
  application: ApplicationRow;
}) {
  const selectEqCalls: EqCall[] = [];
  const updateEqCalls: EqCall[] = [];
  const updateValues: Array<{ table: string; values: unknown }> = [];
  const supabase = {
    auth: {
      getSession: vi.fn(async () => ({
        data: {
          session: {
            user: { id: 'user-1' },
          },
        },
      })),
    },
    from: vi.fn((table: string) => {
      if (table === 'sync_conflicts') {
        return {
          select: vi.fn(() => createSelectBuilder(input.conflict, selectEqCalls, table)),
          update: vi.fn((values: unknown) => {
            updateValues.push({ table, values });
            return createUpdateBuilder(
              table,
              { data: { id: input.conflict.id }, error: null },
              updateEqCalls
            );
          }),
        };
      }

      if (table === 'applications') {
        return {
          select: vi.fn(() => createSelectBuilder(input.application, selectEqCalls, table)),
          update: vi.fn((values: unknown) => {
            updateValues.push({ table, values });
            return createUpdateBuilder(
              table,
              { data: { id: input.application.id }, error: null },
              updateEqCalls
            );
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { selectEqCalls, updateEqCalls, updateValues, supabase };
}

function createConflictResolutionRequest(): Request {
  const formData = new FormData();
  formData.set('conflictId', 'conflict-1');
  formData.set('resolutionAction', 'apply_local');

  return new Request('http://localhost/dashboard?/resolveSyncConflict', {
    method: 'POST',
    body: formData,
  });
}

describe('dashboard sync conflict action', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.clearAllMocks();
    supabaseMock.current = null;
  });

  it('stamps application writes when applying extension conflict values', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T14:00:00.000Z'));
    supabaseMock.current = createSupabaseConflictMock({
      conflict: {
        id: 'conflict-1',
        entity: 'applications',
        entity_id: 'application-1',
        field: 'notes',
        local_value: 'Note depuis extension',
        revision: 3,
      },
      application: {
        id: 'application-1',
        stage: 'selected',
        revision: 9,
      },
    });

    const { actions } = await import('../../../src/routes/+page.server');
    const resolveSyncConflict = actions.resolveSyncConflict;
    if (!resolveSyncConflict) {
      throw new Error('resolveSyncConflict action is not registered.');
    }

    const result = await resolveSyncConflict({
      cookies: {},
      request: createConflictResolutionRequest(),
    } as unknown as Parameters<typeof resolveSyncConflict>[0]);

    expect(result).toEqual({ syncConflictSuccess: 'Valeur extension appliquée.' });
    expect(supabaseMock.current.updateValues).toContainEqual({
      table: 'applications',
      values: {
        notes: 'Note depuis extension',
        revision: 10,
        updated_by: 'dashboard',
        updated_at: '2026-05-22T14:00:00.000Z',
      },
    });
    expect(supabaseMock.current.updateValues).toContainEqual({
      table: 'sync_conflicts',
      values: {
        status: 'resolved',
        resolved_at: '2026-05-22T14:00:00.000Z',
        revision: 4,
        updated_by: 'dashboard',
      },
    });
    expect(syncStatusMock.markEntityPendingExtensionPull).toHaveBeenCalledWith(
      supabaseMock.current.supabase,
      'user-1',
      'applications',
      '2026-05-22T14:00:00.000Z'
    );
    expect(pipelineEventsMock.upsertDashboardPipelineEvent).not.toHaveBeenCalled();
  });
});
