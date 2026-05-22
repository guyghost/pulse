alter table public.application_pipeline_events
  drop constraint if exists application_pipeline_events_from_stage_check;

alter table public.application_pipeline_events
  add constraint application_pipeline_events_from_stage_check
  check (
    from_stage is null or from_stage in (
      'detected',
      'selected',
      'application_prepared',
      'applied',
      'interview',
      'offer',
      'accepted',
      'rejected',
      'archived'
    )
  );
