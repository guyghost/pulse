alter table public.application_pipeline_events
  drop constraint if exists application_pipeline_events_transition_check;

alter table public.application_pipeline_events
  add constraint application_pipeline_events_transition_check
  check (
    (from_stage is null and to_stage = 'detected')
    or (from_stage = 'detected' and to_stage in ('selected', 'archived'))
    or (from_stage = 'selected' and to_stage in ('application_prepared', 'applied', 'archived'))
    or (from_stage = 'application_prepared' and to_stage in ('applied', 'archived'))
    or (from_stage = 'applied' and to_stage in ('interview', 'offer', 'rejected', 'archived'))
    or (from_stage = 'interview' and to_stage in ('offer', 'rejected', 'archived'))
    or (from_stage = 'offer' and to_stage in ('accepted', 'rejected', 'archived'))
    or (from_stage = 'accepted' and to_stage = 'archived')
    or (from_stage = 'rejected' and to_stage = 'archived')
    or (from_stage = 'archived' and to_stage = 'detected')
  )
  not valid;
