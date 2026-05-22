-- ============================================
-- MissionPulse — Supabase Schema
-- Run this in the Supabase SQL Editor
-- ============================================

-- 1. Profiles table (linked to auth.users)
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  subscription_status text not null default 'free'
    check (subscription_status in ('free', 'premium')),
  subscription_period_end timestamptz,
  credit_balance integer not null default 0 check (credit_balance >= 0),
  ls_subscription_id text,
  ls_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Credits ledger
create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  amount integer not null check (amount <> 0),
  reason text not null check (reason in ('purchase', 'premium_monthly_bonus', 'generation', 'adjustment')),
  source text not null,
  lemon_order_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Favorite missions synced from the Chrome extension for dashboard display.
-- The extension remains local-first; this table is populated only for signed-in users.
create table if not exists public.favorite_missions (
  user_id uuid references auth.users(id) on delete cascade not null,
  mission_id text not null,
  mission jsonb not null,
  favorited_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, mission_id)
);

-- 2. Enable RLS
alter table public.profiles enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.favorite_missions enable row level security;

-- 3. RLS policies

-- Users can read their own profile
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Subscription and credit fields are service-owned.
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can read own credit transactions"
  on public.credit_transactions for select
  using (auth.uid() = user_id);

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

-- Service role can do anything (for webhook handler)
-- Note: service_role bypasses RLS by default in Supabase,
-- so no explicit policy is needed for the admin client.

-- 4. Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

-- Drop trigger if exists (idempotent)
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- 5. Auto-update updated_at on profile changes
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_profile_updated on public.profiles;

create trigger on_profile_updated
  before update on public.profiles
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_favorite_missions_updated on public.favorite_missions;

create trigger on_favorite_missions_updated
  before update on public.favorite_missions
  for each row
  execute function public.update_updated_at();

-- 6. Index for webhook lookups
create index if not exists idx_profiles_ls_subscription
  on public.profiles (ls_subscription_id)
  where ls_subscription_id is not null;

create index if not exists idx_profiles_ls_customer
  on public.profiles (ls_customer_id)
  where ls_customer_id is not null;

create unique index if not exists idx_credit_transactions_lemon_order
  on public.credit_transactions (lemon_order_id)
  where lemon_order_id is not null;

create unique index if not exists idx_credit_transactions_premium_period
  on public.credit_transactions (user_id, (metadata->>'period'))
  where reason = 'premium_monthly_bonus';

create index if not exists idx_credit_transactions_user_created
  on public.credit_transactions (user_id, created_at desc);

create index if not exists idx_favorite_missions_user_favorited
  on public.favorite_missions (user_id, favorited_at desc);

create or replace function public.grant_premium_monthly_credits(
  p_user_id uuid,
  p_period text,
  p_amount integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  if p_amount <= 0 then
    raise exception 'Credit amount must be positive';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_user_id
      and subscription_status = 'premium'
      and (subscription_period_end is null or subscription_period_end > now())
  ) then
    select credit_balance into new_balance from public.profiles where id = p_user_id;
    return coalesce(new_balance, 0);
  end if;

  insert into public.credit_transactions (user_id, amount, reason, source, metadata)
  values (
    p_user_id,
    p_amount,
    'premium_monthly_bonus',
    'premium_monthly_bonus',
    jsonb_build_object('period', p_period)
  );

  update public.profiles
  set credit_balance = credit_balance + p_amount
  where id = p_user_id
  returning credit_balance into new_balance;

  return new_balance;
exception
  when unique_violation then
    select credit_balance into new_balance from public.profiles where id = p_user_id;
    return coalesce(new_balance, 0);
end;
$$;

create or replace function public.consume_generation_credit(
  p_user_id uuid,
  p_source text,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  update public.profiles
  set credit_balance = credit_balance - 1
  where id = p_user_id
    and credit_balance > 0
  returning credit_balance into new_balance;

  if new_balance is null then
    raise exception 'Insufficient credits';
  end if;

  insert into public.credit_transactions (user_id, amount, reason, source, metadata)
  values (p_user_id, -1, 'generation', p_source, coalesce(p_metadata, '{}'::jsonb));

  return new_balance;
end;
$$;

create or replace function public.refund_generation_credit(
  p_user_id uuid,
  p_source text,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  insert into public.credit_transactions (user_id, amount, reason, source, metadata)
  values (p_user_id, 1, 'adjustment', p_source, coalesce(p_metadata, '{}'::jsonb));

  update public.profiles
  set credit_balance = credit_balance + 1
  where id = p_user_id
  returning credit_balance into new_balance;

  return coalesce(new_balance, 0);
end;
$$;

create or replace function public.add_credits_from_purchase(
  p_user_id uuid,
  p_amount integer,
  p_lemon_order_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  if p_amount <= 0 then
    raise exception 'Credit amount must be positive';
  end if;

  insert into public.credit_transactions (user_id, amount, reason, source, lemon_order_id, metadata)
  values (p_user_id, p_amount, 'purchase', 'lemon_squeezy', p_lemon_order_id, coalesce(p_metadata, '{}'::jsonb));

  update public.profiles
  set credit_balance = credit_balance + p_amount
  where id = p_user_id
  returning credit_balance into new_balance;

  if new_balance is null then
    insert into public.profiles (id, credit_balance)
    values (p_user_id, p_amount)
    returning credit_balance into new_balance;
  end if;

  return new_balance;
exception
  when unique_violation then
    select credit_balance into new_balance from public.profiles where id = p_user_id;
    return coalesce(new_balance, 0);
end;
$$;

revoke execute on function public.grant_premium_monthly_credits(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.consume_generation_credit(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.refund_generation_credit(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.add_credits_from_purchase(uuid, integer, text, jsonb) from public, anon, authenticated;

grant execute on function public.grant_premium_monthly_credits(uuid, text, integer) to service_role;
grant execute on function public.consume_generation_credit(uuid, text, jsonb) to service_role;
grant execute on function public.refund_generation_credit(uuid, text, jsonb) to service_role;
grant execute on function public.add_credits_from_purchase(uuid, integer, text, jsonb) to service_role;

-- ============================================
-- Connected dashboard product schema
-- ============================================

create table if not exists public.mission_sources (
  id text primary key,
  label text not null,
  kind text not null check (kind in ('mission', 'profile', 'both')),
  created_at timestamptz not null default now()
);

insert into public.mission_sources (id, label, kind)
values
  ('free-work', 'Free-Work', 'mission'),
  ('lehibou', 'LeHibou', 'mission'),
  ('hiway', 'Hiway', 'mission'),
  ('collective', 'Collective', 'mission'),
  ('cherry-pick', 'Cherry Pick', 'mission'),
  ('linkedin', 'LinkedIn', 'profile'),
  ('malt', 'Malt', 'both'),
  ('other', 'Autre', 'both')
on conflict (id) do update
set
  label = excluded.label,
  kind = excluded.kind;

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  source text references public.mission_sources(id) not null,
  external_id text not null,
  canonical_key text not null,
  title text not null,
  client text,
  description text not null,
  stack text[] not null default '{}',
  tjm integer check (tjm is null or tjm >= 0),
  location text,
  remote text check (remote is null or remote in ('full', 'hybrid', 'onsite')),
  duration text,
  start_date date,
  published_at timestamptz,
  scraped_at timestamptz not null,
  url text not null,
  raw_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);

create table if not exists public.mission_scores (
  mission_id uuid primary key references public.missions(id) on delete cascade,
  deterministic_score integer not null check (deterministic_score between 0 and 100),
  semantic_score integer check (semantic_score is null or semantic_score between 0 and 100),
  total_score integer not null check (total_score between 0 and 100),
  grade text,
  criteria jsonb not null default '{}'::jsonb,
  semantic_reason text,
  scorer_version text not null,
  scored_at timestamptz not null
);

create table if not exists public.mission_duplicates (
  user_id uuid references auth.users(id) on delete cascade not null,
  canonical_mission_id uuid references public.missions(id) on delete cascade not null,
  duplicate_mission_id uuid references public.missions(id) on delete cascade not null,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  reason text not null,
  created_at timestamptz not null default now(),
  primary key (canonical_mission_id, duplicate_mission_id),
  check (canonical_mission_id <> duplicate_mission_id)
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  mission_id uuid references public.missions(id) on delete cascade not null,
  stage text not null check (
    stage in (
      'detected',
      'selected',
      'application_prepared',
      'applied',
      'interview',
      'offer',
      'accepted',
      'rejected',
      'archived'
    )
  ),
  user_rating integer check (user_rating is null or user_rating between 1 and 5),
  notes text not null default '',
  next_action_at timestamptz,
  applied_at timestamptz,
  archived_at timestamptz,
  rejected_reason text,
  accepted_terms jsonb not null default '{}'::jsonb,
  revision bigint not null default 1 check (revision > 0),
  updated_by text not null check (updated_by in ('dashboard', 'extension', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, mission_id)
);

create table if not exists public.application_pipeline_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  application_id uuid references public.applications(id) on delete cascade not null,
  from_stage text,
  to_stage text not null check (
    to_stage in (
      'detected',
      'selected',
      'application_prepared',
      'applied',
      'interview',
      'offer',
      'accepted',
      'rejected',
      'archived'
    )
  ),
  note text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_by text not null check (created_by in ('dashboard', 'extension', 'system')),
  client_event_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, client_event_id)
);

create table if not exists public.generated_application_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  application_id uuid references public.applications(id) on delete cascade not null,
  client_asset_id text,
  type text not null check (type in ('pitch', 'cover_message', 'cv_summary')),
  content text not null,
  model text not null,
  credit_transaction_id uuid references public.credit_transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, client_asset_id)
);

create table if not exists public.candidate_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  summary text not null default '',
  location text,
  target_role text,
  tjm_min integer check (tjm_min is null or tjm_min >= 0),
  tjm_max integer check (tjm_max is null or tjm_max >= 0),
  remote_preference text check (
    remote_preference is null or remote_preference in ('full', 'hybrid', 'onsite', 'any')
  ),
  seniority text check (seniority is null or seniority in ('junior', 'confirmed', 'senior')),
  completeness integer not null default 0 check (completeness between 0 and 100),
  revision bigint not null default 1 check (revision > 0),
  updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  check (tjm_min is null or tjm_max is null or tjm_min <= tjm_max)
);

create table if not exists public.candidate_experiences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.candidate_profiles(id) on delete cascade not null,
  title text not null,
  company text,
  location text,
  start_date date,
  end_date date,
  is_current boolean not null default false,
  description text not null default '',
  skills text[] not null default '{}',
  source text references public.mission_sources(id) not null,
  source_external_id text,
  position_index integer not null default 0,
  check (end_date is null or start_date is null or start_date <= end_date)
);

create table if not exists public.candidate_education (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.candidate_profiles(id) on delete cascade not null,
  school text not null,
  degree text,
  field text,
  start_date date,
  end_date date,
  description text not null default '',
  source text references public.mission_sources(id) not null,
  position_index integer not null default 0,
  check (end_date is null or start_date is null or start_date <= end_date)
);

create table if not exists public.candidate_skills (
  profile_id uuid references public.candidate_profiles(id) on delete cascade not null,
  skill text not null,
  source text references public.mission_sources(id) not null,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  primary key (profile_id, skill)
);

create table if not exists public.candidate_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.candidate_profiles(id) on delete cascade not null,
  label text not null,
  url text not null,
  source text references public.mission_sources(id) not null
);

create table if not exists public.profile_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  source text references public.mission_sources(id) not null,
  status text not null check (status in ('success', 'partial', 'error')),
  imported_at timestamptz not null,
  extractor_version text not null,
  error_code text,
  error_message text,
  raw_hash text,
  field_counts jsonb not null default '{}'::jsonb
);

create table if not exists public.extension_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  install_id text not null,
  browser text,
  extension_version text not null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, install_id)
);

create table if not exists public.sync_status (
  user_id uuid references auth.users(id) on delete cascade not null,
  device_id uuid references public.extension_devices(id) on delete cascade not null,
  entity text not null check (
    entity in ('missions', 'applications', 'candidate_profile', 'connector_health')
  ),
  last_pull_at timestamptz,
  last_push_at timestamptz,
  pending_upload_count integer not null default 0 check (pending_upload_count >= 0),
  pending_download_count integer not null default 0 check (pending_download_count >= 0),
  last_error_code text,
  last_error_message text,
  retry_after_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (device_id, entity)
);

create table if not exists public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  device_id uuid references public.extension_devices(id) on delete set null,
  entity text not null check (entity in ('applications', 'candidate_profile')),
  entity_id uuid not null,
  field text not null,
  local_value text,
  remote_value text,
  local_updated_by text not null check (local_updated_by in ('dashboard', 'extension', 'system')),
  remote_updated_by text not null check (remote_updated_by in ('dashboard', 'extension', 'system')),
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  detected_at timestamptz not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

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

create table if not exists public.connector_health_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  device_id uuid references public.extension_devices(id) on delete set null,
  source text references public.mission_sources(id) not null,
  status text not null check (
    status in ('ready', 'needs_permission', 'needs_session', 'blocked', 'error', 'syncing')
  ),
  error_code text,
  error_message text,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null
);

alter table public.mission_sources enable row level security;
alter table public.missions enable row level security;
alter table public.mission_scores enable row level security;
alter table public.mission_duplicates enable row level security;
alter table public.applications enable row level security;
alter table public.application_pipeline_events enable row level security;
alter table public.generated_application_assets enable row level security;
alter table public.candidate_profiles enable row level security;
alter table public.candidate_experiences enable row level security;
alter table public.candidate_education enable row level security;
alter table public.candidate_skills enable row level security;
alter table public.candidate_links enable row level security;
alter table public.profile_imports enable row level security;
alter table public.extension_devices enable row level security;
alter table public.sync_status enable row level security;
alter table public.sync_conflicts enable row level security;
alter table public.candidate_profile_field_suggestions enable row level security;
alter table public.connector_health_events enable row level security;

drop policy if exists "Anyone can read mission sources" on public.mission_sources;
create policy "Anyone can read mission sources"
  on public.mission_sources for select
  using (true);

drop policy if exists "Users can manage own missions" on public.missions;
create policy "Users can manage own missions"
  on public.missions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage scores for own missions" on public.mission_scores;
create policy "Users can manage scores for own missions"
  on public.mission_scores for all
  using (
    exists (
      select 1
      from public.missions
      where missions.id = mission_scores.mission_id
        and missions.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.missions
      where missions.id = mission_scores.mission_id
        and missions.user_id = auth.uid()
    )
  );

drop policy if exists "Users can manage own mission duplicates" on public.mission_duplicates;
create policy "Users can manage own mission duplicates"
  on public.mission_duplicates for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage own applications" on public.applications;
create policy "Users can manage own applications"
  on public.applications for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage own application events" on public.application_pipeline_events;
create policy "Users can manage own application events"
  on public.application_pipeline_events for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage own generated application assets" on public.generated_application_assets;
create policy "Users can manage own generated application assets"
  on public.generated_application_assets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage own candidate profiles" on public.candidate_profiles;
create policy "Users can manage own candidate profiles"
  on public.candidate_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage own candidate experiences" on public.candidate_experiences;
create policy "Users can manage own candidate experiences"
  on public.candidate_experiences for all
  using (
    exists (
      select 1
      from public.candidate_profiles
      where candidate_profiles.id = candidate_experiences.profile_id
        and candidate_profiles.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.candidate_profiles
      where candidate_profiles.id = candidate_experiences.profile_id
        and candidate_profiles.user_id = auth.uid()
    )
  );

drop policy if exists "Users can manage own candidate education" on public.candidate_education;
create policy "Users can manage own candidate education"
  on public.candidate_education for all
  using (
    exists (
      select 1
      from public.candidate_profiles
      where candidate_profiles.id = candidate_education.profile_id
        and candidate_profiles.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.candidate_profiles
      where candidate_profiles.id = candidate_education.profile_id
        and candidate_profiles.user_id = auth.uid()
    )
  );

drop policy if exists "Users can manage own candidate skills" on public.candidate_skills;
create policy "Users can manage own candidate skills"
  on public.candidate_skills for all
  using (
    exists (
      select 1
      from public.candidate_profiles
      where candidate_profiles.id = candidate_skills.profile_id
        and candidate_profiles.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.candidate_profiles
      where candidate_profiles.id = candidate_skills.profile_id
        and candidate_profiles.user_id = auth.uid()
    )
  );

drop policy if exists "Users can manage own candidate links" on public.candidate_links;
create policy "Users can manage own candidate links"
  on public.candidate_links for all
  using (
    exists (
      select 1
      from public.candidate_profiles
      where candidate_profiles.id = candidate_links.profile_id
        and candidate_profiles.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.candidate_profiles
      where candidate_profiles.id = candidate_links.profile_id
        and candidate_profiles.user_id = auth.uid()
    )
  );

drop policy if exists "Users can manage own profile imports" on public.profile_imports;
create policy "Users can manage own profile imports"
  on public.profile_imports for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage own extension devices" on public.extension_devices;
create policy "Users can manage own extension devices"
  on public.extension_devices for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage own sync status" on public.sync_status;
create policy "Users can manage own sync status"
  on public.sync_status for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage own sync conflicts" on public.sync_conflicts;
create policy "Users can manage own sync conflicts"
  on public.sync_conflicts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage own candidate profile field suggestions"
  on public.candidate_profile_field_suggestions;
create policy "Users can manage own candidate profile field suggestions"
  on public.candidate_profile_field_suggestions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage own connector health events" on public.connector_health_events;
create policy "Users can manage own connector health events"
  on public.connector_health_events for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists on_missions_updated on public.missions;
create trigger on_missions_updated
  before update on public.missions
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_applications_updated on public.applications;
create trigger on_applications_updated
  before update on public.applications
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_candidate_profiles_updated on public.candidate_profiles;
create trigger on_candidate_profiles_updated
  before update on public.candidate_profiles
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_sync_status_updated on public.sync_status;
create trigger on_sync_status_updated
  before update on public.sync_status
  for each row
  execute function public.update_updated_at();

create index if not exists idx_missions_user_scraped
  on public.missions (user_id, scraped_at desc);

create index if not exists idx_missions_user_canonical
  on public.missions (user_id, canonical_key);

create index if not exists idx_mission_duplicates_user_canonical
  on public.mission_duplicates (user_id, canonical_mission_id);

create index if not exists idx_applications_user_stage
  on public.applications (user_id, stage, updated_at desc);

create index if not exists idx_application_pipeline_events_application
  on public.application_pipeline_events (application_id, occurred_at desc);

create index if not exists idx_generated_application_assets_application
  on public.generated_application_assets (application_id, created_at desc);

create index if not exists idx_candidate_experiences_profile
  on public.candidate_experiences (profile_id, position_index);

create index if not exists idx_candidate_education_profile
  on public.candidate_education (profile_id, position_index);

create index if not exists idx_profile_imports_user_imported
  on public.profile_imports (user_id, imported_at desc);

create index if not exists idx_extension_devices_user_last_seen
  on public.extension_devices (user_id, last_seen_at desc);

create index if not exists idx_sync_conflicts_user_pending
  on public.sync_conflicts (user_id, status, detected_at desc);

create index if not exists idx_candidate_profile_field_suggestions_user_pending
  on public.candidate_profile_field_suggestions (user_id, status, created_at desc);

create index if not exists idx_candidate_profile_field_suggestions_profile
  on public.candidate_profile_field_suggestions (profile_id, created_at desc);

create index if not exists idx_connector_health_events_user_occurred
  on public.connector_health_events (user_id, occurred_at desc);
