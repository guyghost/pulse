begin;

select plan(76);

-- Synthetic users are isolated from every other test by fixed, test-only UUIDs.
-- The auth trigger creates their profile rows; all mutations roll back below.
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
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'copilot-credit-a@missionpulse.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'copilot-credit-b@missionpulse.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  );

update public.profiles
set subscription_status = 'premium',
    subscription_period_end = now() + interval '30 days',
    credit_balance = case
      when id = '20000000-0000-0000-0000-000000000001' then 3
      else 2
    end
where id in (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002'
);

insert into public.copilot_dossiers (
  id,
  user_id,
  mission_id,
  state,
  consent,
  analysis_result,
  approved_artifacts
) values
  (
    '21000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'credit-isolation-mission-a',
    'ready',
    '{"missionFields":["title"],"profileFields":["jobTitle"],"evidenceIds":["experience-a"]}',
    '{"marker":"analysis-a"}',
    '[{"kind":"pitch","marker":"artifact-a"}]'
  ),
  (
    '21000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    'credit-isolation-mission-b',
    'ready',
    '{"missionFields":["title"],"profileFields":["jobTitle"],"evidenceIds":["experience-b"]}',
    '{"marker":"analysis-b"}',
    '[{"kind":"cover-message","marker":"artifact-b"}]'
  );

create temporary table test_copilot_rpc_results (
  name text primary key,
  value jsonb not null
) on commit drop;

insert into test_copilot_rpc_results (name, value) values (
  'begin-a-first',
  public.begin_copilot_job(
    '20000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    'attempt-a-1',
    'idempotency-a-1',
    'billing-a-1',
    repeat('a', 64),
    'pitch',
    array['experience-a'],
    '{"missionFields":["title"],"profileFields":["jobTitle"],"evidenceIds":["experience-a"]}',
    null,
    '{"mission":{"title":"private mission a"},"profile":{"jobTitle":"Engineer A"},"experienceEvidence":[{"evidenceId":"experience-a"}]}'
  )
);

insert into test_copilot_rpc_results (name, value) values (
  'begin-a-duplicate',
  public.begin_copilot_job(
    '20000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000099',
    'attempt-a-lost-response',
    'idempotency-a-1',
    'billing-a-lost-response',
    repeat('a', 64),
    'pitch',
    array['experience-a'],
    '{"missionFields":["title"],"profileFields":["jobTitle"],"evidenceIds":["experience-a"]}',
    null,
    '{"mission":{"title":"private mission a"},"profile":{"jobTitle":"Engineer A"},"experienceEvidence":[{"evidenceId":"experience-a"}]}'
  )
);

select is(
  (select value->>'disposition' from test_copilot_rpc_results where name = 'begin-a-first'),
  'created',
  'the first paid request creates one canonical job'
);

select is(
  (select value->>'disposition' from test_copilot_rpc_results where name = 'begin-a-duplicate'),
  'duplicate',
  'a lost-response retry is recognized as a duplicate'
);

select is(
  (select value->>'job_id' from test_copilot_rpc_results where name = 'begin-a-duplicate'),
  (select value->>'job_id' from test_copilot_rpc_results where name = 'begin-a-first'),
  'the duplicate returns the canonical job identifier'
);

select is(
  (
    select count(*)::integer
    from public.copilot_jobs
    where user_id = '20000000-0000-0000-0000-000000000001'
      and idempotency_key = 'idempotency-a-1'
  ),
  1,
  'duplicate admission persists exactly one job'
);

select is(
  (
    select total_count::integer
    from public.copilot_daily_admissions
    where user_id = '20000000-0000-0000-0000-000000000001'
      and utc_day = timezone('UTC', now())::date
  ),
  1,
  'duplicate admission consumes the daily quota exactly once'
);

select ok(
  coalesce((
    select state = 'processing'
      and active_job_id = '22000000-0000-0000-0000-000000000001'
    from public.copilot_dossiers
    where id = '21000000-0000-0000-0000-000000000001'
  ), false),
  'job admission atomically correlates the owner dossier'
);

select throws_ok(
  $$
    select public.begin_copilot_job(
      '20000000-0000-0000-0000-000000000002',
      '21000000-0000-0000-0000-000000000001',
      '22000000-0000-0000-0000-000000000098',
      'attempt-cross-owner',
      'idempotency-cross-owner',
      'billing-cross-owner',
      repeat('d', 64),
      'pitch',
      array['experience-b'],
      '{"missionFields":["title"],"profileFields":["jobTitle"],"evidenceIds":["experience-b"]}',
      null,
      '{"mission":{"title":"private mission b"},"profile":{"jobTitle":"Engineer B"},"experienceEvidence":[{"evidenceId":"experience-b"}]}'
    )
  $$,
  'P0001',
  'COPILOT_DOSSIER_NOT_FOUND',
  'the admission RPC cannot attach a user to another owner dossier'
);

select throws_ok(
  $$
    select public.reserve_copilot_credit(
      '20000000-0000-0000-0000-000000000002',
      '22000000-0000-0000-0000-000000000001',
      'billing-a-1'
    )
  $$,
  'P0001',
  'COPILOT_JOB_NOT_FOUND',
  'the reservation RPC rejects a foreign user and job pair'
);

select is(
  (
    select credit_balance
    from public.profiles
    where id = '20000000-0000-0000-0000-000000000001'
  ),
  3,
  'a rejected foreign reservation has no credit effect'
);

insert into test_copilot_rpc_results (name, value) values (
  'reserve-a-first',
  public.reserve_copilot_credit(
    '20000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    'billing-a-1'
  )
);

insert into test_copilot_rpc_results (name, value) values (
  'reserve-a-duplicate',
  public.reserve_copilot_credit(
    '20000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    'billing-a-1'
  )
);

select is(
  (select value->>'status' from test_copilot_rpc_results where name = 'reserve-a-first'),
  'reserved',
  'the first paid reservation succeeds'
);

select is(
  (select value->>'reservation_id' from test_copilot_rpc_results where name = 'reserve-a-duplicate'),
  (select value->>'reservation_id' from test_copilot_rpc_results where name = 'reserve-a-first'),
  'a duplicate reservation returns the same ledger transaction'
);

select is(
  (
    select credit_balance
    from public.profiles
    where id = '20000000-0000-0000-0000-000000000001'
  ),
  2,
  'duplicate reservation debits the balance exactly once'
);

select is(
  (
    select count(*)::integer
    from public.credit_transactions
    where user_id = '20000000-0000-0000-0000-000000000001'
      and copilot_job_id = '22000000-0000-0000-0000-000000000001'
      and reason = 'generation'
      and source = 'copilot_reservation'
  ),
  1,
  'the reservation ledger contains exactly one debit'
);

select is(
  (
    select amount
    from public.credit_transactions
    where user_id = '20000000-0000-0000-0000-000000000001'
      and copilot_job_id = '22000000-0000-0000-0000-000000000001'
      and reason = 'generation'
      and source = 'copilot_reservation'
  ),
  -1,
  'the canonical reservation ledger amount is minus one credit'
);

select ok(
  coalesce((
    select state = 'queued'
      and reservation_status = 'reserved'
      and reservation_transaction_id::text = (
        select value->>'reservation_id'
        from test_copilot_rpc_results
        where name = 'reserve-a-first'
      )
      and refund_status = 'pending'
      and refund_transaction_id is null
    from public.copilot_jobs
    where id = '22000000-0000-0000-0000-000000000001'
  ), false),
  'the paid job projection records a reserved debit and pending refund'
);

select is(
  (select net_credits from private.copilot_job_facts where job_id = '22000000-0000-0000-0000-000000000001'),
  1,
  'the private projection reports one net consumed credit after reservation'
);

select is(
  (select reservation_count from private.copilot_job_facts where job_id = '22000000-0000-0000-0000-000000000001'),
  1,
  'the private projection reports one reservation after retry'
);

select is(
  (select refund_count from private.copilot_job_facts where job_id = '22000000-0000-0000-0000-000000000001'),
  0,
  'the private projection reports no refund before settlement'
);

update public.copilot_jobs
set state = 'refunding',
    settlement = 'failure',
    failure = '{"code":"PROVIDER_FAILED"}'
where id = '22000000-0000-0000-0000-000000000001';

select throws_ok(
  $$
    select public.refund_copilot_credit(
      '20000000-0000-0000-0000-000000000002',
      '22000000-0000-0000-0000-000000000001',
      'billing-a-1',
      'failed'
    )
  $$,
  'P0001',
  'COPILOT_JOB_NOT_FOUND',
  'the refund RPC rejects a foreign user and job pair'
);

insert into test_copilot_rpc_results (name, value) values (
  'refund-a-first',
  public.refund_copilot_credit(
    '20000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    'billing-a-1',
    'failed'
  )
);

insert into test_copilot_rpc_results (name, value) values (
  'refund-a-duplicate',
  public.refund_copilot_credit(
    '20000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    'billing-a-1',
    'failed'
  )
);

select is(
  (select value->>'status' from test_copilot_rpc_results where name = 'refund-a-first'),
  'refunded',
  'the first refund succeeds'
);

select is(
  (select value->>'refund_id' from test_copilot_rpc_results where name = 'refund-a-duplicate'),
  (select value->>'refund_id' from test_copilot_rpc_results where name = 'refund-a-first'),
  'a duplicate refund returns the same ledger transaction'
);

select is(
  (
    select credit_balance
    from public.profiles
    where id = '20000000-0000-0000-0000-000000000001'
  ),
  3,
  'duplicate refund restores the balance exactly once'
);

select is(
  (
    select count(*)::integer
    from public.credit_transactions
    where user_id = '20000000-0000-0000-0000-000000000001'
      and copilot_job_id = '22000000-0000-0000-0000-000000000001'
      and reason = 'adjustment'
      and source = 'copilot_refund'
  ),
  1,
  'the refund ledger contains exactly one credit'
);

select is(
  (
    select sum(amount)::integer
    from public.credit_transactions
    where user_id = '20000000-0000-0000-0000-000000000001'
      and copilot_job_id = '22000000-0000-0000-0000-000000000001'
      and source in ('copilot_reservation', 'copilot_refund')
  ),
  0,
  'reservation and refund ledger entries net to zero credits'
);

select ok(
  coalesce((
    select state = 'failed'
      and reservation_status = 'reserved'
      and reservation_transaction_id::text = (
        select value->>'reservation_id'
        from test_copilot_rpc_results
        where name = 'reserve-a-first'
      )
      and refund_status = 'refunded'
      and refund_transaction_id::text = (
        select value->>'refund_id'
        from test_copilot_rpc_results
        where name = 'refund-a-first'
      )
    from public.copilot_jobs
    where id = '22000000-0000-0000-0000-000000000001'
  ), false),
  'the terminal job projection retains both canonical ledger identifiers'
);

select ok(
  coalesce((
    select state = 'ready' and active_job_id is null
    from public.copilot_dossiers
    where id = '21000000-0000-0000-0000-000000000001'
  ), false),
  'refund and dossier release commit together'
);

select is(
  (select net_credits from private.copilot_job_facts where job_id = '22000000-0000-0000-0000-000000000001'),
  0,
  'the private projection reports zero net credits after refund'
);

select is(
  (select reservation_count from private.copilot_job_facts where job_id = '22000000-0000-0000-0000-000000000001'),
  1,
  'the terminal private projection retains one reservation'
);

select is(
  (select refund_count from private.copilot_job_facts where job_id = '22000000-0000-0000-0000-000000000001'),
  1,
  'the terminal private projection records one refund'
);

insert into test_copilot_rpc_results (name, value) values (
  'reserve-a-after-refund',
  public.reserve_copilot_credit(
    '20000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    'billing-a-1'
  )
);

select is(
  (select value->>'reservation_id' from test_copilot_rpc_results where name = 'reserve-a-after-refund'),
  (select value->>'reservation_id' from test_copilot_rpc_results where name = 'reserve-a-first'),
  'a late reservation replay still returns the canonical debit'
);

select is(
  (
    select credit_balance
    from public.profiles
    where id = '20000000-0000-0000-0000-000000000001'
  ),
  3,
  'a late reservation replay cannot debit after refund'
);

select throws_ok(
  $$
    update public.copilot_jobs
    set reservation_transaction_id = null
    where id = '22000000-0000-0000-0000-000000000001'
  $$,
  '23514',
  'new row for relation "copilot_jobs" violates check constraint "copilot_jobs_credit_projection_coherent"',
  'a reserved projection cannot lose its reservation transaction'
);

select throws_ok(
  $$
    update public.copilot_jobs
    set refund_transaction_id = null
    where id = '22000000-0000-0000-0000-000000000001'
  $$,
  '23514',
  'new row for relation "copilot_jobs" violates check constraint "copilot_jobs_credit_projection_coherent"',
  'a refunded projection cannot lose its refund transaction'
);

insert into test_copilot_rpc_results (name, value) values (
  'begin-b-analysis',
  public.begin_copilot_job(
    '20000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000002',
    '22000000-0000-0000-0000-000000000002',
    'attempt-b-1',
    'idempotency-b-1',
    'billing-b-1',
    repeat('b', 64),
    'analysis',
    array['experience-b'],
    '{"missionFields":["title"],"profileFields":["jobTitle"],"evidenceIds":["experience-b"]}',
    null,
    '{"mission":{"title":"private mission b"},"profile":{"jobTitle":"Engineer B"},"experienceEvidence":[{"evidenceId":"experience-b"}]}'
  )
);

insert into test_copilot_rpc_results (name, value) values (
  'reserve-b-analysis-first',
  public.reserve_copilot_credit(
    '20000000-0000-0000-0000-000000000002',
    '22000000-0000-0000-0000-000000000002',
    'billing-b-1'
  )
);

insert into test_copilot_rpc_results (name, value) values (
  'reserve-b-analysis-duplicate',
  public.reserve_copilot_credit(
    '20000000-0000-0000-0000-000000000002',
    '22000000-0000-0000-0000-000000000002',
    'billing-b-1'
  )
);

select is(
  (select value->>'disposition' from test_copilot_rpc_results where name = 'begin-b-analysis'),
  'created',
  'the included analysis creates a free job'
);

select is(
  (select value->>'status' from test_copilot_rpc_results where name = 'reserve-b-analysis-first'),
  'not-required',
  'the included analysis requires no credit reservation'
);

select is(
  (select value->>'status' from test_copilot_rpc_results where name = 'reserve-b-analysis-duplicate'),
  'not-required',
  'a free reservation retry remains not-required'
);

select is(
  (
    select credit_balance
    from public.profiles
    where id = '20000000-0000-0000-0000-000000000002'
  ),
  2,
  'free analysis leaves the credit balance unchanged'
);

select is(
  (
    select count(*)::integer
    from public.credit_transactions
    where user_id = '20000000-0000-0000-0000-000000000002'
      and copilot_job_id = '22000000-0000-0000-0000-000000000002'
  ),
  0,
  'free analysis creates no credit ledger entry'
);

select ok(
  coalesce((
    select credit_cost = 0
      and reservation_status = 'not-required'
      and reservation_transaction_id is null
      and refund_status = 'not-required'
      and refund_transaction_id is null
    from public.copilot_jobs
    where id = '22000000-0000-0000-0000-000000000002'
  ), false),
  'the free-job credit projection has no ledger identifiers'
);

select is(
  public.settle_copilot_job_without_credit(
    '20000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000002',
    '22000000-0000-0000-0000-000000000002',
    'failed',
    '{"code":"PROVIDER_FAILED"}'
  ),
  '22000000-0000-0000-0000-000000000002'::uuid,
  'the free analysis settles without creating a credit mutation'
);

update public.copilot_dossiers
set approved_artifacts = (
  select jsonb_agg(
    jsonb_build_object(
      'kind', 'pitch',
      'marker', case
        when artifact_number = 1 then 'artifact-b'
        else format('artifact-b-%s', artifact_number)
      end
    )
    order by artifact_number
  )
  from generate_series(1, 512) artifact_number
)
where id = '21000000-0000-0000-0000-000000000002';

select throws_ok(
  $$
    select public.begin_copilot_job(
      '20000000-0000-0000-0000-000000000002',
      '21000000-0000-0000-0000-000000000002',
      '22000000-0000-0000-0000-000000000003',
      'attempt-b-artifact-limit',
      'idempotency-b-artifact-limit',
      'billing-b-artifact-limit',
      repeat('c', 64),
      'cover-message',
      array['experience-b'],
      '{"missionFields":["title"],"profileFields":["jobTitle"],"evidenceIds":["experience-b"]}',
      null,
      '{"mission":{"title":"private mission b"},"profile":{"jobTitle":"Engineer B"},"experienceEvidence":[{"evidenceId":"experience-b"}]}'
    )
  $$,
  'P0001',
  'COPILOT_DOSSIER_ARTIFACT_LIMIT',
  'a new artifact job is rejected when the durable history reaches 512 entries'
);

select is(
  (
    select total_count::integer
    from public.copilot_daily_admissions
    where user_id = '20000000-0000-0000-0000-000000000002'
      and utc_day = timezone('UTC', now())::date
  ),
  1,
  'artifact-limit refusal happens before daily quota consumption'
);

select is(
  (
    select credit_balance
    from public.profiles
    where id = '20000000-0000-0000-0000-000000000002'
  ),
  2,
  'artifact-limit refusal happens before any credit effect'
);

select is(
  (
    select count(*)::integer
    from public.copilot_jobs
    where id = '22000000-0000-0000-0000-000000000003'
  ),
  0,
  'artifact-limit refusal persists no paid job'
);

insert into test_copilot_rpc_results (name, value) values (
  'begin-b-analysis-at-limit',
  public.begin_copilot_job(
    '20000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000002',
    '22000000-0000-0000-0000-000000000004',
    'attempt-b-analysis-at-limit',
    'idempotency-b-analysis-at-limit',
    'billing-b-analysis-at-limit',
    repeat('d', 64),
    'analysis',
    array['experience-b'],
    '{"missionFields":["title"],"profileFields":["jobTitle"],"evidenceIds":["experience-b"]}',
    null,
    '{"mission":{"title":"private mission b"},"profile":{"jobTitle":"Engineer B"},"experienceEvidence":[{"evidenceId":"experience-b"}]}'
  )
);

select is(
  (select value->>'disposition' from test_copilot_rpc_results where name = 'begin-b-analysis-at-limit'),
  'created',
  'analysis remains admitted when the artifact history is full'
);

select is(
  (
    select jsonb_array_length(approved_artifacts)
    from public.copilot_dossiers
    where id = '21000000-0000-0000-0000-000000000002'
  ),
  512,
  'analysis admission preserves the complete bounded artifact history'
);

select throws_ok(
  $$
    update public.copilot_dossiers
    set approved_artifacts = approved_artifacts || '[{"kind":"pitch","marker":"overflow"}]'::jsonb
    where id = '21000000-0000-0000-0000-000000000002'
  $$,
  '23514',
  'new row for relation "copilot_dossiers" violates check constraint "copilot_dossiers_approved_artifacts_bounded"',
  'the database rejects a persisted artifact array above 512 entries'
);

insert into public.copilot_provider_sessions (
  id,
  dossier_id,
  user_id,
  provider_session_id,
  active_job_id
) values
  (
    '23000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'provider-session-a',
    null
  ),
  (
    '23000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    'provider-session-b',
    '22000000-0000-0000-0000-000000000004'
  );

insert into public.copilot_deleted_job_receipts (
  user_id,
  idempotency_key,
  input_hash,
  deleted_at,
  expires_at
) values
  (
    '20000000-0000-0000-0000-000000000001',
    'deleted-receipt-a',
    repeat('e', 64),
    now(),
    now() + interval '90 days'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'deleted-receipt-b',
    repeat('f', 64),
    now(),
    now() + interval '90 days'
  );

-- The production grant boundary is stronger than owner-only RLS: browser roles
-- cannot address internal tables or service-role RPCs at all.
set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ select analysis_result, approved_artifacts from public.copilot_dossiers $$,
  '42501',
  'permission denied for table copilot_dossiers',
  'authenticated user A cannot read dossier artifacts directly'
);

select throws_ok(
  $$ select input_payload, result, failure from public.copilot_jobs $$,
  '42501',
  'permission denied for table copilot_jobs',
  'authenticated user A cannot read job payloads directly'
);

select throws_ok(
  $$ select provider_session_id from public.copilot_provider_sessions $$,
  '42501',
  'permission denied for table copilot_provider_sessions',
  'authenticated user A cannot read provider handles directly'
);

select throws_ok(
  $$ select total_count from public.copilot_daily_admissions $$,
  '42501',
  'permission denied for table copilot_daily_admissions',
  'authenticated user A cannot read admission ledgers directly'
);

select throws_ok(
  $$ select idempotency_key from public.copilot_deleted_job_receipts $$,
  '42501',
  'permission denied for table copilot_deleted_job_receipts',
  'authenticated user A cannot read deletion receipts directly'
);

-- pgTAP's throws_ok segfaults PostgreSQL 17 when a SET ROLE caller invokes a
-- revoked SECURITY DEFINER function. The catalogue privilege predicate proves
-- the same boundary without executing the forbidden RPC.
select ok(
  not has_function_privilege(
    current_user,
    'public.assert_copilot_job_replay_allowed(uuid,text,text)',
    'EXECUTE'
  ),
  'authenticated user A cannot execute a service-role Copilot RPC'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000002';
set local request.jwt.claims = '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
  $$ select analysis_result, approved_artifacts from public.copilot_dossiers $$,
  '42501',
  'permission denied for table copilot_dossiers',
  'authenticated user B cannot read dossier artifacts directly'
);

select throws_ok(
  $$ select input_payload, result, failure from public.copilot_jobs $$,
  '42501',
  'permission denied for table copilot_jobs',
  'authenticated user B cannot read job payloads directly'
);

select throws_ok(
  $$ select provider_session_id from public.copilot_provider_sessions $$,
  '42501',
  'permission denied for table copilot_provider_sessions',
  'authenticated user B cannot read provider handles directly'
);

reset role;
set local role anon;

select throws_ok(
  $$ select approved_artifacts from public.copilot_dossiers $$,
  '42501',
  'permission denied for table copilot_dossiers',
  'anonymous callers cannot read Copilot dossiers'
);

select throws_ok(
  $$ select input_payload from public.copilot_jobs $$,
  '42501',
  'permission denied for table copilot_jobs',
  'anonymous callers cannot read Copilot jobs'
);

reset role;

select ok(
  (
    select bool_and(has_table_privilege(
      'service_role',
      relation_name,
      'SELECT,INSERT,UPDATE,DELETE'
    ))
    from (
      values
        ('public.copilot_dossiers'),
        ('public.copilot_jobs'),
        ('public.copilot_provider_sessions'),
        ('public.copilot_daily_admissions'),
        ('public.copilot_deleted_job_receipts')
    ) as internal_tables(relation_name)
  ),
  'the service role retains read and mutation privileges on every internal table'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.reserve_copilot_credit(uuid,uuid,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.refund_copilot_credit(uuid,uuid,text,text)',
    'EXECUTE'
  ),
  'the service role retains the credit settlement RPCs'
);

-- Temporarily grant SELECT inside this rollback-only transaction to exercise
-- the retained RLS policies as defense in depth. The hardening migration still
-- leaves these grants absent in the committed schema.
grant select on table public.copilot_dossiers, public.copilot_jobs to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::integer from public.copilot_dossiers where id = '21000000-0000-0000-0000-000000000001'),
  1,
  'RLS lets user A see its own dossier when defense-in-depth SELECT is exercised'
);

select is(
  (select count(*)::integer from public.copilot_dossiers where id = '21000000-0000-0000-0000-000000000002'),
  0,
  'RLS hides user B dossier from user A'
);

select is(
  (select count(*)::integer from public.copilot_jobs where id = '22000000-0000-0000-0000-000000000001'),
  1,
  'RLS lets user A see its own job when defense-in-depth SELECT is exercised'
);

select is(
  (select count(*)::integer from public.copilot_jobs where id = '22000000-0000-0000-0000-000000000002'),
  0,
  'RLS hides user B job from user A'
);

select is(
  (
    select approved_artifacts->0->>'marker'
    from public.copilot_dossiers
    where id = '21000000-0000-0000-0000-000000000001'
  ),
  'artifact-a',
  'the owner-only RLS policy exposes only user A approved artifact row'
);

select is(
  (
    select count(*)::integer
    from public.copilot_dossiers
    where id = '21000000-0000-0000-0000-000000000002'
      and approved_artifacts @> '[{"marker":"artifact-b"}]'::jsonb
  ),
  0,
  'the owner-only RLS policy hides user B artifacts from user A'
);

select is(
  (
    select input_payload->'mission'->>'title'
    from public.copilot_jobs
    where id = '22000000-0000-0000-0000-000000000001'
  ),
  'private mission a',
  'the owner-only RLS policy resolves user A job data to user A only'
);

select is(
  (
    select count(*)::integer
    from public.copilot_jobs
    where id = '22000000-0000-0000-0000-000000000002'
      and input_payload->'mission'->>'title' = 'private mission b'
  ),
  0,
  'the owner-only RLS policy hides user B job data from user A'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000002';
set local request.jwt.claims = '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::integer from public.copilot_dossiers where id = '21000000-0000-0000-0000-000000000002'),
  1,
  'RLS lets user B see its own dossier when defense-in-depth SELECT is exercised'
);

select is(
  (select count(*)::integer from public.copilot_dossiers where id = '21000000-0000-0000-0000-000000000001'),
  0,
  'RLS hides user A dossier from user B'
);

select is(
  (select count(*)::integer from public.copilot_jobs where id = '22000000-0000-0000-0000-000000000002'),
  1,
  'RLS lets user B see its own job when defense-in-depth SELECT is exercised'
);

select is(
  (select count(*)::integer from public.copilot_jobs where id = '22000000-0000-0000-0000-000000000001'),
  0,
  'RLS hides user A job from user B'
);

select is(
  (
    select approved_artifacts->0->>'marker'
    from public.copilot_dossiers
    where id = '21000000-0000-0000-0000-000000000002'
  ),
  'artifact-b',
  'the owner-only RLS policy exposes only user B approved artifact row'
);

select is(
  (
    select count(*)::integer
    from public.copilot_dossiers
    where id = '21000000-0000-0000-0000-000000000001'
      and approved_artifacts @> '[{"marker":"artifact-a"}]'::jsonb
  ),
  0,
  'the owner-only RLS policy hides user A artifacts from user B'
);

select is(
  (
    select input_payload->'mission'->>'title'
    from public.copilot_jobs
    where id = '22000000-0000-0000-0000-000000000002'
  ),
  'private mission b',
  'the owner-only RLS policy resolves user B job data to user B only'
);

select is(
  (
    select count(*)::integer
    from public.copilot_jobs
    where id = '22000000-0000-0000-0000-000000000001'
      and input_payload->'mission'->>'title' = 'private mission a'
  ),
  0,
  'the owner-only RLS policy hides user A job data from user B'
);

reset role;
revoke select on table public.copilot_dossiers, public.copilot_jobs from authenticated;

select * from finish();

rollback;
