-- Favorite missions synced from the Chrome extension for dashboard display.
-- The extension remains local-first; this table is populated only for signed-in users.

create extension if not exists pgcrypto;

create table if not exists public.favorite_missions (
  user_id uuid references auth.users(id) on delete cascade not null,
  mission_id text not null,
  mission jsonb not null,
  favorited_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, mission_id)
);

alter table public.favorite_missions enable row level security;

drop policy if exists "Users can read own favorite missions" on public.favorite_missions;
create policy "Users can read own favorite missions"
  on public.favorite_missions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own favorite missions" on public.favorite_missions;
create policy "Users can insert own favorite missions"
  on public.favorite_missions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own favorite missions" on public.favorite_missions;
create policy "Users can update own favorite missions"
  on public.favorite_missions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own favorite missions" on public.favorite_missions;
create policy "Users can delete own favorite missions"
  on public.favorite_missions for delete
  using (auth.uid() = user_id);

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_favorite_missions_updated on public.favorite_missions;

create trigger on_favorite_missions_updated
  before update on public.favorite_missions
  for each row
  execute function public.update_updated_at();

create index if not exists idx_favorite_missions_user_favorited
  on public.favorite_missions (user_id, favorited_at desc);
