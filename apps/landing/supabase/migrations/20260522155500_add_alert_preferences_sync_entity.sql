alter table public.sync_status
  drop constraint if exists sync_status_entity_check;

alter table public.sync_status
  add constraint sync_status_entity_check
  check (entity in ('missions', 'applications', 'candidate_profile', 'connector_health', 'alert_preferences'));
