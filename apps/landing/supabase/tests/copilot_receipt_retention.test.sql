begin;

select plan(8);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'receipt-retention@missionpulse.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.copilot_deleted_job_receipts (
  user_id,
  idempotency_key,
  input_hash,
  deleted_at,
  expires_at
) values
  (
    '10000000-0000-0000-0000-000000000001',
    'expired-receipt-one',
    repeat('a', 64),
    now() - interval '91 days',
    now() - interval '1 day'
  ),
  (
    '10000000-0000-0000-0000-000000000001',
    'expired-receipt-two',
    repeat('b', 64),
    now() - interval '90 days 1 hour',
    now() - interval '1 hour'
  ),
  (
    '10000000-0000-0000-0000-000000000001',
    'live-receipt',
    repeat('c', 64),
    now(),
    now() + interval '90 days'
  );

select throws_ok(
  $$ select public.purge_expired_copilot_deleted_job_receipts(null) $$,
  'P0001',
  'COPILOT_INVALID_PURGE_LIMIT',
  'a NULL batch limit cannot become an unbounded delete'
);

select throws_ok(
  $$ select public.purge_expired_copilot_deleted_job_receipts(0) $$,
  'P0001',
  'COPILOT_INVALID_PURGE_LIMIT',
  'a zero batch limit is rejected'
);

select throws_ok(
  $$ select public.purge_expired_copilot_deleted_job_receipts(10001) $$,
  'P0001',
  'COPILOT_INVALID_PURGE_LIMIT',
  'a batch above the hard limit is rejected'
);

select is(
  public.purge_expired_copilot_deleted_job_receipts(1),
  1,
  'the bounded purge physically deletes one expired receipt'
);

select is(
  (
    select count(*)::integer
    from public.copilot_deleted_job_receipts
    where expires_at <= now()
  ),
  1,
  'one expired receipt remains after a one-row batch'
);

select is(
  public.purge_expired_copilot_deleted_job_receipts(100),
  1,
  'the next batch physically deletes the remaining expired receipt'
);

select is(
  (
    select count(*)::integer
    from public.copilot_deleted_job_receipts
    where expires_at <= now()
  ),
  0,
  'no expired receipt remains'
);

select is(
  (
    select count(*)::integer
    from public.copilot_deleted_job_receipts
    where idempotency_key = 'live-receipt'
  ),
  1,
  'the purge preserves a live receipt'
);

select * from finish();

rollback;
