-- Preproduction security hardening.
-- Server-only rate limits, least-privilege RLS, indexes and bounded retention.

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
