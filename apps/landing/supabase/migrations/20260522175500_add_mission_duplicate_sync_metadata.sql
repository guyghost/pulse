-- Add sync metadata to mission duplicate relations.

alter table public.mission_duplicates
  add column if not exists revision bigint not null default 1 check (revision > 0),
  add column if not exists updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists on_mission_duplicates_updated on public.mission_duplicates;
create trigger on_mission_duplicates_updated
  before update on public.mission_duplicates
  for each row
  execute function public.update_updated_at();
