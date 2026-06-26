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
  stage?: string;
};

type MissionSelectionRow = {
  id: string;
  title: string;
};

const supabaseMock = vi.hoisted(() => ({
  current: null as ReturnType<typeof createSupabaseApplicationDetailsMock> | null,
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
      throw new Error('Supabase application details mock not configured.');
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

function createSelectBuilder<Row>(row: Row | null) {
  const builder = {
    eq(_column: string, _value: unknown) {
      return builder;
    },
    async single<T>(): Promise<QueryResult<T>> {
      return row
        ? { data: row as T, error: null }
        : { data: null, error: { message: 'not found' } };
    },
    async maybeSingle<T>(): Promise<QueryResult<T>> {
      return { data: (row ?? null) as T | null, error: null };
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
  mission?: MissionSelectionRow | null;
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
      if (table === 'missions') {
        return {
          select: vi.fn(() => createSelectBuilder(input.mission ?? null)),
        };
      }

      if (table === 'applications') {
        return {
          select: vi.fn(() => createSelectBuilder(input.application)),
          update: vi.fn((values: unknown) => {
            updateValues.push(values);
            return createApplicationUpdateBuilder(
              input.updateResult ?? { data: { id: 'application-1' }, error: null },
              updateEqCalls
            );
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
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

function createTransitionRequest(): Request {
  const formData = new FormData();
  formData.set('applicationId', 'application-1');
  formData.set('toStage', 'application_prepared');

  return new Request('http://localhost/dashboard?/transitionApplication', {
    method: 'POST',
    body: formData,
  });
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

  it('stamps canonical application stage updates with the pipeline event time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T11:00:00.000Z'));
    supabaseMock.current = createSupabaseApplicationDetailsMock({
      application: { id: 'application-1', stage: 'selected', revision: 4 },
    });

    const { actions } = await import('../../../src/routes/+page.server');
    const transitionApplication = actions.transitionApplication;
    if (!transitionApplication) {
      throw new Error('transitionApplication action is not registered.');
    }

    const result = await transitionApplication({
      cookies: {},
      request: createTransitionRequest(),
    } as unknown as Parameters<typeof transitionApplication>[0]);

    expect(result).toEqual({ transitionSuccess: 'Candidature passée en application_prepared.' });
    expect(supabaseMock.current.updateValues).toEqual([
      {
        stage: 'application_prepared',
        revision: 5,
        updated_by: 'dashboard',
        archived_at: null,
        updated_at: '2026-05-22T11:00:00.000Z',
      },
    ]);
    expect(pipelineEventsMock.upsertDashboardPipelineEvent).toHaveBeenCalledWith(
      supabaseMock.current.supabase,
      'user-1',
      expect.objectContaining({
        applicationId: 'application-1',
        fromStage: 'selected',
        toStage: 'application_prepared',
        occurredAt: '2026-05-22T11:00:00.000Z',
        createdBy: 'dashboard',
      }),
      { source: 'dashboard' }
    );
    expect(syncStatusMock.markEntityPendingExtensionPull).toHaveBeenCalledWith(
      supabaseMock.current.supabase,
      'user-1',
      'applications',
      '2026-05-22T11:00:00.000Z'
    );
  });

  it('stamps feed selection updates when an existing detected application is selected', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    supabaseMock.current = createSupabaseApplicationDetailsMock({
      mission: { id: 'mission-1', title: 'Mission CRM' },
      application: { id: 'application-1', stage: 'detected', revision: 2 },
    });

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
    expect(supabaseMock.current.updateValues).toEqual([
      {
        stage: 'selected',
        archived_at: null,
        revision: 3,
        updated_by: 'dashboard',
        updated_at: '2026-05-22T12:00:00.000Z',
      },
    ]);
    expect(pipelineEventsMock.upsertDashboardPipelineEvent).toHaveBeenCalledWith(
      supabaseMock.current.supabase,
      'user-1',
      expect.objectContaining({
        applicationId: 'application-1',
        fromStage: 'detected',
        toStage: 'selected',
        occurredAt: '2026-05-22T12:00:00.000Z',
        createdBy: 'dashboard',
      }),
      { source: 'dashboard_feed', mission_id: 'mission-1' }
    );
    expect(syncStatusMock.markEntityPendingExtensionPull).toHaveBeenCalledWith(
      supabaseMock.current.supabase,
      'user-1',
      'applications',
      '2026-05-22T12:00:00.000Z'
    );
  });

  it('stamps feed archive updates when an existing detected application is archived', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T13:00:00.000Z'));
    supabaseMock.current = createSupabaseApplicationDetailsMock({
      mission: { id: 'mission-1', title: 'Mission CRM' },
      application: { id: 'application-1', stage: 'detected', revision: 6 },
    });

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
    expect(supabaseMock.current.updateValues).toEqual([
      {
        stage: 'archived',
        archived_at: '2026-05-22T13:00:00.000Z',
        revision: 7,
        updated_by: 'dashboard',
        updated_at: '2026-05-22T13:00:00.000Z',
      },
    ]);
    expect(pipelineEventsMock.upsertDashboardPipelineEvent).toHaveBeenCalledWith(
      supabaseMock.current.supabase,
      'user-1',
      expect.objectContaining({
        applicationId: 'application-1',
        fromStage: 'detected',
        toStage: 'archived',
        occurredAt: '2026-05-22T13:00:00.000Z',
        createdBy: 'dashboard',
      }),
      { source: 'dashboard_feed', mission_id: 'mission-1' }
    );
    expect(syncStatusMock.markEntityPendingExtensionPull).toHaveBeenCalledWith(
      supabaseMock.current.supabase,
      'user-1',
      'applications',
      '2026-05-22T13:00:00.000Z'
    );
  });
});
