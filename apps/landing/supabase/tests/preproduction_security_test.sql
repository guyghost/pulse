begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(21);

select has_table(
  'public',
  'api_rate_limit_buckets',
  'rate limit buckets exist after a clean migration'
);

select is(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.api_rate_limit_buckets'::regclass
  ),
  true,
  'rate limit buckets have RLS enabled'
);

select is(
  has_table_privilege('authenticated', 'public.api_rate_limit_buckets', 'select'),
  false,
  'authenticated clients cannot read rate limit buckets'
);

select is(
  has_table_privilege('anon', 'public.api_rate_limit_buckets', 'select'),
  false,
  'anonymous clients cannot read rate limit buckets'
);

select is(
  (
    select has_function_privilege('authenticated', oid, 'execute')
    from pg_proc
    where oid = 'public.consume_api_rate_limit(text,text,integer,integer,timestamp with time zone)'::regprocedure
  ),
  false,
  'authenticated clients cannot consume rate limits directly'
);

select is(
  (
    public.consume_api_rate_limit(
      'extension_link_start_ip',
      repeat('a', 64),
      3,
      600,
      timestamptz '2026-07-30 12:00:00+00'
    )->>'allowed'
  ),
  'true',
  'the first request is allowed'
);

do $$
begin
  perform public.consume_api_rate_limit(
    'extension_link_start_ip',
    repeat('a', 64),
    3,
    600,
    timestamptz '2026-07-30 12:00:00+00'
  );
  perform public.consume_api_rate_limit(
    'extension_link_start_ip',
    repeat('a', 64),
    3,
    600,
    timestamptz '2026-07-30 12:00:00+00'
  );
end;
$$;

select is(
  (
    public.consume_api_rate_limit(
      'extension_link_start_ip',
      repeat('a', 64),
      3,
      600,
      timestamptz '2026-07-30 12:00:00+00'
    )->>'allowed'
  ),
  'false',
  'the first request above the limit is denied'
);

select is(
  (
    public.consume_api_rate_limit(
      'extension_link_start_ip',
      repeat('a', 64),
      3,
      600,
      timestamptz '2026-07-30 12:00:00+00'
    )->>'retry_after_seconds'
  ),
  '600',
  'a denied fixed-window request receives a deterministic retry delay'
);

select is(
  (
    select has_function_privilege('authenticated', oid, 'execute')
    from pg_proc
    where oid = 'public.expire_extension_link(uuid,timestamp with time zone)'::regprocedure
  ),
  false,
  'authenticated clients cannot expire extension links directly'
);

insert into public.extension_link_requests (
  id,
  install_id,
  secret_hash,
  state,
  expires_at,
  created_at,
  updated_at
)
values
  (
    '33333333-3333-4333-8333-333333333333',
    'test-install-future',
    repeat('e', 64),
    'pending',
    timestamptz '2026-07-30 13:00:00+00',
    timestamptz '2026-07-30 10:00:00+00',
    timestamptz '2026-07-30 10:00:00+00'
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'test-install-expiring',
    repeat('f', 64),
    'pending',
    timestamptz '2026-07-30 11:00:00+00',
    timestamptz '2026-07-30 10:00:00+00',
    timestamptz '2026-07-30 10:00:00+00'
  );

select is(
  public.expire_extension_link(
    '33333333-3333-4333-8333-333333333333',
    timestamptz '2026-07-30 12:00:00+00'
  ),
  'not_expired',
  'a future link cannot transition to expired'
);

select is(
  public.expire_extension_link(
    '44444444-4444-4444-8444-444444444444',
    timestamptz '2026-07-30 12:00:00+00'
  ),
  'expired',
  'an overdue link atomically transitions to expired'
);

select is(
  (
    select resolved_at
    from public.extension_link_requests
    where id = '44444444-4444-4444-8444-444444444444'
  ),
  timestamptz '2026-07-30 11:00:00+00',
  'atomic polling expiry keeps the deterministic expiration time'
);

insert into public.api_rate_limit_buckets (
  scope,
  subject_hash,
  window_started_at,
  hit_count,
  expires_at,
  updated_at
)
values (
  'extension_link_status_link',
  repeat('b', 64),
  timestamptz '2026-07-28 10:00:00+00',
  1,
  timestamptz '2026-07-28 10:10:00+00',
  timestamptz '2026-07-28 10:00:00+00'
);

insert into public.extension_link_requests (
  id,
  install_id,
  secret_hash,
  state,
  expires_at,
  resolved_at,
  created_at,
  updated_at
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'test-install-pending',
    repeat('c', 64),
    'pending',
    timestamptz '2026-07-30 11:00:00+00',
    null,
    timestamptz '2026-07-30 10:00:00+00',
    timestamptz '2026-07-30 10:00:00+00'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'test-install-old',
    repeat('d', 64),
    'refused',
    timestamptz '2026-07-27 11:00:00+00',
    timestamptz '2026-07-27 11:00:00+00',
    timestamptz '2026-07-27 10:00:00+00',
    timestamptz '2026-07-27 11:00:00+00'
  );

create temporary table purge_result as
select public.purge_freemium_operational_data(
  timestamptz '2026-07-30 12:00:00+00',
  24,
  24,
  90,
  395
) as result;

select is(
  (select result->>'expired_links' from purge_result),
  '1',
  'purge explicitly expires overdue pending links'
);

select is(
  (select result->>'deleted_links' from purge_result),
  '1',
  'purge deletes link requests beyond retention'
);

select is(
  (select result->>'deleted_rate_limits' from purge_result),
  '1',
  'purge deletes expired rate limit buckets beyond retention'
);

select is(
  (
    select state
    from public.extension_link_requests
    where id = '11111111-1111-4111-8111-111111111111'
  ),
  'expired',
  'an overdue pending link reaches the explicit expired state'
);

select is(
  (
    select resolved_at
    from public.extension_link_requests
    where id = '11111111-1111-4111-8111-111111111111'
  ),
  timestamptz '2026-07-30 11:00:00+00',
  'link expiry uses expires_at as the deterministic resolution time'
);

select is(
  (
    select count(*)
    from public.extension_link_requests
    where id = '22222222-2222-4222-8222-222222222222'
  ),
  0::bigint,
  'the old terminal link is gone'
);

select is(
  (
    select count(*)
    from public.api_rate_limit_buckets
    where subject_hash = repeat('b', 64)
  ),
  0::bigint,
  'the old rate bucket is gone'
);

select is(
  (
    select (
      (result->>'expired_links')::integer
      + (result->>'deleted_rate_limits')::integer
      + (result->>'deleted_links')::integer
      + (result->>'deleted_checkouts')::integer
      + (result->>'deleted_billing_events')::integer
    )
    from (
      select public.purge_freemium_operational_data(
        timestamptz '2026-07-30 12:00:00+00',
        24,
        24,
        90,
        395
      ) as result
    ) second_purge
  ),
  0,
  'repeating the same purge is idempotent'
);

select is(
  (
    select has_function_privilege('authenticated', oid, 'execute')
    from pg_proc
    where oid = 'public.purge_freemium_operational_data(timestamp with time zone,integer,integer,integer,integer)'::regprocedure
  ),
  false,
  'authenticated clients cannot invoke retention'
);

select * from finish();
rollback;
