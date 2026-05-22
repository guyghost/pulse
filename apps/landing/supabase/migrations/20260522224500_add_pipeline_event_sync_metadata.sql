-- Add sync metadata to append-only application pipeline events.

alter table public.application_pipeline_events
  add column if not exists revision bigint not null default 1 check (revision > 0),
  add column if not exists updated_by text not null default 'system'
    check (updated_by in ('dashboard', 'extension', 'system')),
  add column if not exists updated_at timestamptz not null default now();

update public.application_pipeline_events
set updated_by = created_by
where updated_by = 'system';

drop trigger if exists on_application_pipeline_events_updated
  on public.application_pipeline_events;
create trigger on_application_pipeline_events_updated
  before update on public.application_pipeline_events
  for each row
  execute function public.update_updated_at();
