import { afterEach, describe, expect, it, vi } from 'vitest';

type QueryResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

const supabaseMock = vi.hoisted(() => ({
  current: null as ReturnType<typeof createSupabaseAlertPreferencesMock> | null,
}));

const syncStatusMock = vi.hoisted(() => ({
  markEntityPendingExtensionPull: vi.fn(),
}));

vi.mock('../../../src/lib/server/supabase', () => ({
  createSupabaseServerClient: vi.fn(() => {
    if (!supabaseMock.current) {
      throw new Error('Supabase alert preferences mock not configured.');
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

function createPreferencesSelectBuilder(row: { revision: number } | null) {
  const builder = {
    eq(_column: string, _value: unknown) {
      return builder;
    },
    async maybeSingle<T>(): Promise<QueryResult<T>> {
      return { data: (row ?? null) as T | null, error: null };
    },
  };

  return builder;
}

function createSupabaseAlertPreferencesMock(existingPreferences: { revision: number } | null) {
  const upsertRows: unknown[] = [];
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
      if (table !== 'dashboard_alert_preferences') {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        select: vi.fn(() => createPreferencesSelectBuilder(existingPreferences)),
        upsert: vi.fn(async (row: unknown, _options: unknown) => {
          upsertRows.push(row);
          return { error: null };
        }),
      };
    }),
  };

  return { supabase, upsertRows };
}

function createAlertPreferencesRequest(): Request {
  const formData = new FormData();
  formData.set('enabled', 'on');
  formData.set('scoreThreshold', '80');
  formData.set('minDailyRate', '650');
  formData.set('requiredStacks', 'Svelte, TypeScript, Svelte');
  formData.set('maxResults', '7');

  return new Request('http://localhost/dashboard?/updateAlertPreferences', {
    method: 'POST',
    body: formData,
  });
}

describe('dashboard alert preferences action', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.clearAllMocks();
    supabaseMock.current = null;
  });

  it('stamps alert preference writes and extension pull status with the same time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T15:00:00.000Z'));
    supabaseMock.current = createSupabaseAlertPreferencesMock({ revision: 5 });

    const { actions } = await import('../../../src/routes/+page.server');
    const updateAlertPreferences = actions.updateAlertPreferences;
    if (!updateAlertPreferences) {
      throw new Error('updateAlertPreferences action is not registered.');
    }

    const result = await updateAlertPreferences({
      cookies: {},
      request: createAlertPreferencesRequest(),
    } as unknown as Parameters<typeof updateAlertPreferences>[0]);

    expect(result).toEqual({ alertSuccess: "Préférences d'alertes enregistrées." });
    expect(supabaseMock.current.upsertRows).toEqual([
      {
        user_id: 'user-1',
        enabled: true,
        score_threshold: 80,
        min_daily_rate: 650,
        required_stacks: ['Svelte', 'TypeScript'],
        max_results: 7,
        revision: 6,
        updated_by: 'dashboard',
        updated_at: '2026-05-22T15:00:00.000Z',
      },
    ]);
    expect(syncStatusMock.markEntityPendingExtensionPull).toHaveBeenCalledWith(
      supabaseMock.current.supabase,
      'user-1',
      'alert_preferences',
      '2026-05-22T15:00:00.000Z'
    );
  });
});
