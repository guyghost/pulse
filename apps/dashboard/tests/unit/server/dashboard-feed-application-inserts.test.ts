import { afterEach, describe, expect, it, vi } from 'vitest';

type QueryResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type MissionSelectionRow = {
  id: string;
  title: string;
};

const supabaseMock = vi.hoisted(() => ({
  current: null as ReturnType<typeof createSupabaseFeedInsertMock> | null,
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
      throw new Error('Supabase feed insert mock not configured.');
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

function createMissionSelectBuilder(row: MissionSelectionRow) {
  const builder = {
    eq(_column: string, _value: unknown) {
      return builder;
    },
    async single<T>(): Promise<QueryResult<T>> {
      return { data: row as T, error: null };
    },
  };

  return builder;
}

function createApplicationSelectBuilder() {
  const builder = {
    eq(_column: string, _value: unknown) {
      return builder;
    },
    async maybeSingle<T>(): Promise<QueryResult<T>> {
      return { data: null, error: null };
    },
  };

  return builder;
}

function createApplicationInsertBuilder(result: QueryResult<{ id: string }>) {
  const builder = {
    select(_columns: string) {
      return builder;
    },
    async single<T>(): Promise<QueryResult<T>> {
      return result as QueryResult<T>;
    },
  };

  return builder;
}

function createSupabaseFeedInsertMock() {
  const applicationInsertRows: unknown[] = [];
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
      if (table === 'missions') {
        return {
          select: vi.fn(() =>
            createMissionSelectBuilder({ id: 'mission-1', title: 'Mission CRM' })
          ),
        };
      }

      if (table === 'applications') {
        return {
          select: vi.fn(() => createApplicationSelectBuilder()),
          insert: vi.fn((row: unknown) => {
            applicationInsertRows.push(row);
            return createApplicationInsertBuilder({
              data: { id: 'application-1' },
              error: null,
            });
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { applicationInsertRows, supabase };
}

function createSelectMissionRequest(): Request {
  const formData = new FormData();
  formData.set('missionId', 'mission-1');

  return new Request('http://localhost/dashboard?/selectMission', {
    method: 'POST',
    body: formData,
  });
}

function createArchiveMissionRequest(): Request {
  const formData = new FormData();
  formData.set('missionId', 'mission-1');

  return new Request('http://localhost/dashboard?/archiveMission', {
    method: 'POST',
    body: formData,
  });
}

describe('dashboard feed application inserts', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.clearAllMocks();
    supabaseMock.current = null;
  });

  it('stamps newly selected applications with the selected pipeline event time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T16:00:00.000Z'));
    supabaseMock.current = createSupabaseFeedInsertMock();

    const { actions } = await import('../../../src/routes/+page.server');
    const selectMission = actions.selectMission;
    if (!selectMission) {
      throw new Error('selectMission action is not registered.');
    }

    const result = await selectMission({
      cookies: {},
      request: createSelectMissionRequest(),
    } as unknown as Parameters<typeof selectMission>[0]);

    expect(result).toEqual({ selectionSuccess: 'Mission sélectionnée: Mission CRM.' });
    expect(supabaseMock.current.applicationInsertRows).toEqual([
      {
        user_id: 'user-1',
        mission_id: 'mission-1',
        stage: 'selected',
        notes: '',
        revision: 1,
        updated_by: 'dashboard',
        updated_at: '2026-05-22T16:00:00.000Z',
      },
    ]);
    expect(pipelineEventsMock.upsertDashboardPipelineEvent).toHaveBeenCalledTimes(2);
    expect(pipelineEventsMock.upsertDashboardPipelineEvent).toHaveBeenCalledWith(
      supabaseMock.current.supabase,
      'user-1',
      expect.objectContaining({
        applicationId: 'application-1',
        fromStage: 'detected',
        toStage: 'selected',
        occurredAt: '2026-05-22T16:00:00.000Z',
      }),
      { source: 'dashboard_feed', mission_id: 'mission-1' }
    );
    expect(syncStatusMock.markEntityPendingExtensionPull).toHaveBeenCalledWith(
      supabaseMock.current.supabase,
      'user-1',
      'applications',
      '2026-05-22T16:00:00.000Z'
    );
  });

  it('stamps newly archived applications with the archive pipeline event time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T17:00:00.000Z'));
    supabaseMock.current = createSupabaseFeedInsertMock();

    const { actions } = await import('../../../src/routes/+page.server');
    const archiveMission = actions.archiveMission;
    if (!archiveMission) {
      throw new Error('archiveMission action is not registered.');
    }

    const result = await archiveMission({
      cookies: {},
      request: createArchiveMissionRequest(),
    } as unknown as Parameters<typeof archiveMission>[0]);

    expect(result).toEqual({ selectionSuccess: 'Mission archivée: Mission CRM.' });
    expect(supabaseMock.current.applicationInsertRows).toEqual([
      {
        user_id: 'user-1',
        mission_id: 'mission-1',
        stage: 'archived',
        notes: '',
        revision: 1,
        updated_by: 'dashboard',
        archived_at: '2026-05-22T17:00:00.000Z',
        updated_at: '2026-05-22T17:00:00.000Z',
      },
    ]);
    expect(pipelineEventsMock.upsertDashboardPipelineEvent).toHaveBeenCalledTimes(2);
    expect(pipelineEventsMock.upsertDashboardPipelineEvent).toHaveBeenCalledWith(
      supabaseMock.current.supabase,
      'user-1',
      expect.objectContaining({
        applicationId: 'application-1',
        fromStage: 'detected',
        toStage: 'archived',
        occurredAt: '2026-05-22T17:00:00.000Z',
      }),
      { source: 'dashboard_feed', mission_id: 'mission-1' }
    );
    expect(syncStatusMock.markEntityPendingExtensionPull).toHaveBeenCalledWith(
      supabaseMock.current.supabase,
      'user-1',
      'applications',
      '2026-05-22T17:00:00.000Z'
    );
  });
});
