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
  reason text not null check (reason in ('purchase', 'generation', 'adjustment')),
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

create index if not exists idx_credit_transactions_user_created
  on public.credit_transactions (user_id, created_at desc);

create index if not exists idx_favorite_missions_user_favorited
  on public.favorite_missions (user_id, favorited_at desc);

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

revoke execute on function public.consume_generation_credit(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.refund_generation_credit(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.add_credits_from_purchase(uuid, integer, text, jsonb) from public, anon, authenticated;

grant execute on function public.consume_generation_credit(uuid, text, jsonb) to service_role;
grant execute on function public.refund_generation_credit(uuid, text, jsonb) to service_role;
grant execute on function public.add_credits_from_purchase(uuid, integer, text, jsonb) to service_role;

-- 7. Freemium billing authority for future subscriptions only.
-- No legacy payment, credit, or entitlement backfill is performed.

create table if not exists public.billing_checkout_intents (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  offer_id text not null check (offer_id = 'premium_yearly'),
  catalog_version integer not null check (catalog_version > 0),
  amount_minor integer not null check (amount_minor = 1000),
  currency text not null check (currency = 'EUR'),
  tax_included boolean not null check (tax_included),
  idempotency_key text not null,
  state text not null check (
    state in (
      'creating_checkout',
      'create_failed_retryable',
      'awaiting_payment',
      'cancelled',
      'expired',
      'provisioning',
      'provisioning_failed_retryable',
      'provisioned',
      'failed_terminal'
    )
  ),
  provider_checkout_id text,
  provider_subscription_id text,
  checkout_url text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists public.subscription_entitlements (
  user_id uuid references auth.users(id) on delete cascade primary key,
  plan_id text not null check (plan_id in ('free', 'premium_yearly')),
  status text not null check (
    status in (
      'free',
      'premium_active',
      'premium_cancel_at_period_end',
      'premium_past_due',
      'premium_expired',
      'premium_revoked'
    )
  ),
  valid_from timestamptz,
  valid_until timestamptz,
  features text[] not null default '{}',
  source_subscription_id text,
  provider_updated_at timestamptz not null,
  event_priority integer not null,
  provider_event_id text not null,
  revision bigint not null default 1 check (revision > 0),
  issued_at timestamptz not null,
  cache_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status not in ('premium_active', 'premium_cancel_at_period_end')
    or (
      plan_id = 'premium_yearly'
      and valid_until is not null
      and features @> array['multi_account', 'application_form_ai_assistance']::text[]
    )
  )
);

create unique index if not exists idx_subscription_entitlements_source
  on public.subscription_entitlements (source_subscription_id)
  where source_subscription_id is not null;

create table if not exists public.billing_events (
  provider_event_id text primary key,
  payload_hash text not null,
  event_name text not null,
  user_id uuid references auth.users(id) on delete set null,
  checkout_intent_id uuid references public.billing_checkout_intents(id) on delete set null,
  source_subscription_id text,
  signal_type text,
  entitlement_status text,
  provider_updated_at timestamptz,
  event_priority integer,
  state text not null check (
    state in ('applying', 'applied', 'duplicate', 'ignored_stale', 'failed_terminal')
  ),
  error_code text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.billing_checkout_intents enable row level security;
alter table public.subscription_entitlements enable row level security;
alter table public.billing_events enable row level security;

create policy "Users can read own billing checkout intents"
  on public.billing_checkout_intents for select
  using (auth.uid() = user_id);

create policy "Users can read own subscription entitlement"
  on public.subscription_entitlements for select
  using (auth.uid() = user_id);

drop trigger if exists on_billing_checkout_intents_updated
  on public.billing_checkout_intents;
create trigger on_billing_checkout_intents_updated
  before update on public.billing_checkout_intents
  for each row execute function public.update_updated_at();

drop trigger if exists on_subscription_entitlements_updated
  on public.subscription_entitlements;
create trigger on_subscription_entitlements_updated
  before update on public.subscription_entitlements
  for each row execute function public.update_updated_at();

drop trigger if exists on_billing_events_updated on public.billing_events;
create trigger on_billing_events_updated
  before update on public.billing_events
  for each row execute function public.update_updated_at();

create or replace function public.apply_premium_billing_event(
  p_provider_event_id text,
  p_payload_hash text,
  p_event_name text,
  p_user_id uuid,
  p_checkout_intent_id uuid,
  p_offer_id text,
  p_source_subscription_id text,
  p_entitlement_status text,
  p_signal_type text,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_provider_updated_at timestamptz,
  p_event_priority integer,
  p_cache_ttl_hours integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_entitlement public.subscription_entitlements%rowtype;
  effective_subscription_id text;
  next_plan_id text;
  next_features text[];
  next_cache_expiry timestamptz;
begin
  if p_offer_id <> 'premium_yearly' then
    return 'invalid_offer';
  end if;
  if p_cache_ttl_hours < 1 or p_cache_ttl_hours > 168 then
    return 'invalid_cache_ttl';
  end if;
  if p_entitlement_status not in (
    'premium_active',
    'premium_cancel_at_period_end',
    'premium_past_due',
    'premium_expired',
    'premium_revoked'
  ) then
    return 'invalid_status';
  end if;
  if p_entitlement_status in ('premium_active', 'premium_cancel_at_period_end')
    and p_valid_until is null then
    return 'missing_valid_until';
  end if;
  if not exists (
    select 1
    from public.billing_checkout_intents
    where id = p_checkout_intent_id
      and user_id = p_user_id
      and offer_id = p_offer_id
      and amount_minor = 1000
      and currency = 'EUR'
      and tax_included
  ) then
    return 'invalid_checkout_intent';
  end if;

  insert into public.billing_events (
    provider_event_id,
    payload_hash,
    event_name,
    user_id,
    checkout_intent_id,
    source_subscription_id,
    signal_type,
    entitlement_status,
    provider_updated_at,
    event_priority,
    state
  )
  values (
    p_provider_event_id,
    p_payload_hash,
    p_event_name,
    p_user_id,
    p_checkout_intent_id,
    p_source_subscription_id,
    p_signal_type,
    p_entitlement_status,
    p_provider_updated_at,
    p_event_priority,
    'applying'
  )
  on conflict (provider_event_id) do nothing;

  if not found then
    return 'duplicate';
  end if;

  select *
  into current_entitlement
  from public.subscription_entitlements
  where user_id = p_user_id
  for update;

  if found and (
    current_entitlement.provider_updated_at,
    current_entitlement.event_priority,
    current_entitlement.provider_event_id
  ) >= (
    p_provider_updated_at,
    p_event_priority,
    p_provider_event_id
  ) then
    update public.billing_events
    set state = 'ignored_stale', processed_at = now()
    where provider_event_id = p_provider_event_id;
    return 'ignored_stale';
  end if;

  effective_subscription_id :=
    coalesce(p_source_subscription_id, current_entitlement.source_subscription_id);
  if effective_subscription_id is null then
    update public.billing_events
    set state = 'failed_terminal', error_code = 'missing_subscription', processed_at = now()
    where provider_event_id = p_provider_event_id;
    return 'missing_subscription';
  end if;

  if p_entitlement_status in ('premium_active', 'premium_cancel_at_period_end') then
    next_plan_id := 'premium_yearly';
    next_features := array['multi_account', 'application_form_ai_assistance']::text[];
    next_cache_expiry := least(
      p_valid_until,
      now() + make_interval(hours => p_cache_ttl_hours)
    );
  else
    next_plan_id := 'free';
    next_features := '{}'::text[];
    next_cache_expiry := now();
  end if;

  insert into public.subscription_entitlements (
    user_id,
    plan_id,
    status,
    valid_from,
    valid_until,
    features,
    source_subscription_id,
    provider_updated_at,
    event_priority,
    provider_event_id,
    revision,
    issued_at,
    cache_expires_at
  )
  values (
    p_user_id,
    next_plan_id,
    p_entitlement_status,
    p_valid_from,
    p_valid_until,
    next_features,
    effective_subscription_id,
    p_provider_updated_at,
    p_event_priority,
    p_provider_event_id,
    1,
    now(),
    next_cache_expiry
  )
  on conflict (user_id) do update set
    plan_id = excluded.plan_id,
    status = excluded.status,
    valid_from = excluded.valid_from,
    valid_until = excluded.valid_until,
    features = excluded.features,
    source_subscription_id = excluded.source_subscription_id,
    provider_updated_at = excluded.provider_updated_at,
    event_priority = excluded.event_priority,
    provider_event_id = excluded.provider_event_id,
    revision = public.subscription_entitlements.revision + 1,
    issued_at = excluded.issued_at,
    cache_expires_at = excluded.cache_expires_at;

  if next_plan_id = 'free' then
    update public.platform_account_bindings
    set status = 'locked_by_entitlement', revision = revision + 1
    where user_id = p_user_id
      and not is_active
      and status = 'ready';
  else
    update public.platform_account_bindings
    set status = 'ready', revision = revision + 1
    where user_id = p_user_id
      and status = 'locked_by_entitlement';
  end if;

  update public.billing_checkout_intents
  set
    state = case
      when p_entitlement_status in ('premium_active', 'premium_cancel_at_period_end')
        then 'provisioned'
      else state
    end,
    provider_subscription_id = effective_subscription_id,
    error_code = null
  where id = p_checkout_intent_id and user_id = p_user_id;

  update public.billing_events
  set
    state = 'applied',
    source_subscription_id = effective_subscription_id,
    processed_at = now()
  where provider_event_id = p_provider_event_id;

  return 'applied';
end;
$$;

revoke execute on function public.apply_premium_billing_event(
  text, text, text, uuid, uuid, text, text, text, text, timestamptz,
  timestamptz, timestamptz, integer, integer
) from public, anon, authenticated;

grant execute on function public.apply_premium_billing_event(
  text, text, text, uuid, uuid, text, text, text, text, timestamptz,
  timestamptz, timestamptz, integer, integer
) to service_role;

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

create table if not exists public.platform_account_bindings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  connector_id text references public.mission_sources(id) not null,
  external_account_key_hash text not null,
  display_label text not null,
  status text not null check (
    status in (
      'ready',
      'locked_by_entitlement',
      'needs_session',
      'needs_permission',
      'error',
      'removed'
    )
  ),
  is_active boolean not null default false,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, connector_id, external_account_key_hash)
);

create unique index if not exists idx_platform_account_bindings_one_active
  on public.platform_account_bindings (user_id, connector_id)
  where is_active and status <> 'removed';

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  platform_account_binding_id uuid
    references public.platform_account_bindings(id) on delete set null,
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
  revision bigint not null default 1 check (revision > 0),
  updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_missions_user_binding_source_external
  on public.missions (
    user_id,
    source,
    external_id,
    coalesce(platform_account_binding_id, '00000000-0000-0000-0000-000000000000'::uuid)
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
  scored_at timestamptz not null,
  revision bigint not null default 1 check (revision > 0),
  updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  updated_at timestamptz not null default now()
);

create table if not exists public.mission_duplicates (
  user_id uuid references auth.users(id) on delete cascade not null,
  canonical_mission_id uuid references public.missions(id) on delete cascade not null,
  duplicate_mission_id uuid references public.missions(id) on delete cascade not null,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  reason text not null,
  revision bigint not null default 1 check (revision > 0),
  updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
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
  from_stage text check (
    from_stage is null or from_stage in (
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
  revision bigint not null default 1 check (revision > 0),
  updated_by text not null check (updated_by in ('dashboard', 'extension', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint application_pipeline_events_transition_check check (
    (from_stage is null and to_stage = 'detected')
    or (from_stage = 'detected' and to_stage in ('selected', 'archived'))
    or (from_stage = 'selected' and to_stage in ('application_prepared', 'applied', 'archived'))
    or (from_stage = 'application_prepared' and to_stage in ('applied', 'archived'))
    or (from_stage = 'applied' and to_stage in ('interview', 'offer', 'rejected', 'archived'))
    or (from_stage = 'interview' and to_stage in ('offer', 'rejected', 'archived'))
    or (from_stage = 'offer' and to_stage in ('accepted', 'rejected', 'archived'))
    or (from_stage = 'accepted' and to_stage = 'archived')
    or (from_stage = 'rejected' and to_stage = 'archived')
    or (from_stage = 'archived' and to_stage = 'detected')
  ),
  unique (user_id, client_event_id)
);

create table if not exists public.generated_application_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  application_id uuid references public.applications(id) on delete cascade not null,
  client_asset_id text not null,
  type text not null check (type in ('pitch', 'cover_message', 'cv_summary')),
  content text not null,
  model text not null,
  credit_transaction_id uuid references public.credit_transactions(id) on delete set null,
  revision bigint not null default 1 check (revision > 0),
  updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
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
  source text references public.mission_sources(id) not null
    check (source in ('linkedin', 'malt', 'other')),
  source_external_id text,
  position_index integer not null default 0,
  revision bigint not null default 1 check (revision > 0),
  updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
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
  source text references public.mission_sources(id) not null
    check (source in ('linkedin', 'malt', 'other')),
  position_index integer not null default 0,
  revision bigint not null default 1 check (revision > 0),
  updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or start_date <= end_date)
);

create table if not exists public.candidate_skills (
  profile_id uuid references public.candidate_profiles(id) on delete cascade not null,
  skill text not null,
  source text references public.mission_sources(id) not null
    check (source in ('linkedin', 'malt', 'other')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  revision bigint not null default 1 check (revision > 0),
  updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, skill)
);

create table if not exists public.candidate_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.candidate_profiles(id) on delete cascade not null,
  label text not null,
  url text not null,
  source text references public.mission_sources(id) not null
    check (source in ('linkedin', 'malt', 'other')),
  revision bigint not null default 1 check (revision > 0),
  updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  source text references public.mission_sources(id) not null
    check (source in ('linkedin', 'malt', 'other')),
  status text not null check (status in ('success', 'partial', 'error')),
  imported_at timestamptz not null,
  extractor_version text not null,
  error_code text,
  error_message text,
  raw_hash text,
  revision bigint not null default 1 check (revision > 0),
  updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  updated_at timestamptz not null default now(),
  field_counts jsonb not null default '{}'::jsonb
);

create table if not exists public.extension_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  install_id text not null,
  token_hash text,
  browser text,
  extension_version text not null,
  last_seen_at timestamptz,
  linked_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, install_id)
);

create unique index if not exists idx_extension_devices_token_hash
  on public.extension_devices (token_hash)
  where token_hash is not null;

create unique index if not exists idx_extension_devices_active_install
  on public.extension_devices (install_id)
  where revoked_at is null;

create table if not exists public.extension_link_requests (
  id uuid primary key default gen_random_uuid(),
  install_id text not null,
  secret_hash text not null,
  user_id uuid references auth.users(id) on delete cascade,
  state text not null default 'pending'
    check (state in ('pending', 'approved', 'refused', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (state = 'pending' and resolved_at is null)
    or (state <> 'pending' and resolved_at is not null)
  )
);

create unique index if not exists idx_extension_link_requests_secret_hash
  on public.extension_link_requests (secret_hash);

create table if not exists public.sync_status (
  user_id uuid references auth.users(id) on delete cascade not null,
  device_id uuid references public.extension_devices(id) on delete cascade not null,
  entity text not null check (
    entity in (
      'missions',
      'applications',
      'candidate_profile',
      'connector_health',
      'alert_preferences'
    )
  ),
  last_pull_at timestamptz,
  last_push_at timestamptz,
  pending_upload_count integer not null default 0 check (pending_upload_count >= 0),
  pending_download_count integer not null default 0 check (pending_download_count >= 0),
  last_error_code text,
  last_error_message text,
  retry_after_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  updated_at timestamptz not null default now(),
  primary key (device_id, entity)
);

create table if not exists public.dashboard_alert_preferences (
  user_id uuid references auth.users(id) on delete cascade primary key,
  enabled boolean not null default true,
  score_threshold integer not null default 70 check (score_threshold between 0 and 100),
  min_daily_rate integer not null default 0 check (min_daily_rate between 0 and 5000),
  required_stacks text[] not null default '{}',
  max_results integer not null default 5 check (max_results between 1 and 20),
  revision bigint not null default 1 check (revision > 0),
  updated_by text not null default 'dashboard'
    check (updated_by in ('dashboard', 'extension', 'system')),
  updated_at timestamptz not null default now()
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
  revision bigint not null default 1 check (revision > 0),
  updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.candidate_profile_field_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  profile_id uuid references public.candidate_profiles(id) on delete cascade not null,
  field text not null check (field in ('title', 'summary', 'location', 'target_role')),
  current_value text,
  suggested_value text,
  source text references public.mission_sources(id) not null
    check (source in ('linkedin', 'malt', 'other')),
  status text not null default 'pending' check (status in ('pending', 'applied', 'dismissed')),
  revision bigint not null default 1 check (revision > 0),
  updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
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
  occurred_at timestamptz not null,
  revision bigint not null default 1 check (revision > 0),
  updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  updated_at timestamptz not null default now()
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
alter table public.dashboard_alert_preferences enable row level security;
alter table public.sync_conflicts enable row level security;
alter table public.candidate_profile_field_suggestions enable row level security;
alter table public.connector_health_events enable row level security;
alter table public.platform_account_bindings enable row level security;
alter table public.extension_link_requests enable row level security;

drop policy if exists "Anyone can read mission sources" on public.mission_sources;
create policy "Anyone can read mission sources"
  on public.mission_sources for select
  using (true);

create policy "Users can read own platform account bindings"
  on public.platform_account_bindings for select
  using (auth.uid() = user_id);

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
drop policy if exists "Users can read own extension devices" on public.extension_devices;
create policy "Users can read own extension devices"
  on public.extension_devices for select
  using (auth.uid() = user_id);

drop policy if exists "Users can manage own sync status" on public.sync_status;
create policy "Users can manage own sync status"
  on public.sync_status for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage own dashboard alert preferences"
  on public.dashboard_alert_preferences;
create policy "Users can manage own dashboard alert preferences"
  on public.dashboard_alert_preferences for all
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

drop trigger if exists on_mission_scores_updated on public.mission_scores;
create trigger on_mission_scores_updated
  before update on public.mission_scores
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_mission_duplicates_updated on public.mission_duplicates;
create trigger on_mission_duplicates_updated
  before update on public.mission_duplicates
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_applications_updated on public.applications;
create trigger on_applications_updated
  before update on public.applications
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_application_pipeline_events_updated
  on public.application_pipeline_events;
create trigger on_application_pipeline_events_updated
  before update on public.application_pipeline_events
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_generated_application_assets_updated
  on public.generated_application_assets;
create trigger on_generated_application_assets_updated
  before update on public.generated_application_assets
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_candidate_profiles_updated on public.candidate_profiles;
create trigger on_candidate_profiles_updated
  before update on public.candidate_profiles
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_candidate_experiences_updated on public.candidate_experiences;
create trigger on_candidate_experiences_updated
  before update on public.candidate_experiences
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_candidate_education_updated on public.candidate_education;
create trigger on_candidate_education_updated
  before update on public.candidate_education
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_candidate_skills_updated on public.candidate_skills;
create trigger on_candidate_skills_updated
  before update on public.candidate_skills
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_candidate_links_updated on public.candidate_links;
create trigger on_candidate_links_updated
  before update on public.candidate_links
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_profile_imports_updated on public.profile_imports;
create trigger on_profile_imports_updated
  before update on public.profile_imports
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_candidate_profile_field_suggestions_updated
  on public.candidate_profile_field_suggestions;
create trigger on_candidate_profile_field_suggestions_updated
  before update on public.candidate_profile_field_suggestions
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_sync_conflicts_updated on public.sync_conflicts;
create trigger on_sync_conflicts_updated
  before update on public.sync_conflicts
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_connector_health_events_updated on public.connector_health_events;
create trigger on_connector_health_events_updated
  before update on public.connector_health_events
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_platform_account_bindings_updated
  on public.platform_account_bindings;
create trigger on_platform_account_bindings_updated
  before update on public.platform_account_bindings
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_extension_link_requests_updated
  on public.extension_link_requests;
create trigger on_extension_link_requests_updated
  before update on public.extension_link_requests
  for each row
  execute function public.update_updated_at();

create or replace function public.resolve_extension_link(
  p_link_id uuid,
  p_user_id uuid,
  p_resolution text,
  p_resolved_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_link public.extension_link_requests%rowtype;
  active_device public.extension_devices%rowtype;
begin
  if p_resolution not in ('approved', 'refused') then
    return 'invalid_resolution';
  end if;

  select *
  into requested_link
  from public.extension_link_requests
  where id = p_link_id
  for update;

  if not found then
    return 'link_not_found';
  end if;
  if requested_link.state <> 'pending' then
    return 'link_not_pending';
  end if;
  if requested_link.expires_at <= p_resolved_at then
    update public.extension_link_requests
    set state = 'expired', resolved_at = p_resolved_at
    where id = p_link_id;
    return 'link_expired';
  end if;

  if p_resolution = 'approved' then
    select *
    into active_device
    from public.extension_devices
    where install_id = requested_link.install_id
      and revoked_at is null
    for update;

    if found and active_device.user_id <> p_user_id then
      return 'installation_already_linked';
    end if;

    insert into public.extension_devices (
      user_id,
      install_id,
      token_hash,
      extension_version,
      linked_at,
      revoked_at
    )
    values (
      p_user_id,
      requested_link.install_id,
      requested_link.secret_hash,
      'unreported',
      p_resolved_at,
      null
    )
    on conflict (user_id, install_id) do update set
      token_hash = excluded.token_hash,
      linked_at = excluded.linked_at,
      revoked_at = null;
  end if;

  update public.extension_link_requests
  set
    user_id = p_user_id,
    state = p_resolution,
    resolved_at = p_resolved_at
  where id = p_link_id;

  return p_resolution;
end;
$$;

revoke execute on function public.resolve_extension_link(
  uuid, uuid, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.resolve_extension_link(
  uuid, uuid, text, timestamptz
) to service_role;

create or replace function public.add_platform_account_binding(
  p_user_id uuid,
  p_connector_id text,
  p_external_account_key_hash text,
  p_display_label text,
  p_max_bindings integer,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  binding_count integer;
  premium_allowed boolean;
  saved_binding public.platform_account_bindings%rowtype;
begin
  if p_max_bindings < 2 or p_max_bindings > 20 then
    return jsonb_build_object('result', 'invalid_quota');
  end if;
  if length(p_external_account_key_hash) <> 64 or length(trim(p_display_label)) < 1 then
    return jsonb_build_object('result', 'invalid_binding');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_connector_id, 0));
  select count(*) into binding_count
  from public.platform_account_bindings
  where user_id = p_user_id and connector_id = p_connector_id and status <> 'removed';
  select exists (
    select 1 from public.subscription_entitlements
    where user_id = p_user_id
      and status in ('premium_active', 'premium_cancel_at_period_end')
      and valid_until > p_now and cache_expires_at > p_now
      and features @> array['multi_account']::text[]
  ) into premium_allowed;
  if binding_count > 0 and not premium_allowed then
    return jsonb_build_object('result', 'premium_required');
  end if;
  if binding_count >= p_max_bindings then
    return jsonb_build_object('result', 'limit_reached');
  end if;

  insert into public.platform_account_bindings (
    user_id, connector_id, external_account_key_hash, display_label, status, is_active
  )
  values (
    p_user_id, p_connector_id, p_external_account_key_hash, trim(p_display_label),
    'ready', binding_count = 0
  )
  on conflict (user_id, connector_id, external_account_key_hash) do update set
    display_label = excluded.display_label,
    status = 'ready',
    revision = public.platform_account_bindings.revision + 1
  returning * into saved_binding;
  return jsonb_build_object('result', 'created', 'binding', to_jsonb(saved_binding));
end;
$$;

create or replace function public.switch_platform_account_binding(
  p_user_id uuid,
  p_binding_id uuid,
  p_session_key_hash text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_binding public.platform_account_bindings%rowtype;
  premium_allowed boolean;
begin
  select * into target_binding
  from public.platform_account_bindings
  where id = p_binding_id and user_id = p_user_id
  for update;
  if not found or target_binding.status = 'removed' then
    return jsonb_build_object('result', 'binding_not_found');
  end if;
  if target_binding.is_active then
    return jsonb_build_object('result', 'already_active', 'binding', to_jsonb(target_binding));
  end if;
  if target_binding.external_account_key_hash <> p_session_key_hash then
    return jsonb_build_object('result', 'session_mismatch');
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || target_binding.connector_id, 0)
  );
  select exists (
    select 1 from public.subscription_entitlements
    where user_id = p_user_id
      and status in ('premium_active', 'premium_cancel_at_period_end')
      and valid_until > p_now and cache_expires_at > p_now
      and features @> array['multi_account']::text[]
  ) into premium_allowed;
  if not premium_allowed then
    return jsonb_build_object('result', 'premium_required');
  end if;
  update public.platform_account_bindings
  set is_active = false, revision = revision + 1
  where user_id = p_user_id and connector_id = target_binding.connector_id and is_active;
  update public.platform_account_bindings
  set is_active = true, status = 'ready', revision = revision + 1
  where id = p_binding_id
  returning * into target_binding;
  return jsonb_build_object('result', 'switched', 'binding', to_jsonb(target_binding));
end;
$$;

revoke execute on function public.add_platform_account_binding(
  uuid, text, text, text, integer, timestamptz
) from public, anon, authenticated;
revoke execute on function public.switch_platform_account_binding(
  uuid, uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.add_platform_account_binding(
  uuid, text, text, text, integer, timestamptz
) to service_role;
grant execute on function public.switch_platform_account_binding(
  uuid, uuid, text, timestamptz
) to service_role;

drop trigger if exists on_sync_status_updated on public.sync_status;
create trigger on_sync_status_updated
  before update on public.sync_status
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_dashboard_alert_preferences_updated
  on public.dashboard_alert_preferences;
create trigger on_dashboard_alert_preferences_updated
  before update on public.dashboard_alert_preferences
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

-- ============================================
-- Preproduction security hardening
-- ============================================

create table if not exists public.api_rate_limit_buckets (
  scope text not null check (
    scope in (
      'extension_link_start_ip',
      'extension_link_start_install',
      'extension_link_status_ip',
      'extension_link_status_link',
      'extension_link_resolution_user'
    )
  ),
  subject_hash text not null check (subject_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  hit_count bigint not null check (hit_count > 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (scope, subject_hash, window_started_at),
  check (expires_at > window_started_at)
);

create index if not exists idx_api_rate_limit_buckets_expires
  on public.api_rate_limit_buckets (expires_at);

create index if not exists idx_billing_events_user
  on public.billing_events (user_id)
  where user_id is not null;

create index if not exists idx_billing_events_checkout_intent
  on public.billing_events (checkout_intent_id)
  where checkout_intent_id is not null;

create index if not exists idx_billing_events_processed
  on public.billing_events (processed_at)
  where processed_at is not null;

create index if not exists idx_platform_account_bindings_connector
  on public.platform_account_bindings (connector_id);

create index if not exists idx_missions_platform_account_binding
  on public.missions (platform_account_binding_id)
  where platform_account_binding_id is not null;

create index if not exists idx_extension_link_requests_user
  on public.extension_link_requests (user_id)
  where user_id is not null;

create index if not exists idx_extension_link_requests_terminal
  on public.extension_link_requests (resolved_at)
  where state <> 'pending';

alter table public.api_rate_limit_buckets enable row level security;
revoke all on table public.api_rate_limit_buckets from public, anon, authenticated;
grant all on table public.api_rate_limit_buckets to service_role;

drop policy if exists "Users can read own extension devices" on public.extension_devices;
create policy "Users can read own extension devices"
  on public.extension_devices for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own billing checkout intents"
  on public.billing_checkout_intents;
create policy "Users can read own billing checkout intents"
  on public.billing_checkout_intents for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own subscription entitlement"
  on public.subscription_entitlements;
create policy "Users can read own subscription entitlement"
  on public.subscription_entitlements for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own platform account bindings"
  on public.platform_account_bindings;
create policy "Users can read own platform account bindings"
  on public.platform_account_bindings for select
  using ((select auth.uid()) = user_id);

create or replace function public.consume_api_rate_limit(
  p_scope text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket_start timestamptz;
  bucket_expiry timestamptz;
  current_hits bigint;
  retry_after integer;
begin
  if p_scope not in (
    'extension_link_start_ip',
    'extension_link_start_install',
    'extension_link_status_ip',
    'extension_link_status_link',
    'extension_link_resolution_user'
  ) then
    raise exception 'invalid rate limit scope';
  end if;
  if p_subject_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid rate limit subject';
  end if;
  if p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid rate limit';
  end if;
  if p_window_seconds < 60 or p_window_seconds > 3600 then
    raise exception 'invalid rate limit window';
  end if;

  bucket_start := date_bin(
    make_interval(secs => p_window_seconds),
    p_now,
    timestamptz '2000-01-01 00:00:00+00'
  );
  bucket_expiry := bucket_start + make_interval(secs => p_window_seconds);

  insert into public.api_rate_limit_buckets (
    scope,
    subject_hash,
    window_started_at,
    hit_count,
    expires_at,
    updated_at
  )
  values (
    p_scope,
    p_subject_hash,
    bucket_start,
    1,
    bucket_expiry,
    p_now
  )
  on conflict (scope, subject_hash, window_started_at) do update set
    hit_count = public.api_rate_limit_buckets.hit_count + 1,
    updated_at = excluded.updated_at
  returning hit_count into current_hits;

  retry_after := greatest(
    0,
    ceil(extract(epoch from bucket_expiry - p_now))::integer
  );

  return jsonb_build_object(
    'allowed', current_hits <= p_limit,
    'remaining', greatest(p_limit - current_hits, 0),
    'retry_after_seconds', retry_after
  );
end;
$$;

revoke execute on function public.consume_api_rate_limit(
  text, text, integer, integer, timestamptz
) from public, anon, authenticated;

grant execute on function public.consume_api_rate_limit(
  text, text, integer, integer, timestamptz
) to service_role;

create or replace function public.expire_extension_link(
  p_link_id uuid,
  p_now timestamptz
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_link public.extension_link_requests%rowtype;
begin
  select *
  into requested_link
  from public.extension_link_requests
  where id = p_link_id
  for update;

  if not found then
    return 'link_not_found';
  end if;
  if requested_link.state <> 'pending' then
    return requested_link.state;
  end if;
  if requested_link.expires_at > p_now then
    return 'not_expired';
  end if;

  update public.extension_link_requests
  set
    state = 'expired',
    resolved_at = requested_link.expires_at
  where id = p_link_id
    and state = 'pending';

  if not found then
    select state
    into requested_link.state
    from public.extension_link_requests
    where id = p_link_id;
    return coalesce(requested_link.state, 'link_not_found');
  end if;

  return 'expired';
end;
$$;

revoke execute on function public.expire_extension_link(
  uuid, timestamptz
) from public, anon, authenticated;

grant execute on function public.expire_extension_link(
  uuid, timestamptz
) to service_role;

create or replace function public.purge_freemium_operational_data(
  p_now timestamptz,
  p_rate_limit_hours integer,
  p_extension_link_hours integer,
  p_terminal_checkout_days integer,
  p_billing_event_days integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_links bigint;
  deleted_rate_limits bigint;
  deleted_links bigint;
  deleted_checkouts bigint;
  deleted_billing_events bigint;
begin
  if p_rate_limit_hours < 1 or p_rate_limit_hours > 168
    or p_extension_link_hours < 1 or p_extension_link_hours > 168
    or p_terminal_checkout_days < 30 or p_terminal_checkout_days > 365
    or p_billing_event_days < 365 or p_billing_event_days > 2555
  then
    raise exception 'invalid retention policy';
  end if;

  update public.extension_link_requests
  set
    state = 'expired',
    resolved_at = expires_at
  where state = 'pending'
    and expires_at <= p_now;
  get diagnostics expired_links = row_count;

  delete from public.api_rate_limit_buckets
  where expires_at < p_now - make_interval(hours => p_rate_limit_hours);
  get diagnostics deleted_rate_limits = row_count;

  delete from public.extension_link_requests
  where state <> 'pending'
    and resolved_at < p_now - make_interval(hours => p_extension_link_hours);
  get diagnostics deleted_links = row_count;

  delete from public.billing_checkout_intents
  where state in ('cancelled', 'expired', 'failed_terminal')
    and provider_subscription_id is null
    and updated_at < p_now - make_interval(days => p_terminal_checkout_days);
  get diagnostics deleted_checkouts = row_count;

  delete from public.billing_events
  where processed_at is not null
    and processed_at < p_now - make_interval(days => p_billing_event_days);
  get diagnostics deleted_billing_events = row_count;

  return jsonb_build_object(
    'expired_links', expired_links,
    'deleted_rate_limits', deleted_rate_limits,
    'deleted_links', deleted_links,
    'deleted_checkouts', deleted_checkouts,
    'deleted_billing_events', deleted_billing_events
  );
end;
$$;

revoke execute on function public.purge_freemium_operational_data(
  timestamptz, integer, integer, integer, integer
) from public, anon, authenticated;

grant execute on function public.purge_freemium_operational_data(
  timestamptz, integer, integer, integer, integer
) to service_role;

create index if not exists idx_sync_conflicts_user_pending
  on public.sync_conflicts (user_id, status, detected_at desc);

create unique index if not exists idx_sync_conflicts_pending_unique
  on public.sync_conflicts (
    user_id,
    coalesce(device_id, '00000000-0000-0000-0000-000000000000'::uuid),
    entity,
    entity_id,
    field
  )
  where status = 'pending';

create index if not exists idx_candidate_profile_field_suggestions_user_pending
  on public.candidate_profile_field_suggestions (user_id, status, created_at desc);

create index if not exists idx_candidate_profile_field_suggestions_profile
  on public.candidate_profile_field_suggestions (profile_id, created_at desc);

create unique index if not exists idx_candidate_profile_field_suggestions_pending_unique
  on public.candidate_profile_field_suggestions (user_id, profile_id, field, source)
  where status = 'pending';

create index if not exists idx_connector_health_events_user_occurred
  on public.connector_health_events (user_id, occurred_at desc);
