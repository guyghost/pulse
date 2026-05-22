import { afterEach, describe, expect, it, vi } from 'vitest';

type QueryResult<T> = {
  data: T | null;
  error: { code?: string; message: string } | null;
};

type EqCall = {
  column: string;
  value: unknown;
};

type ApplicationDetailsRow = {
  id: string;
  revision: number;
};

const supabaseMock = vi.hoisted(() => ({
  current: null as ReturnType<typeof createSupabaseApplicationDetailsMock> | null,
}));

const syncStatusMock = vi.hoisted(() => ({
  markEntityPendingExtensionPull: vi.fn(),
}));

vi.mock('../../../src/lib/server/supabase', () => ({
  createSupabaseServerClient: vi.fn(() => {
    if (!supabaseMock.current) {
      throw new Error('Supabase application details mock not configured.');
    }
    return supabaseMock.current.supabase;
  }),
}));

vi.mock('../../../src/lib/server/sync-status', () => ({
  markEntityPendingExtensionPull: syncStatusMock.markEntityPendingExtensionPull,
}));

vi.mock('$env/dynamic/public', () => ({
  env: {
    PUBLIC_SUPABASE_URL: 'https://supabase.example',
    PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  },
}));

function createApplicationSelectBuilder(row: ApplicationDetailsRow | null) {
  const builder = {
    eq(_column: string, _value: unknown) {
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

function createApplicationUpdateBuilder(result: QueryResult<{ id: string }>, eqCalls: EqCall[]) {
  const builder = {
    eq(column: string, value: unknown) {
      eqCalls.push({ column, value });
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

function createSupabaseApplicationDetailsMock(input: {
  application: ApplicationDetailsRow | null;
  updateResult?: QueryResult<{ id: string }>;
}) {
  const updateEqCalls: EqCall[] = [];
  const updateValues: unknown[] = [];
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
      if (table !== 'applications') {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        select: vi.fn(() => createApplicationSelectBuilder(input.application)),
        update: vi.fn((values: unknown) => {
          updateValues.push(values);
          return createApplicationUpdateBuilder(
            input.updateResult ?? { data: { id: 'application-1' }, error: null },
            updateEqCalls
          );
        }),
      };
    }),
  };

  return { supabase, updateEqCalls, updateValues };
}

function createDetailsRequest(): Request {
  const formData = new FormData();
  formData.set('applicationId', 'application-1');
  formData.set('notes', '  Relancer lundi  ');
  formData.set('userRating', '4');
  formData.set('nextActionDate', '2026-05-25');

  return new Request('http://localhost/dashboard?/updateApplicationDetails', {
    method: 'POST',
    body: formData,
  });
}

describe('dashboard application details action', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.clearAllMocks();
    supabaseMock.current = null;
  });

  it('writes dashboard sync metadata when notes, rating, or next action changes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T10:00:00.000Z'));
    supabaseMock.current = createSupabaseApplicationDetailsMock({
      application: { id: 'application-1', revision: 7 },
    });

    const { actions } = await import('../../../src/routes/+page.server');
    const updateApplicationDetails = actions.updateApplicationDetails;
    if (!updateApplicationDetails) {
      throw new Error('updateApplicationDetails action is not registered.');
    }

    const result = await updateApplicationDetails({
      cookies: {},
      request: createDetailsRequest(),
    } as unknown as Parameters<typeof updateApplicationDetails>[0]);

    expect(result).toEqual({ detailsSuccess: 'Détails de candidature enregistrés.' });
    expect(supabaseMock.current.updateValues).toEqual([
      {
        notes: 'Relancer lundi',
        user_rating: 4,
        next_action_at: '2026-05-25T12:00:00.000Z',
        updated_by: 'dashboard',
        revision: 8,
        updated_at: '2026-05-22T10:00:00.000Z',
      },
    ]);
    expect(supabaseMock.current.updateEqCalls).toEqual([
      { column: 'id', value: 'application-1' },
      { column: 'user_id', value: 'user-1' },
      { column: 'revision', value: 7 },
    ]);
    expect(syncStatusMock.markEntityPendingExtensionPull).toHaveBeenCalledWith(
      supabaseMock.current.supabase,
      'user-1',
      'applications',
      '2026-05-22T10:00:00.000Z'
    );
  });
});
