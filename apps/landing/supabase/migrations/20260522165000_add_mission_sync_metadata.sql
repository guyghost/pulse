alter table public.missions
  add column if not exists revision bigint not null default 1,
  add column if not exists updated_by text not null default 'extension';

alter table public.missions
  drop constraint if exists missions_revision_check;

alter table public.missions
  add constraint missions_revision_check
  check (revision > 0);

alter table public.missions
  drop constraint if exists missions_updated_by_check;

alter table public.missions
  add constraint missions_updated_by_check
  check (updated_by in ('dashboard', 'extension', 'system'));
