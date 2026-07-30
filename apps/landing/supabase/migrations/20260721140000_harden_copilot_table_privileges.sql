-- Copilot persistence is an internal service boundary, never a browser-facing API.
-- The MissionPulse API uses the service role after authenticating and scoping every
-- request. RLS remains enabled as defense in depth if a future migration changes
-- grants, but neither browser role may address these tables directly.

alter table public.copilot_dossiers
  add constraint copilot_dossiers_approved_artifacts_bounded
  check (jsonb_array_length(approved_artifacts) <= 512)
  not valid;

alter table public.copilot_dossiers
  validate constraint copilot_dossiers_approved_artifacts_bounded;

-- Reinstall admission with the persisted artifact bound checked while the
-- dossier row is locked. Canonical duplicate replay still returns before this
-- guard; only a genuinely new artifact job is refused at capacity.
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

  if p_operation_kind <> 'analysis'
    and jsonb_array_length(v_dossier.approved_artifacts) >= 512
  then
    raise exception 'COPILOT_DOSSIER_ARTIFACT_LIMIT' using errcode = 'P0001';
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

revoke all privileges on table
  public.copilot_dossiers,
  public.copilot_jobs,
  public.copilot_provider_sessions,
  public.copilot_daily_admissions,
  public.copilot_deleted_job_receipts
from public, anon, authenticated;

grant all privileges on table
  public.copilot_dossiers,
  public.copilot_jobs,
  public.copilot_provider_sessions,
  public.copilot_daily_admissions,
  public.copilot_deleted_job_receipts
to service_role;
