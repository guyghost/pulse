alter table public.candidate_profiles
  add column if not exists updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system'));

create table if not exists public.candidate_profile_field_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  profile_id uuid references public.candidate_profiles(id) on delete cascade not null,
  field text not null check (field in ('title', 'summary', 'target_role')),
  current_value text,
  suggested_value text,
  source text references public.mission_sources(id) not null,
  status text not null default 'pending' check (status in ('pending', 'applied', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (
    (status = 'pending' and resolved_at is null)
    or (status in ('applied', 'dismissed') and resolved_at is not null)
  )
);

alter table public.candidate_profile_field_suggestions enable row level security;

drop policy if exists "Users can manage own candidate profile field suggestions"
  on public.candidate_profile_field_suggestions;
create policy "Users can manage own candidate profile field suggestions"
  on public.candidate_profile_field_suggestions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_candidate_profile_field_suggestions_user_pending
  on public.candidate_profile_field_suggestions (user_id, status, created_at desc);

create index if not exists idx_candidate_profile_field_suggestions_profile
  on public.candidate_profile_field_suggestions (profile_id, created_at desc);
