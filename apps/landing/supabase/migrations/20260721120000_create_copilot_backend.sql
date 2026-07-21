-- Durable, user-isolated Premium Copilot dossiers/jobs and exactly-once credits.

alter table public.profiles
  add column if not exists copilot_access_revoked_at timestamptz;

create table if not exists public.copilot_dossiers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  mission_id text not null check (char_length(mission_id) between 1 and 256),
  state text not null check (
    state in (
      'empty',
      'consenting',
      'ready',
      'processing',
      'reviewing',
      'deleting',
      'deletionFailed',
      'deleted'
    )
  ),
  active_job_id uuid,
  consent jsonb,
  analysis_result jsonb,
  approved_artifacts jsonb not null default '[]'::jsonb,
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, mission_id),
  unique (id, user_id),
  check (jsonb_typeof(approved_artifacts) = 'array'),
  check (
    (state in ('processing', 'reviewing') and active_job_id is not null)
    or (state not in ('processing', 'reviewing') and active_job_id is null)
  )
);

create table if not exists public.copilot_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  dossier_id uuid not null,
  mission_id text not null check (char_length(mission_id) between 1 and 256),
  attempt_id text not null check (char_length(attempt_id) between 1 and 128),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  billing_key text not null check (char_length(billing_key) between 3 and 400),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  operation_kind text not null check (
    operation_kind in ('analysis', 'pitch', 'cover-message', 'cv-summary', 'tjm-coach')
  ),
  state text not null check (
    state in (
      'idle',
      'authorizing',
      'reserving',
      'queued',
      'running',
      'validating',
      'review',
      'accepted',
      'rejected',
      'cancelling',
      'refunding',
      'uncertain',
      'failed',
      'cancelled'
    )
  ),
  credit_cost smallint not null check (credit_cost in (0, 1)),
  supplied_evidence_ids text[] not null default '{}',
  consent_selection jsonb not null,
  tjm_facts jsonb,
  input_payload jsonb not null,
  result jsonb,
  failure jsonb,
  provider_dispatched_at timestamptz,
  provider_disposition_known boolean not null default false,
  reservation_status text not null check (
    reservation_status in ('not-required', 'required', 'reserved')
  ),
  reservation_transaction_id uuid,
  refund_status text not null check (
    refund_status in ('not-required', 'pending', 'refunded')
  ),
  refund_transaction_id uuid,
  settlement text check (settlement is null or settlement in ('failure', 'cancellation')),
  uncertain_phase text check (
    uncertain_phase is null or uncertain_phase in ('reservation', 'provider', 'cancellation', 'refund')
  ),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  unique (user_id, billing_key),
  unique (id, user_id),
  unique (id, user_id, dossier_id),
  foreign key (dossier_id, user_id)
    references public.copilot_dossiers(id, user_id) on delete cascade,
  check (
    (operation_kind = 'analysis' and credit_cost = 0)
    or (operation_kind <> 'analysis' and credit_cost = 1)
  ),
  check (
    (operation_kind = 'tjm-coach' and tjm_facts is not null)
    or (operation_kind <> 'tjm-coach' and tjm_facts is null)
  ),
  constraint copilot_jobs_credit_projection_coherent check (
    (
      credit_cost = 0
      and reservation_status = 'not-required'
      and reservation_transaction_id is null
      and refund_status = 'not-required'
      and refund_transaction_id is null
    )
    or (
      credit_cost = 1
      and (
        (
          reservation_status = 'required'
          and reservation_transaction_id is null
          and refund_status = 'not-required'
          and refund_transaction_id is null
        )
        or (
          reservation_status = 'reserved'
          and reservation_transaction_id is not null
          and (
            (refund_status = 'pending' and refund_transaction_id is null)
            or (refund_status = 'refunded' and refund_transaction_id is not null)
          )
        )
      )
    )
  ),
  check (cardinality(supplied_evidence_ids) <= 24),
  check (jsonb_typeof(consent_selection) = 'object')
);

-- Provider handles are deliberately split from user-readable dossier/job rows.
-- This table has RLS enabled and no authenticated policy.
create table if not exists public.copilot_provider_sessions (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  provider_session_id text not null check (char_length(provider_session_id) between 1 and 512),
  continuation_token text,
  active_job_id uuid,
  active_provider_run_id text,
  continuation_eligible boolean not null default false,
  deletion_disposition text not null default 'pending' check (
    deletion_disposition in ('pending', 'uncertain', 'deleted', 'retention-confirmed')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_session_id),
  unique (dossier_id, provider_session_id),
  foreign key (dossier_id, user_id)
    references public.copilot_dossiers(id, user_id) on delete cascade,
  foreign key (active_job_id, user_id, dossier_id)
    references public.copilot_jobs(id, user_id, dossier_id)
    on delete set null (active_job_id)
);

-- Admission survives dossier deletion. It contains counts only: no mission,
-- input, evidence, provider handle or generated content.
create table if not exists public.copilot_daily_admissions (
  user_id uuid references auth.users(id) on delete cascade not null,
  utc_day date not null,
  total_count smallint not null default 0 check (total_count between 0 and 20),
  analysis_count smallint not null default 0 check (analysis_count between 0 and 10),
  updated_at timestamptz not null default now(),
  primary key (user_id, utc_day),
  check (analysis_count <= total_count)
);

-- Payload-free replay receipts outlive the dossier for 90 days. They retain
-- only the idempotency boundary and input hash required to reject recreation.
create table if not exists public.copilot_deleted_job_receipts (
  user_id uuid references auth.users(id) on delete cascade not null,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  disposition text not null default 'deleted' check (disposition = 'deleted'),
  deleted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, idempotency_key),
  check (expires_at > deleted_at)
);

alter table public.credit_transactions
  add column if not exists copilot_job_id uuid,
  add column if not exists copilot_billing_key text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'copilot_dossiers_active_job_owner_fkey'
      and conrelid = 'public.copilot_dossiers'::regclass
  ) then
    alter table public.copilot_dossiers
      add constraint copilot_dossiers_active_job_owner_fkey
      foreign key (active_job_id, user_id, id)
      references public.copilot_jobs(id, user_id, dossier_id)
      on delete set null (active_job_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'credit_transactions_copilot_job_id_fkey'
      and conrelid = 'public.credit_transactions'::regclass
  ) then
    alter table public.credit_transactions
      add constraint credit_transactions_copilot_job_id_fkey
      foreign key (copilot_job_id) references public.copilot_jobs(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'copilot_jobs_reservation_transaction_id_fkey'
      and conrelid = 'public.copilot_jobs'::regclass
  ) then
    alter table public.copilot_jobs
      add constraint copilot_jobs_reservation_transaction_id_fkey
      foreign key (reservation_transaction_id)
      references public.credit_transactions(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'copilot_jobs_refund_transaction_id_fkey'
      and conrelid = 'public.copilot_jobs'::regclass
  ) then
    alter table public.copilot_jobs
      add constraint copilot_jobs_refund_transaction_id_fkey
      foreign key (refund_transaction_id)
      references public.credit_transactions(id) on delete set null;
  end if;
end $$;

create unique index if not exists idx_copilot_credit_reservation_once
  on public.credit_transactions (user_id, copilot_billing_key)
  where reason = 'generation' and source = 'copilot_reservation';

create unique index if not exists idx_copilot_credit_refund_once
  on public.credit_transactions (user_id, copilot_billing_key)
  where reason = 'adjustment' and source = 'copilot_refund';

create index if not exists idx_credit_transactions_copilot_job
  on public.credit_transactions (copilot_job_id)
  where copilot_job_id is not null;

create index if not exists idx_copilot_dossiers_user_updated
  on public.copilot_dossiers (user_id, updated_at desc);

create index if not exists idx_copilot_jobs_user_dossier_created
  on public.copilot_jobs (user_id, dossier_id, created_at desc);

create index if not exists idx_copilot_jobs_user_state
  on public.copilot_jobs (user_id, state);

create index if not exists idx_copilot_provider_sessions_user
  on public.copilot_provider_sessions (user_id);

create unique index if not exists idx_copilot_provider_session_reusable
  on public.copilot_provider_sessions (dossier_id)
  where continuation_eligible;

create index if not exists idx_copilot_deleted_job_receipts_expiry
  on public.copilot_deleted_job_receipts (expires_at, user_id, idempotency_key);

alter table public.copilot_dossiers enable row level security;
alter table public.copilot_jobs enable row level security;
alter table public.copilot_provider_sessions enable row level security;
alter table public.copilot_daily_admissions enable row level security;
alter table public.copilot_deleted_job_receipts enable row level security;

drop policy if exists "Users can read own copilot dossiers" on public.copilot_dossiers;
create policy "Users can read own copilot dossiers"
  on public.copilot_dossiers for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own copilot jobs" on public.copilot_jobs;
create policy "Users can read own copilot jobs"
  on public.copilot_jobs for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Provider sessions remain service-role only. RLS intentionally has no user policy.
revoke all on public.copilot_dossiers from anon;
revoke all on public.copilot_jobs from anon;
revoke all on public.copilot_provider_sessions from anon, authenticated;
revoke all on public.copilot_daily_admissions from anon, authenticated;
revoke all on public.copilot_deleted_job_receipts from anon, authenticated;
revoke insert, update, delete on public.copilot_dossiers from authenticated;
revoke insert, update, delete on public.copilot_jobs from authenticated;
grant select on public.copilot_dossiers, public.copilot_jobs to authenticated;
grant all on public.copilot_dossiers, public.copilot_jobs, public.copilot_provider_sessions
  to service_role;
grant all on public.copilot_daily_admissions, public.copilot_deleted_job_receipts
  to service_role;

drop trigger if exists on_copilot_dossiers_updated on public.copilot_dossiers;
create trigger on_copilot_dossiers_updated
  before update on public.copilot_dossiers
  for each row execute function public.update_updated_at();

drop trigger if exists on_copilot_jobs_updated on public.copilot_jobs;
create trigger on_copilot_jobs_updated
  before update on public.copilot_jobs
  for each row execute function public.update_updated_at();

drop trigger if exists on_copilot_provider_sessions_updated on public.copilot_provider_sessions;
create trigger on_copilot_provider_sessions_updated
  before update on public.copilot_provider_sessions
  for each row execute function public.update_updated_at();

-- Monotonic consent expansion is serialized on the dossier row. Concurrent
-- expansions cannot overwrite or remove a field accepted by another request.
create or replace function public.expand_copilot_consent(
  p_user_id uuid,
  p_dossier_id uuid,
  p_consent jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dossier public.copilot_dossiers%rowtype;
  v_consent jsonb;
begin
  select * into v_dossier
  from public.copilot_dossiers
  where id = p_dossier_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'COPILOT_DOSSIER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_dossier.state <> 'ready'
    or jsonb_typeof(p_consent) is distinct from 'object'
    or jsonb_typeof(p_consent->'missionFields') is distinct from 'array'
    or jsonb_typeof(p_consent->'profileFields') is distinct from 'array'
    or jsonb_typeof(p_consent->'evidenceIds') is distinct from 'array'
    or jsonb_typeof(p_consent->'confirmedAtMs') is distinct from 'number'
    or not (p_consent->'missionFields') <@ '["title","description","client","stack","location","remoteMode","duration","startDate","displayedTjm"]'::jsonb
    or not (p_consent->'profileFields') <@ '["jobTitle","seniority","location","keywords","stack","tjmBounds"]'::jsonb
    or exists (
      select 1 from jsonb_array_elements(p_consent->'evidenceIds') item
      where jsonb_typeof(item) <> 'string' or char_length(trim(both '"' from item::text)) = 0
    )
  then
    raise exception 'COPILOT_DOSSIER_BUSY' using errcode = 'P0001';
  end if;

  -- A request carries the exact selection for one job. The dossier retains the
  -- cumulative union so later jobs may safely transmit a strict subset.
  select jsonb_build_object(
    'missionFields', coalesce((
      select jsonb_agg(field order by ordinal)
      from (values
        ('title', 1), ('description', 2), ('client', 3), ('stack', 4),
        ('location', 5), ('remoteMode', 6), ('duration', 7), ('startDate', 8),
        ('displayedTjm', 9)
      ) allowed(field, ordinal)
      where (v_dossier.consent->'missionFields') ? field
         or (p_consent->'missionFields') ? field
    ), '[]'::jsonb),
    'profileFields', coalesce((
      select jsonb_agg(field order by ordinal)
      from (values
        ('jobTitle', 1), ('seniority', 2), ('location', 3), ('keywords', 4),
        ('stack', 5), ('tjmBounds', 6)
      ) allowed(field, ordinal)
      where (v_dossier.consent->'profileFields') ? field
         or (p_consent->'profileFields') ? field
    ), '[]'::jsonb),
    'evidenceIds', coalesce((
      select jsonb_agg(evidence_id order by evidence_id)
      from (
        select distinct jsonb_array_elements_text(
          coalesce(v_dossier.consent->'evidenceIds', '[]'::jsonb)
          || (p_consent->'evidenceIds')
        ) as evidence_id
      ) evidence
    ), '[]'::jsonb),
    'confirmedAtMs', greatest(
      coalesce((v_dossier.consent->>'confirmedAtMs')::bigint, 0),
      (p_consent->>'confirmedAtMs')::bigint
    )
  ) into v_consent;

  if jsonb_array_length(v_consent->'missionFields') > 9
    or jsonb_array_length(v_consent->'profileFields') > 6
    or jsonb_array_length(v_consent->'evidenceIds') > 24
    or jsonb_array_length(v_consent->'missionFields')
       + jsonb_array_length(v_consent->'profileFields')
       + jsonb_array_length(v_consent->'evidenceIds') = 0
    or exists (
      select 1 from jsonb_array_elements_text(v_consent->'evidenceIds') evidence_id
      where char_length(evidence_id) > 8000
    )
  then
    raise exception 'COPILOT_CONSENT_LIMIT_EXCEEDED' using errcode = 'P0001';
  end if;

  update public.copilot_dossiers
  set consent = v_consent
  where id = p_dossier_id and user_id = p_user_id;
  return p_dossier_id;
end;
$$;

-- Physically enforce the receipt-retention boundary in small lock-safe batches.
-- Only service-role callers may invoke this directly; admission/replay functions
-- also use it opportunistically before checking a live receipt.
create or replace function public.purge_expired_copilot_deleted_job_receipts(
  p_limit integer default 1000
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception 'COPILOT_INVALID_PURGE_LIMIT' using errcode = 'P0001';
  end if;

  with expired as (
    select user_id, idempotency_key
    from public.copilot_deleted_job_receipts
    where expires_at <= now()
    order by expires_at, user_id, idempotency_key
    limit p_limit
    for update skip locked
  ), deleted as (
    delete from public.copilot_deleted_job_receipts receipt
    using expired
    where receipt.user_id = expired.user_id
      and receipt.idempotency_key = expired.idempotency_key
    returning 1
  )
  select count(*) into v_deleted from deleted;

  return v_deleted;
end;
$$;

-- Read-only preflight used before dossier creation. The authoritative expiry
-- clock is PostgreSQL's clock, identical to begin_copilot_job.
create or replace function public.assert_copilot_job_replay_allowed(
  p_user_id uuid,
  p_idempotency_key text,
  p_input_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.copilot_deleted_job_receipts%rowtype;
begin
  perform public.purge_expired_copilot_deleted_job_receipts(100);

  select * into v_receipt
  from public.copilot_deleted_job_receipts
  where user_id = p_user_id
    and idempotency_key = p_idempotency_key
    and expires_at > now();
  if not found then
    return true;
  end if;
  if v_receipt.input_hash <> p_input_hash then
    raise exception 'COPILOT_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;
  raise exception 'COPILOT_JOB_GONE' using errcode = 'P0001';
end;
$$;

-- Serializes a dossier claim with canonical POST idempotency. Two callers with
-- the same logical key get the same job; a different concurrent job is denied.
create or replace function public.begin_copilot_job(
  p_user_id uuid,
  p_dossier_id uuid,
  p_job_id uuid,
  p_attempt_id text,
  p_idempotency_key text,
  p_billing_key text,
  p_input_hash text,
  p_operation_kind text,
  p_supplied_evidence_ids text[],
  p_consent_selection jsonb,
  p_tjm_facts jsonb,
  p_input_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_job public.copilot_jobs%rowtype;
  v_deleted_receipt public.copilot_deleted_job_receipts%rowtype;
  v_dossier public.copilot_dossiers%rowtype;
  v_credit_cost smallint;
  v_daily_jobs integer;
  v_daily_analyses integer;
  v_utc_day date;
begin
  perform public.purge_expired_copilot_deleted_job_receipts(100);

  select * into v_deleted_receipt
  from public.copilot_deleted_job_receipts
  where user_id = p_user_id
    and idempotency_key = p_idempotency_key
    and expires_at > now();
  if found then
    if v_deleted_receipt.input_hash <> p_input_hash then
      raise exception 'COPILOT_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    raise exception 'COPILOT_JOB_GONE' using errcode = 'P0001';
  end if;

  select * into v_existing_job
  from public.copilot_jobs
  where user_id = p_user_id and idempotency_key = p_idempotency_key;

  if found then
    if v_existing_job.input_hash <> p_input_hash
      or v_existing_job.dossier_id <> p_dossier_id
      or v_existing_job.operation_kind <> p_operation_kind
    then
      raise exception 'COPILOT_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return jsonb_build_object('disposition', 'duplicate', 'job_id', v_existing_job.id);
  end if;

  select * into v_dossier
  from public.copilot_dossiers
  where id = p_dossier_id and user_id = p_user_id
  for update;

  if not found then
    select * into v_deleted_receipt
    from public.copilot_deleted_job_receipts
    where user_id = p_user_id
      and idempotency_key = p_idempotency_key
      and expires_at > now();
    if found then
      if v_deleted_receipt.input_hash <> p_input_hash then
        raise exception 'COPILOT_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
      end if;
      raise exception 'COPILOT_JOB_GONE' using errcode = 'P0001';
    end if;
    raise exception 'COPILOT_DOSSIER_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Re-check after the dossier lock because another request may have committed
  -- the same idempotency key while this transaction was waiting.
  select * into v_existing_job
  from public.copilot_jobs
  where user_id = p_user_id and idempotency_key = p_idempotency_key;

  if found then
    if v_existing_job.input_hash <> p_input_hash
      or v_existing_job.dossier_id <> p_dossier_id
      or v_existing_job.operation_kind <> p_operation_kind
    then
      raise exception 'COPILOT_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return jsonb_build_object('disposition', 'duplicate', 'job_id', v_existing_job.id);
  end if;

  if v_dossier.state <> 'ready' or v_dossier.active_job_id is not null then
    raise exception 'COPILOT_DOSSIER_BUSY' using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_consent_selection) is distinct from 'object'
    or jsonb_typeof(p_consent_selection->'missionFields') is distinct from 'array'
    or jsonb_typeof(p_consent_selection->'profileFields') is distinct from 'array'
    or jsonb_typeof(p_consent_selection->'evidenceIds') is distinct from 'array'
    or not (p_consent_selection->'missionFields') <@ coalesce(v_dossier.consent->'missionFields', '[]'::jsonb)
    or not (p_consent_selection->'profileFields') <@ coalesce(v_dossier.consent->'profileFields', '[]'::jsonb)
    or not (p_consent_selection->'evidenceIds') <@ coalesce(v_dossier.consent->'evidenceIds', '[]'::jsonb)
    or jsonb_array_length(p_consent_selection->'missionFields')
       + jsonb_array_length(p_consent_selection->'profileFields')
       + jsonb_array_length(p_consent_selection->'evidenceIds') = 0
    or jsonb_typeof(p_input_payload) is distinct from 'object'
    or jsonb_typeof(p_input_payload->'mission') is distinct from 'object'
    or jsonb_typeof(p_input_payload->'profile') is distinct from 'object'
    or jsonb_typeof(p_input_payload->'experienceEvidence') is distinct from 'array'
    or (p_input_payload - 'mission' - 'profile' - 'experienceEvidence') <> '{}'::jsonb
    or exists (
      select 1 from jsonb_object_keys(p_input_payload->'mission') field
      where not (p_consent_selection->'missionFields') ? field
    )
    or exists (
      select 1 from jsonb_object_keys(p_input_payload->'profile') field
      where not (p_consent_selection->'profileFields') ? field
    )
    or exists (
      select 1 from jsonb_array_elements(p_input_payload->'experienceEvidence') evidence
      where jsonb_typeof(evidence) <> 'object'
        or jsonb_typeof(evidence->'evidenceId') <> 'string'
        or not (p_consent_selection->'evidenceIds') ? (evidence->>'evidenceId')
    )
    or not to_jsonb(p_supplied_evidence_ids) <@ (p_consent_selection->'evidenceIds')
    or cardinality(p_supplied_evidence_ids) <> (
      select count(distinct evidence->>'evidenceId')
      from jsonb_array_elements(p_input_payload->'experienceEvidence') evidence
    )
    or jsonb_array_length(p_input_payload->'experienceEvidence') <> (
      select count(distinct evidence->>'evidenceId')
      from jsonb_array_elements(p_input_payload->'experienceEvidence') evidence
    )
    or cardinality(p_supplied_evidence_ids) <> (
      select count(distinct supplied_id) from unnest(p_supplied_evidence_ids) supplied_id
    )
    or not to_jsonb(p_supplied_evidence_ids) @> coalesce((
      select jsonb_agg(evidence->>'evidenceId')
      from jsonb_array_elements(p_input_payload->'experienceEvidence') evidence
    ), '[]'::jsonb)
  then
    raise exception 'COPILOT_INPUT_INVALID' using errcode = 'P0001';
  end if;

  -- Serialize the pilot quota across every dossier for this user. Canonical
  -- idempotent retries returned above and never consume a second quota slot.
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'COPILOT_PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Re-check after the user-level lock because another dossier may have
  -- committed this idempotency key while this transaction was waiting.
  select * into v_existing_job
  from public.copilot_jobs
  where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing_job.input_hash <> p_input_hash
      or v_existing_job.dossier_id <> p_dossier_id
      or v_existing_job.operation_kind <> p_operation_kind
    then
      raise exception 'COPILOT_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return jsonb_build_object('disposition', 'duplicate', 'job_id', v_existing_job.id);
  end if;

  v_utc_day := timezone('UTC', now())::date;
  insert into public.copilot_daily_admissions (user_id, utc_day)
  values (p_user_id, v_utc_day)
  on conflict (user_id, utc_day) do nothing;

  select total_count, analysis_count
  into v_daily_jobs, v_daily_analyses
  from public.copilot_daily_admissions
  where user_id = p_user_id and utc_day = v_utc_day
  for update;

  if v_daily_jobs >= 20
    or (p_operation_kind = 'analysis' and v_daily_analyses >= 10)
  then
    raise exception 'COPILOT_RATE_LIMITED' using errcode = 'P0001';
  end if;

  v_credit_cost := case when p_operation_kind = 'analysis' then 0 else 1 end;

  update public.copilot_daily_admissions
  set total_count = total_count + 1,
      analysis_count = analysis_count + case when p_operation_kind = 'analysis' then 1 else 0 end,
      updated_at = now()
  where user_id = p_user_id and utc_day = v_utc_day;

  insert into public.copilot_jobs (
    id,
    user_id,
    dossier_id,
    mission_id,
    attempt_id,
    idempotency_key,
    billing_key,
    input_hash,
    operation_kind,
    state,
    credit_cost,
    supplied_evidence_ids,
    consent_selection,
    tjm_facts,
    input_payload,
    reservation_status,
    refund_status
  ) values (
    p_job_id,
    p_user_id,
    p_dossier_id,
    v_dossier.mission_id,
    p_attempt_id,
    p_idempotency_key,
    p_billing_key,
    p_input_hash,
    p_operation_kind,
    case when v_credit_cost = 0 then 'queued' else 'reserving' end,
    v_credit_cost,
    p_supplied_evidence_ids,
    p_consent_selection,
    p_tjm_facts,
    p_input_payload,
    case when v_credit_cost = 0 then 'not-required' else 'required' end,
    'not-required'
  );

  update public.copilot_dossiers
  set state = 'processing', active_job_id = p_job_id
  where id = p_dossier_id and user_id = p_user_id;

  return jsonb_build_object('disposition', 'created', 'job_id', p_job_id);
end;
$$;

create or replace function public.reserve_copilot_credit(
  p_user_id uuid,
  p_job_id uuid,
  p_billing_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.copilot_jobs%rowtype;
  v_balance integer;
  v_subscription_status text;
  v_subscription_period_end timestamptz;
  v_revoked_at timestamptz;
  v_transaction_id uuid;
begin
  select * into v_job
  from public.copilot_jobs
  where id = p_job_id
    and user_id = p_user_id
    and billing_key = p_billing_key
  for update;

  if not found then
    raise exception 'COPILOT_JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- A committed reservation is the canonical response even if its first
  -- response was lost. This lookup intentionally precedes entitlement: an
  -- expired/revoked user must still recover the already-paid canonical job.
  if v_job.credit_cost = 1 then
    select id into v_transaction_id
    from public.credit_transactions
    where user_id = p_user_id
      and copilot_job_id = p_job_id
      and copilot_billing_key = p_billing_key
      and reason = 'generation'
      and source = 'copilot_reservation';

    if found then
      select credit_balance into v_balance
      from public.profiles
      where id = p_user_id;
      return jsonb_build_object(
        'status', 'reserved',
        'reservation_id', v_transaction_id,
        'balance', v_balance
      );
    end if;
  end if;

  select credit_balance, subscription_status, subscription_period_end, copilot_access_revoked_at
    into v_balance, v_subscription_status, v_subscription_period_end, v_revoked_at
  from public.profiles
  where id = p_user_id
  for update;

  if not found
    or v_subscription_status <> 'premium'
    or v_subscription_period_end is null
    or v_subscription_period_end <= now()
    or v_revoked_at is not null
  then
    raise exception 'COPILOT_ENTITLEMENT_DENIED' using errcode = 'P0001';
  end if;

  if v_job.credit_cost = 0
    and v_job.state = 'queued'
    and v_job.reservation_status = 'not-required'
  then
    return jsonb_build_object(
      'status', 'not-required',
      'reservation_id', null,
      'balance', v_balance
    );
  end if;

  if v_job.state not in ('reserving', 'queued') then
    raise exception 'COPILOT_RESERVATION_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  -- Included analysis still requires a currently active Premium entitlement.
  if v_job.credit_cost = 0 then
    update public.copilot_jobs
    set state = 'queued',
        reservation_status = 'not-required',
        refund_status = 'not-required'
    where id = p_job_id and user_id = p_user_id;
    return jsonb_build_object(
      'status', 'not-required',
      'reservation_id', null,
      'balance', v_balance
    );
  end if;

  if v_job.credit_cost <> 1 then
    raise exception 'COPILOT_RESERVATION_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  if v_balance < v_job.credit_cost then
    raise exception 'COPILOT_INSUFFICIENT_CREDITS' using errcode = 'P0001';
  end if;

  update public.profiles
  set credit_balance = credit_balance - v_job.credit_cost
  where id = p_user_id
  returning credit_balance into v_balance;

  insert into public.credit_transactions (
    user_id,
    amount,
    reason,
    source,
    copilot_job_id,
    copilot_billing_key,
    metadata
  ) values (
    p_user_id,
    -v_job.credit_cost,
    'generation',
    'copilot_reservation',
    p_job_id,
    p_billing_key,
    jsonb_build_object('job_id', p_job_id, 'operation_kind', v_job.operation_kind)
  )
  returning id into v_transaction_id;

  update public.copilot_jobs
  set state = 'queued',
      reservation_status = 'reserved',
      reservation_transaction_id = v_transaction_id,
      refund_status = 'pending'
  where id = p_job_id and user_id = p_user_id;

  return jsonb_build_object(
    'status', 'reserved',
    'reservation_id', v_transaction_id,
    'balance', v_balance
  );
end;
$$;

-- Persisting a provider handle and the per-job deletion proof is one durable
-- transition. The session is never continuation-eligible at this boundary;
-- only complete_copilot_review may grant that state after user acceptance.
create or replace function public.record_copilot_provider_session(
  p_user_id uuid,
  p_dossier_id uuid,
  p_job_id uuid,
  p_provider_session_id text,
  p_continuation_token text,
  p_provider_run_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.copilot_jobs%rowtype;
  v_dossier public.copilot_dossiers%rowtype;
  v_session_id uuid;
  v_session_rows integer;
begin
  if coalesce(char_length(trim(p_provider_session_id)), 0) = 0
    or coalesce(char_length(trim(p_provider_run_id)), 0) = 0
  then
    raise exception 'COPILOT_PROVIDER_SESSION_INVALID' using errcode = 'P0001';
  end if;

  select * into v_job
  from public.copilot_jobs
  where id = p_job_id and user_id = p_user_id and dossier_id = p_dossier_id
  for update;

  if not found then
    raise exception 'COPILOT_JOB_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_job.state <> 'running' then
    raise exception 'COPILOT_PROVIDER_SESSION_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  select * into v_dossier
  from public.copilot_dossiers
  where id = p_dossier_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'COPILOT_DOSSIER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_dossier.state <> 'processing' or v_dossier.active_job_id <> p_job_id then
    raise exception 'COPILOT_PROVIDER_SESSION_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  insert into public.copilot_provider_sessions (
    user_id,
    dossier_id,
    provider_session_id,
    continuation_token,
    active_job_id,
    active_provider_run_id,
    continuation_eligible
  ) values (
    p_user_id,
    p_dossier_id,
    p_provider_session_id,
    p_continuation_token,
    p_job_id,
    p_provider_run_id,
    false
  )
  on conflict (provider_session_id) do update
  set continuation_token = excluded.continuation_token,
      active_job_id = excluded.active_job_id,
      active_provider_run_id = excluded.active_provider_run_id,
      continuation_eligible = false
  where public.copilot_provider_sessions.user_id = excluded.user_id
    and public.copilot_provider_sessions.dossier_id = excluded.dossier_id
    and public.copilot_provider_sessions.active_job_id = excluded.active_job_id
  returning id into v_session_id;

  get diagnostics v_session_rows = row_count;
  if v_session_rows <> 1 or v_session_id is null then
    raise exception 'COPILOT_PROVIDER_SESSION_CONFLICT' using errcode = 'P0001';
  end if;

  update public.copilot_jobs
  set provider_disposition_known = true
  where id = p_job_id and user_id = p_user_id and dossier_id = p_dossier_id;

  return v_session_id;
end;
$$;

-- Jobs that never held a credit reservation terminalize with their dossier in
-- one transaction. Idempotent retries return the canonical terminal job.
create or replace function public.settle_copilot_job_without_credit(
  p_user_id uuid,
  p_dossier_id uuid,
  p_job_id uuid,
  p_terminal_state text,
  p_failure jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.copilot_jobs%rowtype;
  v_dossier public.copilot_dossiers%rowtype;
begin
  if p_terminal_state not in ('failed', 'cancelled')
    or (p_terminal_state = 'failed' and jsonb_typeof(p_failure) is distinct from 'object')
    or (p_terminal_state = 'cancelled' and p_failure is not null)
  then
    raise exception 'COPILOT_TERMINAL_INVALID' using errcode = 'P0001';
  end if;

  select * into v_dossier
  from public.copilot_dossiers
  where id = p_dossier_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'COPILOT_DOSSIER_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_job
  from public.copilot_jobs
  where id = p_job_id and user_id = p_user_id and dossier_id = p_dossier_id
  for update;

  if not found then
    raise exception 'COPILOT_JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_job.reservation_status = 'reserved'
    or v_job.reservation_transaction_id is not null
    or exists (
      select 1 from public.credit_transactions
      where user_id = p_user_id
        and copilot_job_id = p_job_id
        and reason = 'generation'
        and source = 'copilot_reservation'
    )
  then
    raise exception 'COPILOT_TERMINAL_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  if v_job.state = p_terminal_state then
    if v_dossier.state = 'ready' and v_dossier.active_job_id is null then
      return v_job.id;
    end if;
    if v_dossier.state <> 'processing' or v_dossier.active_job_id <> p_job_id then
      raise exception 'COPILOT_TERMINAL_NOT_ALLOWED' using errcode = 'P0001';
    end if;
    update public.copilot_dossiers
    set state = 'ready', active_job_id = null
    where id = p_dossier_id and user_id = p_user_id;
    return v_job.id;
  end if;

  if (p_terminal_state = 'failed' and v_job.state not in ('reserving', 'queued', 'running'))
    or (p_terminal_state = 'cancelled' and v_job.state <> 'cancelling')
    or v_dossier.state <> 'processing'
    or v_dossier.active_job_id <> p_job_id
  then
    raise exception 'COPILOT_TERMINAL_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  update public.copilot_jobs
  set state = p_terminal_state,
      failure = case when p_terminal_state = 'failed' then p_failure else null end,
      refund_status = 'not-required',
      settlement = null,
      uncertain_phase = null
  where id = p_job_id and user_id = p_user_id and dossier_id = p_dossier_id;

  update public.copilot_dossiers
  set state = 'ready', active_job_id = null
  where id = p_dossier_id and user_id = p_user_id;

  return p_job_id;
end;
$$;

-- Atomically consumes the sole continuation accepted by the user. It becomes
-- ineligible before any new provider dispatch, so a crash or rejected/failed
-- turn can never contaminate a later request.
create or replace function public.claim_copilot_provider_session(
  p_user_id uuid,
  p_dossier_id uuid,
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.copilot_jobs%rowtype;
  v_dossier public.copilot_dossiers%rowtype;
  v_session public.copilot_provider_sessions%rowtype;
begin
  select * into v_job
  from public.copilot_jobs
  where id = p_job_id and user_id = p_user_id and dossier_id = p_dossier_id
  for update;
  if not found or v_job.state <> 'queued' then
    raise exception 'COPILOT_PROVIDER_SESSION_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  select * into v_dossier
  from public.copilot_dossiers
  where id = p_dossier_id and user_id = p_user_id
  for update;
  if not found
    or v_dossier.state <> 'processing'
    or v_dossier.active_job_id <> p_job_id
  then
    raise exception 'COPILOT_PROVIDER_SESSION_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  select * into v_session
  from public.copilot_provider_sessions
  where user_id = p_user_id
    and dossier_id = p_dossier_id
    and continuation_eligible
  for update;

  if not found then
    return null;
  end if;

  update public.copilot_provider_sessions
  set continuation_eligible = false,
      active_job_id = p_job_id,
      active_provider_run_id = null
  where id = v_session.id;

  return jsonb_build_object(
    'user_id', v_session.user_id,
    'dossier_id', v_session.dossier_id,
    'provider_session_id', v_session.provider_session_id,
    'continuation_token', v_session.continuation_token,
    'active_job_id', p_job_id,
    'active_provider_run_id', null,
    'continuation_eligible', false,
    'deletion_disposition', v_session.deletion_disposition
  );
end;
$$;

-- Review acceptance/rejection and dossier projection are one transaction. A
-- lost response may be retried with the same decision and returns canonically.
create or replace function public.complete_copilot_review(
  p_user_id uuid,
  p_dossier_id uuid,
  p_job_id uuid,
  p_decision text,
  p_artifact_id uuid,
  p_rendered_draft text,
  p_reviewed_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.copilot_jobs%rowtype;
  v_dossier public.copilot_dossiers%rowtype;
  v_terminal_state text;
  v_approved_at_ms bigint;
begin
  if p_decision not in ('accept', 'reject') or p_reviewed_at is null then
    raise exception 'COPILOT_REVIEW_INVALID' using errcode = 'P0001';
  end if;
  v_terminal_state := case when p_decision = 'accept' then 'accepted' else 'rejected' end;
  v_approved_at_ms := floor(extract(epoch from p_reviewed_at) * 1000)::bigint;

  select * into v_job
  from public.copilot_jobs
  where id = p_job_id and user_id = p_user_id and dossier_id = p_dossier_id
  for update;

  if not found then
    raise exception 'COPILOT_JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_job.state in ('accepted', 'rejected') then
    if v_job.state = v_terminal_state and v_job.reviewed_at is not null then
      return v_job.id;
    end if;
    raise exception 'COPILOT_REVIEW_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  if v_job.state <> 'review'
    or v_job.result is null
    or v_job.reviewed_at is not null
    or v_job.result->>'kind' <> v_job.operation_kind
  then
    raise exception 'COPILOT_REVIEW_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  select * into v_dossier
  from public.copilot_dossiers
  where id = p_dossier_id and user_id = p_user_id
  for update;

  if not found
    or v_dossier.state <> 'reviewing'
    or v_dossier.active_job_id <> p_job_id
  then
    raise exception 'COPILOT_REVIEW_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  if p_decision = 'accept' and v_job.operation_kind = 'analysis' then
    if p_artifact_id is not null or p_rendered_draft is not null then
      raise exception 'COPILOT_REVIEW_INVALID' using errcode = 'P0001';
    end if;
    update public.copilot_dossiers
    set state = 'ready',
        active_job_id = null,
        analysis_result = jsonb_build_object(
          'jobId', v_job.id,
          'result', v_job.result,
          'approvedAtMs', v_approved_at_ms
        )
    where id = p_dossier_id and user_id = p_user_id;
  elsif p_decision = 'accept' then
    if p_artifact_id is null
      or coalesce(char_length(p_rendered_draft), 0) = 0
      or jsonb_typeof(v_job.result->'draftSegments') <> 'array'
      or jsonb_array_length(v_job.result->'draftSegments') = 0
    then
      raise exception 'COPILOT_REVIEW_INVALID' using errcode = 'P0001';
    end if;
    update public.copilot_dossiers
    set state = 'ready',
        active_job_id = null,
        approved_artifacts = approved_artifacts || jsonb_build_array(
          jsonb_build_object(
            'artifactId', p_artifact_id,
            'jobId', v_job.id,
            'kind', v_job.operation_kind,
            'draft', p_rendered_draft,
            'approvedAtMs', v_approved_at_ms
          )
        )
    where id = p_dossier_id and user_id = p_user_id;
  else
    if p_artifact_id is not null or p_rendered_draft is not null then
      raise exception 'COPILOT_REVIEW_INVALID' using errcode = 'P0001';
    end if;
    update public.copilot_dossiers
    set state = 'ready', active_job_id = null
    where id = p_dossier_id and user_id = p_user_id;
  end if;

  update public.copilot_jobs
  set state = v_terminal_state,
      reviewed_at = p_reviewed_at
  where id = p_job_id and user_id = p_user_id;

  -- Only an accepted result may seed the next turn. Rejection retires every
  -- continuation, while acceptance elects exactly the session used by this job.
  update public.copilot_provider_sessions
  set continuation_eligible = false
  where user_id = p_user_id and dossier_id = p_dossier_id;

  if p_decision = 'accept' then
    update public.copilot_provider_sessions
    set continuation_eligible = true
    where user_id = p_user_id
      and dossier_id = p_dossier_id
      and active_job_id = p_job_id;
    if not found then
      raise exception 'COPILOT_PROVIDER_SESSION_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  return v_job.id;
end;
$$;

-- Staging a validated result and exposing the dossier review state is atomic.
create or replace function public.stage_copilot_review(
  p_user_id uuid,
  p_dossier_id uuid,
  p_job_id uuid,
  p_result jsonb,
  p_provider_session_id text,
  p_continuation_token text,
  p_provider_run_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.copilot_jobs%rowtype;
  v_dossier public.copilot_dossiers%rowtype;
  v_session_rows integer;
begin
  if p_result is null
    or coalesce(char_length(trim(p_provider_session_id)), 0) = 0
    or coalesce(char_length(trim(p_provider_run_id)), 0) = 0
  then
    raise exception 'COPILOT_RESULT_INVALID' using errcode = 'P0001';
  end if;

  select * into v_job
  from public.copilot_jobs
  where id = p_job_id and user_id = p_user_id and dossier_id = p_dossier_id
  for update;

  if not found then
    raise exception 'COPILOT_JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_dossier
  from public.copilot_dossiers
  where id = p_dossier_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'COPILOT_DOSSIER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_job.state = 'review'
    and v_dossier.state = 'reviewing'
    and v_dossier.active_job_id = p_job_id
    and v_job.result = p_result
    and exists (
      select 1 from public.copilot_provider_sessions
      where user_id = p_user_id
        and dossier_id = p_dossier_id
        and active_job_id = p_job_id
        and provider_session_id = p_provider_session_id
    )
  then
    return v_job.id;
  end if;

  if v_job.state <> 'running'
    or v_dossier.state <> 'processing'
    or v_dossier.active_job_id <> p_job_id
    or p_result->>'kind' <> v_job.operation_kind
  then
    raise exception 'COPILOT_STAGE_REVIEW_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  insert into public.copilot_provider_sessions (
    user_id,
    dossier_id,
    provider_session_id,
    continuation_token,
    active_job_id,
    active_provider_run_id,
    continuation_eligible
  ) values (
    p_user_id,
    p_dossier_id,
    p_provider_session_id,
    p_continuation_token,
    p_job_id,
    p_provider_run_id,
    false
  )
  on conflict (provider_session_id) do update
  set continuation_token = excluded.continuation_token,
      active_job_id = excluded.active_job_id,
      active_provider_run_id = excluded.active_provider_run_id,
      continuation_eligible = false
  where public.copilot_provider_sessions.user_id = excluded.user_id
    and public.copilot_provider_sessions.dossier_id = excluded.dossier_id
    and public.copilot_provider_sessions.active_job_id = excluded.active_job_id;
  get diagnostics v_session_rows = row_count;
  if v_session_rows <> 1 then
    raise exception 'COPILOT_PROVIDER_SESSION_CONFLICT' using errcode = 'P0001';
  end if;

  update public.copilot_jobs
  set state = 'review',
      result = p_result,
      failure = null,
      uncertain_phase = null,
      provider_disposition_known = true
  where id = p_job_id and user_id = p_user_id;

  update public.copilot_dossiers
  set state = 'reviewing'
  where id = p_dossier_id and user_id = p_user_id and active_job_id = p_job_id;

  return v_job.id;
end;
$$;

create or replace function public.refund_copilot_credit(
  p_user_id uuid,
  p_job_id uuid,
  p_billing_key text,
  p_terminal_state text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.copilot_jobs%rowtype;
  v_dossier public.copilot_dossiers%rowtype;
  v_dossier_id uuid;
  v_balance integer;
  v_reservation_id uuid;
  v_refund_id uuid;
begin
  if p_terminal_state not in ('failed', 'cancelled') then
    raise exception 'COPILOT_REFUND_TERMINAL_INVALID' using errcode = 'P0001';
  end if;

  select dossier_id into v_dossier_id
  from public.copilot_jobs
  where id = p_job_id
    and user_id = p_user_id
    and billing_key = p_billing_key;

  if not found then
    raise exception 'COPILOT_JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_dossier
  from public.copilot_dossiers
  where id = v_dossier_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'COPILOT_DOSSIER_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_job
  from public.copilot_jobs
  where id = p_job_id
    and user_id = p_user_id
    and dossier_id = v_dossier_id
    and billing_key = p_billing_key
  for update;
  if not found then
    raise exception 'COPILOT_JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Duplicate settlement calls return the canonical refund. This lookup must
  -- precede the state guard because the first call makes the job terminal.
  select id into v_refund_id
  from public.credit_transactions
  where user_id = p_user_id
    and copilot_job_id = p_job_id
    and copilot_billing_key = p_billing_key
    and reason = 'adjustment'
    and source = 'copilot_refund';

  if found then
    select credit_balance into v_balance
    from public.profiles
    where id = p_user_id;
    if v_dossier.state = 'processing' and v_dossier.active_job_id = p_job_id then
      update public.copilot_dossiers
      set state = 'ready', active_job_id = null
      where id = v_job.dossier_id and user_id = p_user_id
        and active_job_id = p_job_id;
    end if;
    return jsonb_build_object(
      'status', 'refunded',
      'refund_id', v_refund_id,
      'balance', coalesce(v_balance, 0)
    );
  end if;

  -- A reviewed or otherwise successful output can never be refunded, even if
  -- this service-role-only RPC is called incorrectly.
  if v_job.credit_cost <> 1
    or v_job.state <> 'refunding'
    or v_job.result is not null
    or v_job.reviewed_at is not null
    or v_dossier.state <> 'processing'
    or v_dossier.active_job_id is distinct from p_job_id
  then
    raise exception 'COPILOT_REFUND_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  select id into v_reservation_id
  from public.credit_transactions
  where user_id = p_user_id
    and copilot_billing_key = p_billing_key
    and reason = 'generation'
    and source = 'copilot_reservation';

  if not found then
    raise exception 'COPILOT_RESERVATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  select credit_balance into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'COPILOT_PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  update public.profiles
  set credit_balance = credit_balance + v_job.credit_cost
  where id = p_user_id
  returning credit_balance into v_balance;

  insert into public.credit_transactions (
    user_id,
    amount,
    reason,
    source,
    copilot_job_id,
    copilot_billing_key,
    metadata
  ) values (
    p_user_id,
    v_job.credit_cost,
    'adjustment',
    'copilot_refund',
    p_job_id,
    p_billing_key,
    jsonb_build_object(
      'job_id', p_job_id,
      'reservation_id', v_reservation_id,
      'terminal_state', p_terminal_state
    )
  )
  returning id into v_refund_id;

  update public.copilot_jobs
  set state = p_terminal_state,
      refund_status = 'refunded',
      refund_transaction_id = v_refund_id
  where id = p_job_id and user_id = p_user_id;

  update public.copilot_dossiers
  set state = 'ready', active_job_id = null
  where id = v_job.dossier_id and user_id = p_user_id
    and state = 'processing'
    and active_job_id = p_job_id;

  return jsonb_build_object(
    'status', 'refunded',
    'refund_id', v_refund_id,
    'balance', v_balance
  );
end;
$$;

-- Serializes deletion with begin_copilot_job on the same dossier lock. A paid
-- reservation can never disappear through ON DELETE CASCADE before settlement.
create or replace function public.begin_copilot_deletion(
  p_user_id uuid,
  p_dossier_id uuid,
  p_requested_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dossier public.copilot_dossiers%rowtype;
begin
  select * into v_dossier
  from public.copilot_dossiers
  where id = p_dossier_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'COPILOT_DOSSIER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_dossier.state not in ('ready', 'deletionFailed')
    or v_dossier.active_job_id is not null
    or exists (
      select 1
      from public.copilot_jobs j
      where j.user_id = p_user_id
        and j.dossier_id = p_dossier_id
        and (
          j.state in (
            'idle', 'authorizing', 'reserving', 'queued', 'running',
            'validating', 'review', 'cancelling', 'refunding', 'uncertain'
          )
          or (
            j.state in ('failed', 'cancelled')
            and j.credit_cost = 1
            and j.reservation_status = 'reserved'
            and j.refund_status <> 'refunded'
          )
        )
    )
  then
    raise exception 'COPILOT_DELETE_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  update public.copilot_dossiers
  set state = 'deleting', deletion_requested_at = p_requested_at
  where id = p_dossier_id and user_id = p_user_id;
  return p_dossier_id;
end;
$$;

-- The durable pre-effect cut-point. Once claimed, a blind retry is forbidden:
-- reconciliation must confirm the outcome or use provider lookup.
create or replace function public.begin_copilot_provider_session_deletion(
  p_user_id uuid,
  p_dossier_id uuid,
  p_provider_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dossier public.copilot_dossiers%rowtype;
  v_session_id uuid;
begin
  select * into v_dossier
  from public.copilot_dossiers
  where id = p_dossier_id and user_id = p_user_id
  for update;
  if not found or v_dossier.state <> 'deleting' or v_dossier.active_job_id is not null then
    return false;
  end if;

  update public.copilot_provider_sessions
  set deletion_disposition = 'uncertain'
  where user_id = p_user_id
    and dossier_id = p_dossier_id
    and provider_session_id = p_provider_session_id
    and deletion_disposition = 'pending'
  returning id into v_session_id;
  return v_session_id is not null;
end;
$$;

create or replace function public.confirm_copilot_provider_session_deletion(
  p_user_id uuid,
  p_dossier_id uuid,
  p_provider_session_id text,
  p_disposition text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dossier public.copilot_dossiers%rowtype;
  v_session_id uuid;
begin
  if p_disposition not in ('deleted', 'retention-confirmed') then
    raise exception 'COPILOT_DELETE_DISPOSITION_INVALID' using errcode = 'P0001';
  end if;
  select * into v_dossier
  from public.copilot_dossiers
  where id = p_dossier_id and user_id = p_user_id
  for update;
  if not found or v_dossier.state <> 'deleting' or v_dossier.active_job_id is not null then
    raise exception 'COPILOT_DELETE_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  update public.copilot_provider_sessions
  set deletion_disposition = p_disposition
  where user_id = p_user_id
    and dossier_id = p_dossier_id
    and provider_session_id = p_provider_session_id
    and deletion_disposition = 'uncertain'
  returning id into v_session_id;
  if v_session_id is null then
    raise exception 'COPILOT_DELETE_DISPOSITION_CONFLICT' using errcode = 'P0001';
  end if;
  return v_session_id;
end;
$$;

-- Writes replay receipts and deletes the frozen local graph in one commit.
-- The receipts deliberately have no dossier FK and therefore survive cascade.
create or replace function public.delete_copilot_dossier(
  p_user_id uuid,
  p_dossier_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dossier public.copilot_dossiers%rowtype;
  v_deleted_rows integer;
begin
  select * into v_dossier
  from public.copilot_dossiers
  where id = p_dossier_id and user_id = p_user_id
  for update;

  if not found
    or v_dossier.state <> 'deleting'
    or v_dossier.active_job_id is not null
  then
    return false;
  end if;

  if exists (
    select 1
    from public.copilot_provider_sessions s
    where s.user_id = p_user_id
      and s.dossier_id = p_dossier_id
      and s.deletion_disposition not in ('deleted', 'retention-confirmed')
  ) or exists (
    select 1
    from public.copilot_jobs j
    where j.user_id = p_user_id
      and j.dossier_id = p_dossier_id
      and j.provider_dispatched_at is not null
      and not j.provider_disposition_known
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.copilot_jobs j
    join public.copilot_deleted_job_receipts r
      on r.user_id = j.user_id and r.idempotency_key = j.idempotency_key
    where j.user_id = p_user_id
      and j.dossier_id = p_dossier_id
      and r.expires_at > now()
      and r.input_hash <> j.input_hash
  ) then
    raise exception 'COPILOT_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;

  insert into public.copilot_deleted_job_receipts (
    user_id,
    idempotency_key,
    input_hash,
    disposition,
    deleted_at,
    expires_at
  )
  select
    j.user_id,
    j.idempotency_key,
    j.input_hash,
    'deleted',
    now(),
    now() + interval '90 days'
  from public.copilot_jobs j
  where j.user_id = p_user_id and j.dossier_id = p_dossier_id
  on conflict (user_id, idempotency_key) do update
  set input_hash = excluded.input_hash,
      disposition = 'deleted',
      deleted_at = excluded.deleted_at,
      expires_at = excluded.expires_at;

  delete from public.copilot_dossiers
  where id = p_dossier_id and user_id = p_user_id and state = 'deleting';
  get diagnostics v_deleted_rows = row_count;
  if v_deleted_rows <> 1 then
    raise exception 'COPILOT_DELETE_NOT_COMMITTED' using errcode = 'P0001';
  end if;
  return true;
end;
$$;

revoke execute on function public.reserve_copilot_credit(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.refund_copilot_credit(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.record_copilot_provider_session(
  uuid, uuid, uuid, text, text, text
) from public, anon, authenticated;
revoke execute on function public.settle_copilot_job_without_credit(
  uuid, uuid, uuid, text, jsonb
) from public, anon, authenticated;
revoke execute on function public.claim_copilot_provider_session(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.complete_copilot_review(
  uuid, uuid, uuid, text, uuid, text, timestamptz
) from public, anon, authenticated;
revoke execute on function public.stage_copilot_review(uuid, uuid, uuid, jsonb, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.begin_copilot_job(
  uuid, uuid, uuid, text, text, text, text, text, text[], jsonb, jsonb, jsonb
) from public, anon, authenticated;
revoke execute on function public.expand_copilot_consent(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function public.assert_copilot_job_replay_allowed(uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.purge_expired_copilot_deleted_job_receipts(integer)
  from public, anon, authenticated;
revoke execute on function public.begin_copilot_deletion(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.begin_copilot_provider_session_deletion(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.confirm_copilot_provider_session_deletion(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.delete_copilot_dossier(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_copilot_credit(uuid, uuid, text) to service_role;
grant execute on function public.refund_copilot_credit(uuid, uuid, text, text) to service_role;
grant execute on function public.record_copilot_provider_session(
  uuid, uuid, uuid, text, text, text
) to service_role;
grant execute on function public.settle_copilot_job_without_credit(
  uuid, uuid, uuid, text, jsonb
) to service_role;
grant execute on function public.claim_copilot_provider_session(uuid, uuid, uuid) to service_role;
grant execute on function public.complete_copilot_review(
  uuid, uuid, uuid, text, uuid, text, timestamptz
) to service_role;
grant execute on function public.stage_copilot_review(uuid, uuid, uuid, jsonb, text, text, text)
  to service_role;
grant execute on function public.begin_copilot_job(
  uuid, uuid, uuid, text, text, text, text, text, text[], jsonb, jsonb, jsonb
) to service_role;
grant execute on function public.expand_copilot_consent(uuid, uuid, jsonb) to service_role;
grant execute on function public.assert_copilot_job_replay_allowed(uuid, text, text)
  to service_role;
grant execute on function public.purge_expired_copilot_deleted_job_receipts(integer)
  to service_role;
grant execute on function public.begin_copilot_deletion(uuid, uuid, timestamptz) to service_role;
grant execute on function public.begin_copilot_provider_session_deletion(uuid, uuid, text)
  to service_role;
grant execute on function public.confirm_copilot_provider_session_deletion(uuid, uuid, text, text)
  to service_role;
grant execute on function public.delete_copilot_dossier(uuid, uuid) to service_role;
