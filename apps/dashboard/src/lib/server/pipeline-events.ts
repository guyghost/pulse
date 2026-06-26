import type { ApplicationPipelineEvent } from '@pulse/domain';

type SupabaseErrorLike = {
  message: string;
};

type SupabaseResult = {
  error: SupabaseErrorLike | null;
};

type PipelineEventUpsertRow = {
  user_id: string;
  application_id: string;
  from_stage: ApplicationPipelineEvent['fromStage'];
  to_stage: ApplicationPipelineEvent['toStage'];
  note: string | null;
  metadata: Record<string, string>;
  occurred_at: string;
  created_by: ApplicationPipelineEvent['createdBy'];
  client_event_id: string;
  revision: number;
  updated_by: ApplicationPipelineEvent['createdBy'];
};

type PipelineEventsTable = {
  upsert(
    row: PipelineEventUpsertRow,
    options: { onConflict: 'user_id,client_event_id'; ignoreDuplicates: true }
  ): Promise<SupabaseResult>;
};

type DashboardPipelineEventsSupabase = {
  from(table: string): unknown;
};

function pipelineEventsTable(supabase: DashboardPipelineEventsSupabase): PipelineEventsTable {
  return supabase.from('application_pipeline_events') as PipelineEventsTable;
}

export async function upsertDashboardPipelineEvent(
  supabase: DashboardPipelineEventsSupabase,
  userId: string,
  event: ApplicationPipelineEvent,
  metadata: Record<string, string>
): Promise<boolean> {
  const result = await pipelineEventsTable(supabase).upsert(
    {
      user_id: userId,
      application_id: event.applicationId,
      from_stage: event.fromStage,
      to_stage: event.toStage,
      note: event.note,
      metadata,
      occurred_at: event.occurredAt,
      created_by: event.createdBy,
      client_event_id: event.clientEventId,
      revision: 1,
      updated_by: event.createdBy,
    },
    { onConflict: 'user_id,client_event_id', ignoreDuplicates: true }
  );

  return !result.error;
}
