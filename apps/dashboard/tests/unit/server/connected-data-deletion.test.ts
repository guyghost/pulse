import { afterEach, describe, expect, it, vi } from 'vitest';

type DeleteEqCall = {
  table: string;
  column: string;
  value: string;
};

type DeleteInCall = {
  table: string;
  column: string;
  values: string[];
};

type ProfileIdentityRow = {
  id: string;
};

const supabaseMock = vi.hoisted(() => ({
  current: null as ReturnType<typeof createSupabaseDeletionMock> | null,
}));

vi.mock('../../../src/lib/server/supabase', () => ({
  createSupabaseServerClient: vi.fn(() => {
    if (!supabaseMock.current) {
      throw new Error('Supabase deletion mock not configured.');
    }
    return supabaseMock.current.supabase;
  }),
}));

vi.mock('$env/dynamic/public', () => ({
  env: {
    PUBLIC_SUPABASE_URL: 'https://supabase.example',
    PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  },
}));

function createProfileSelectBuilder(rows: ProfileIdentityRow[]) {
  const builder = {
    eq(_column: string, _value: string) {
      return builder;
    },
    async returns<T>() {
      return { data: rows as T, error: null };
    },
  };

  return builder;
}

function createDeleteBuilder(table: string, calls: { eq: DeleteEqCall[]; in: DeleteInCall[] }) {
  return {
    async eq(column: string, value: string) {
      calls.eq.push({ table, column, value });
      return { error: null };
    },
    async in(column: string, values: string[]) {
      calls.in.push({ table, column, values });
      return { error: null };
    },
  };
}

function createSupabaseDeletionMock(profileRows: ProfileIdentityRow[]) {
  const calls: { eq: DeleteEqCall[]; in: DeleteInCall[] } = { eq: [], in: [] };
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
      select: vi.fn(() => createProfileSelectBuilder(profileRows)),
      delete: vi.fn(() => createDeleteBuilder(table, calls)),
    })),
  };

  return { calls, supabase };
}

function createDeleteRequest(confirmation: string): Request {
  const formData = new FormData();
  formData.set('confirmation', confirmation);
  return new Request('http://localhost/dashboard?/deleteConnectedData', {
    method: 'POST',
    body: formData,
  });
}

describe('connected dashboard data deletion action', () => {
  afterEach(() => {
    vi.resetModules();
    supabaseMock.current = null;
  });

  it('deletes every connected table and CV child rows for the signed-in user', async () => {
    supabaseMock.current = createSupabaseDeletionMock([{ id: 'profile-1' }, { id: 'profile-2' }]);

    const { actions } = await import('../../../src/routes/+page.server');
    const deleteConnectedData = actions.deleteConnectedData;
    if (!deleteConnectedData) {
      throw new Error('deleteConnectedData action is not registered.');
    }

    const result = await deleteConnectedData({
      cookies: {},
      request: createDeleteRequest('SUPPRIMER'),
    } as unknown as Parameters<typeof deleteConnectedData>[0]);

    expect(result).toEqual({ privacySuccess: 'Données connectées supprimées.' });
    expect(supabaseMock.current.calls.in).toEqual([
      {
        table: 'candidate_experiences',
        column: 'profile_id',
        values: ['profile-1', 'profile-2'],
      },
      {
        table: 'candidate_education',
        column: 'profile_id',
        values: ['profile-1', 'profile-2'],
      },
      {
        table: 'candidate_skills',
        column: 'profile_id',
        values: ['profile-1', 'profile-2'],
      },
      {
        table: 'candidate_links',
        column: 'profile_id',
        values: ['profile-1', 'profile-2'],
      },
    ]);
    expect(supabaseMock.current.calls.eq).toEqual([
      { table: 'generated_application_assets', column: 'user_id', value: 'user-1' },
      { table: 'application_pipeline_events', column: 'user_id', value: 'user-1' },
      { table: 'applications', column: 'user_id', value: 'user-1' },
      { table: 'mission_duplicates', column: 'user_id', value: 'user-1' },
      { table: 'missions', column: 'user_id', value: 'user-1' },
      { table: 'candidate_profile_field_suggestions', column: 'user_id', value: 'user-1' },
      { table: 'candidate_profiles', column: 'user_id', value: 'user-1' },
      { table: 'profile_imports', column: 'user_id', value: 'user-1' },
      { table: 'connector_health_events', column: 'user_id', value: 'user-1' },
      { table: 'dashboard_alert_preferences', column: 'user_id', value: 'user-1' },
      { table: 'sync_conflicts', column: 'user_id', value: 'user-1' },
      { table: 'sync_status', column: 'user_id', value: 'user-1' },
      { table: 'extension_devices', column: 'user_id', value: 'user-1' },
      { table: 'favorite_missions', column: 'user_id', value: 'user-1' },
    ]);
  });

  it('rejects deletion before touching Supabase when confirmation is invalid', async () => {
    supabaseMock.current = createSupabaseDeletionMock([]);

    const { actions } = await import('../../../src/routes/+page.server');
    const deleteConnectedData = actions.deleteConnectedData;
    if (!deleteConnectedData) {
      throw new Error('deleteConnectedData action is not registered.');
    }

    const result = await deleteConnectedData({
      cookies: {},
      request: createDeleteRequest('DELETE'),
    } as unknown as Parameters<typeof deleteConnectedData>[0]);

    expect(result).toMatchObject({
      status: 400,
      data: { privacyError: 'Confirmation invalide.' },
    });
    expect(supabaseMock.current.calls.eq).toEqual([]);
    expect(supabaseMock.current.calls.in).toEqual([]);
  });
});
