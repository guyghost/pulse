import { afterEach, describe, expect, it, vi } from 'vitest';

type QueryResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type QueryCall = {
  table: string;
  method: 'eq' | 'in' | 'order' | 'limit';
  args: unknown[];
};

const supabaseMock = vi.hoisted(() => ({
  current: null as ReturnType<typeof createSupabaseLoadMock> | null,
}));

vi.mock('../../../src/lib/server/supabase', () => ({
  createSupabaseServerClient: vi.fn(() => {
    if (!supabaseMock.current) {
      throw new Error('Supabase load mock not configured.');
    }
    return supabaseMock.current.supabase;
  }),
}));

vi.mock('$env/dynamic/public', () => ({
  env: {
    PUBLIC_SUPABASE_URL: 'https://supabase.example',
    PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    PUBLIC_LANDING_URL: 'https://missionpulse.app',
  },
}));

function createQueryBuilder(table: string, rows: unknown[], calls: QueryCall[]) {
  const query = {
    select() {
      return query;
    },
    eq(...args: unknown[]) {
      calls.push({ table, method: 'eq', args });
      return query;
    },
    in(...args: unknown[]) {
      calls.push({ table, method: 'in', args });
      return query;
    },
    order(...args: unknown[]) {
      calls.push({ table, method: 'order', args });
      return query;
    },
    limit(...args: unknown[]) {
      calls.push({ table, method: 'limit', args });
      return query;
    },
    async single<T>(): Promise<QueryResult<T>> {
      return { data: (rows[0] ?? null) as T | null, error: null };
    },
    async maybeSingle<T>(): Promise<QueryResult<T>> {
      return { data: (rows[0] ?? null) as T | null, error: null };
    },
    async returns<T>(): Promise<QueryResult<T>> {
      return { data: rows as T, error: null };
    },
  };

  return query;
}

function createSupabaseLoadMock(rowsByTable: Record<string, unknown[]>) {
  const calls: QueryCall[] = [];
  const supabase = {
    auth: {
      getSession: vi.fn(async () => ({
        data: {
          session: {
            user: { id: 'user-1', email: 'user@example.com' },
          },
        },
      })),
    },
    from: vi.fn((table: string) => createQueryBuilder(table, rowsByTable[table] ?? [], calls)),
  };

  return { calls, supabase };
}

describe('connected dashboard load profile import history', () => {
  afterEach(() => {
    vi.resetModules();
    supabaseMock.current = null;
  });

  it('shows failed LinkedIn import history even when no canonical CV exists yet', async () => {
    supabaseMock.current = createSupabaseLoadMock({
      profiles: [
        {
          subscription_status: 'free',
          subscription_period_end: null,
          credit_balance: 0,
        },
      ],
      profile_imports: [
        {
          id: 'import-1',
          source: 'linkedin',
          status: 'error',
          imported_at: '2026-05-22T08:05:00.000Z',
          extractor_version: 'linkedin-v1',
          error_code: 'profile-sync-failed',
          error_message: 'profile write failed',
          field_counts: { experiences: 1, education: 0, skills: 2, links: 1 },
        },
      ],
    });

    const { load } = await import('../../../src/routes/+page.server');
    const data = await load({ cookies: {} } as Parameters<typeof load>[0]);
    if (!data) {
      throw new Error('Expected dashboard load data.');
    }

    expect(data.cv.id).toBe('empty-cv');
    expect(data.cv.imports).toEqual([
      {
        id: 'import-1',
        source: 'linkedin',
        status: 'error',
        importedAt: '2026-05-22T08:05:00.000Z',
        extractorVersion: 'linkedin-v1',
        errorCode: 'profile-sync-failed',
        errorMessage: 'profile write failed',
        fieldCounts: { experiences: 1, education: 0, skills: 2, links: 1 },
      },
    ]);
    expect(supabaseMock.current.calls).toContainEqual({
      table: 'profile_imports',
      method: 'eq',
      args: ['user_id', 'user-1'],
    });
  });
});
