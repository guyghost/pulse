-- Freemium billing authority for future subscriptions only.
-- No legacy payment, credit, or entitlement backfill is performed.

drop function if exists public.grant_premium_monthly_credits(uuid, text, integer);
drop index if exists public.idx_credit_transactions_premium_period;
alter table public.credit_transactions
  drop constraint if exists credit_transactions_reason_check;
alter table public.credit_transactions
  add constraint credit_transactions_reason_check
  check (reason in ('purchase', 'generation', 'adjustment'));

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

alter table public.missions
  add column if not exists platform_account_binding_id uuid
    references public.platform_account_bindings(id) on delete set null;

alter table public.missions
  drop constraint if exists missions_user_id_source_external_id_key;

create unique index if not exists idx_missions_user_binding_source_external
  on public.missions (
    user_id,
    source,
    external_id,
    coalesce(platform_account_binding_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

alter table public.extension_devices
  add column if not exists token_hash text,
  add column if not exists linked_at timestamptz,
  add column if not exists revoked_at timestamptz;

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

alter table public.billing_checkout_intents enable row level security;
alter table public.subscription_entitlements enable row level security;
alter table public.billing_events enable row level security;
alter table public.platform_account_bindings enable row level security;
alter table public.extension_link_requests enable row level security;

-- Device tokens and revocation are server-authoritative. Authenticated users
-- may inspect their devices, but cannot write token_hash or revoked_at.
drop policy if exists "Users can manage own extension devices" on public.extension_devices;
drop policy if exists "Users can read own extension devices" on public.extension_devices;
create policy "Users can read own extension devices"
  on public.extension_devices for select
  using (auth.uid() = user_id);

create policy "Users can read own billing checkout intents"
  on public.billing_checkout_intents for select
  using (auth.uid() = user_id);

create policy "Users can read own subscription entitlement"
  on public.subscription_entitlements for select
  using (auth.uid() = user_id);

create policy "Users can read own platform account bindings"
  on public.platform_account_bindings for select
  using (auth.uid() = user_id);

-- Binding mutations go through reviewed server use cases. There is deliberately
-- no direct insert/update/delete policy for authenticated clients.

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

drop trigger if exists on_platform_account_bindings_updated
  on public.platform_account_bindings;
create trigger on_platform_account_bindings_updated
  before update on public.platform_account_bindings
  for each row execute function public.update_updated_at();

drop trigger if exists on_extension_link_requests_updated
  on public.extension_link_requests;
create trigger on_extension_link_requests_updated
  before update on public.extension_link_requests
  for each row execute function public.update_updated_at();

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

  select count(*)
  into binding_count
  from public.platform_account_bindings
  where user_id = p_user_id
    and connector_id = p_connector_id
    and status <> 'removed';

  select exists (
    select 1
    from public.subscription_entitlements
    where user_id = p_user_id
      and status in ('premium_active', 'premium_cancel_at_period_end')
      and valid_until > p_now
      and cache_expires_at > p_now
      and features @> array['multi_account']::text[]
  )
  into premium_allowed;

  if binding_count > 0 and not premium_allowed then
    return jsonb_build_object('result', 'premium_required');
  end if;
  if binding_count >= p_max_bindings then
    return jsonb_build_object('result', 'limit_reached');
  end if;

  insert into public.platform_account_bindings (
    user_id,
    connector_id,
    external_account_key_hash,
    display_label,
    status,
    is_active
  )
  values (
    p_user_id,
    p_connector_id,
    p_external_account_key_hash,
    trim(p_display_label),
    'ready',
    binding_count = 0
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
  select *
  into target_binding
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
    select 1
    from public.subscription_entitlements
    where user_id = p_user_id
      and status in ('premium_active', 'premium_cancel_at_period_end')
      and valid_until > p_now
      and cache_expires_at > p_now
      and features @> array['multi_account']::text[]
  )
  into premium_allowed;
  if not premium_allowed then
    return jsonb_build_object('result', 'premium_required');
  end if;

  update public.platform_account_bindings
  set is_active = false, revision = revision + 1
  where user_id = p_user_id
    and connector_id = target_binding.connector_id
    and is_active;

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
