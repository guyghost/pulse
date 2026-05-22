import { describe, expect, it, vi } from 'vitest';
import type { ApplicationPipelineEvent } from '@pulse/domain';
import { upsertDashboardPipelineEvent } from '../../../src/lib/server/pipeline-events';

type SupabaseErrorLike = {
  message: string;
};

type UpsertRow = {
  user_id: string;
  application_id: string;
  from_stage: string | null;
  to_stage: string;
  note: string | null;
  metadata: Record<string, string>;
  occurred_at: string;
  created_by: string;
  client_event_id: string;
};

type UpsertOptions = {
  onConflict: string;
  ignoreDuplicates: boolean;
};

function createSupabaseMock(error: SupabaseErrorLike | null = null) {
  const upsertCalls: Array<{ row: UpsertRow; options: UpsertOptions }> = [];

  return {
    calls: {
      upsertCalls,
    },
    supabase: {
      from: vi.fn((table: string): unknown => {
        if (table !== 'application_pipeline_events') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          upsert: vi.fn((row: UpsertRow, options: UpsertOptions) => {
            upsertCalls.push({ row, options });
            return Promise.resolve({ error });
          }),
        };
      }),
    },
  };
}

const event: ApplicationPipelineEvent = {
  applicationId: 'application-1',
  fromStage: 'detected',
  toStage: 'selected',
  occurredAt: '2026-05-22T10:00:00.000Z',
  createdBy: 'dashboard',
  clientEventId: 'dashboard:select:application-1:1:detected:selected',
  note: 'Mission sélectionnée depuis le feed dashboard.',
};

describe('dashboard pipeline event server helper', () => {
  it('upserts pipeline events by user and client event id', async () => {
    const { supabase, calls } = createSupabaseMock();

    const result = await upsertDashboardPipelineEvent(supabase, 'user-1', event, {
      source: 'dashboard_feed',
      mission_id: 'mission-1',
    });

    expect(result).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith('application_pipeline_events');
    expect(calls.upsertCalls).toEqual([
      {
        row: {
          user_id: 'user-1',
          application_id: 'application-1',
          from_stage: 'detected',
          to_stage: 'selected',
          note: 'Mission sélectionnée depuis le feed dashboard.',
          metadata: {
            source: 'dashboard_feed',
            mission_id: 'mission-1',
          },
          occurred_at: '2026-05-22T10:00:00.000Z',
          created_by: 'dashboard',
          client_event_id: 'dashboard:select:application-1:1:detected:selected',
          revision: 1,
          updated_by: 'dashboard',
        },
        options: {
          onConflict: 'user_id,client_event_id',
          ignoreDuplicates: true,
        },
      },
    ]);
  });

  it('returns false when Supabase rejects the upsert', async () => {
    const { supabase } = createSupabaseMock({ message: 'permission denied' });

    await expect(
      upsertDashboardPipelineEvent(supabase, 'user-1', event, { source: 'dashboard' })
    ).resolves.toBe(false);
  });
});
