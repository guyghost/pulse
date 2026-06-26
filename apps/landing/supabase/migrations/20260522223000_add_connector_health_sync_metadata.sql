-- Add sync metadata to connector and profile-extractor health events.

alter table public.connector_health_events
  add column if not exists revision bigint not null default 1 check (revision > 0),
  add column if not exists updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists on_connector_health_events_updated on public.connector_health_events;
create trigger on_connector_health_events_updated
  before update on public.connector_health_events
  for each row
  execute function public.update_updated_at();
