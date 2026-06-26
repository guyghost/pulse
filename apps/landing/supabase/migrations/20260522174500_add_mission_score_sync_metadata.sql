-- Add sync metadata to mission score snapshots.

alter table public.mission_scores
  add column if not exists revision bigint not null default 1 check (revision > 0),
  add column if not exists updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists on_mission_scores_updated on public.mission_scores;
create trigger on_mission_scores_updated
  before update on public.mission_scores
  for each row
  execute function public.update_updated_at();
