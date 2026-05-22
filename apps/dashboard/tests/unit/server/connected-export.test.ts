import { describe, expect, it, vi } from 'vitest';

type QueryResult = {
  data: unknown[] | null;
  error: { message: string } | null;
};

type EqCall = {
  table: string;
  column: string;
  value: string;
};

type InCall = {
  table: string;
  column: string;
  values: string[];
};

const supabaseMock = vi.hoisted(() => ({
  current: null as ReturnType<typeof createSupabaseRouteMock> | null,
}));

vi.mock('../../../src/lib/server/supabase', () => ({
  createSupabaseServerClient: vi.fn(() => {
    if (!supabaseMock.current) {
      throw new Error('Supabase mock not configured.');
    }
    return supabaseMock.current.supabase;
  }),
}));

function createThenableQuery(
  result: QueryResult,
  calls: { eq: EqCall[]; in: InCall[] },
  table: string
) {
  const query = {
    eq(column: string, value: string) {
      calls.eq.push({ table, column, value });
      return query;
    },
    in(column: string, values: string[]) {
      calls.in.push({ table, column, values });
      return query;
    },
    then: Promise.resolve(result).then.bind(Promise.resolve(result)),
  };

  return query;
}

function createSupabaseRouteMock(rowsByTable: Record<string, unknown[]>) {
  const calls: { eq: EqCall[]; in: InCall[] } = { eq: [], in: [] };
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
    from: vi.fn((table: string) => ({
      select: vi.fn(() =>
        createThenableQuery({ data: rowsByTable[table] ?? [], error: null }, calls, table)
      ),
    })),
  };

  return { calls, supabase };
}

describe('connected dashboard data export', () => {
  it('exports mission scores associated with the user mission rows', async () => {
    supabaseMock.current = createSupabaseRouteMock({
      candidate_profiles: [{ id: 'profile-1', user_id: 'user-1' }],
      missions: [
        { id: 'mission-1', user_id: 'user-1', title: 'Lead Svelte' },
        { id: 'mission-2', user_id: 'user-1', title: 'Architecte frontend' },
      ],
      mission_scores: [
        { mission_id: 'mission-1', total_score: 92 },
        { mission_id: 'mission-2', total_score: 86 },
      ],
      candidate_skills: [{ profile_id: 'profile-1', skill: 'Svelte' }],
    });

    const { GET } = await import('../../../src/routes/export.json/+server');
    const response = await GET({ cookies: {} } as unknown as Parameters<typeof GET>[0]);
    const payload = (await response.json()) as {
      userId: string;
      tables: {
        missions: unknown[];
        mission_scores: unknown[];
        candidate_profiles: unknown[];
        candidate_skills: unknown[];
      };
    };

    expect(response.status).toBe(200);
    expect(payload.userId).toBe('user-1');
    expect(payload.tables.missions).toEqual([
      { id: 'mission-1', user_id: 'user-1', title: 'Lead Svelte' },
      { id: 'mission-2', user_id: 'user-1', title: 'Architecte frontend' },
    ]);
    expect(payload.tables.mission_scores).toEqual([
      { mission_id: 'mission-1', total_score: 92 },
      { mission_id: 'mission-2', total_score: 86 },
    ]);
    expect(payload.tables.candidate_profiles).toEqual([{ id: 'profile-1', user_id: 'user-1' }]);
    expect(payload.tables.candidate_skills).toEqual([{ profile_id: 'profile-1', skill: 'Svelte' }]);
    expect(supabaseMock.current.calls.in).toContainEqual({
      table: 'mission_scores',
      column: 'mission_id',
      values: ['mission-1', 'mission-2'],
    });
  });
});
