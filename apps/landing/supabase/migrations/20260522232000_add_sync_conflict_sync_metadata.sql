-- Add sync metadata to mutable conflict rows resolved from the dashboard.

alter table public.sync_conflicts
  add column if not exists revision bigint not null default 1 check (revision > 0),
  add column if not exists updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists on_sync_conflicts_updated on public.sync_conflicts;
create trigger on_sync_conflicts_updated
  before update on public.sync_conflicts
  for each row execute function public.update_updated_at();
