-- ============================================
-- MissionPulse — Supabase Schema
-- Run this in the Supabase SQL Editor
-- ============================================

-- 1. Profiles table (linked to auth.users)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  subscription_status text not null default 'free'
    check (subscription_status in ('free', 'premium')),
  subscription_period_end timestamptz,
  ls_subscription_id text,
  ls_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Enable RLS
alter table public.profiles enable row level security;

-- 3. RLS policies

-- Users can read their own profile
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Users can update their own profile (but not subscription fields)
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

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

-- 6. Index for webhook lookups
create index if not exists idx_profiles_ls_subscription
  on public.profiles (ls_subscription_id)
  where ls_subscription_id is not null;

create index if not exists idx_profiles_ls_customer
  on public.profiles (ls_customer_id)
  where ls_customer_id is not null;
