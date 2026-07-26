-- Private, content-free operational facts for the default-off Copilot pilot.
-- These timestamps observe modeled transitions and never authorize one.

alter table public.copilot_jobs
  add column if not exists review_ready_at timestamptz,
  add column if not exists first_uncertain_at timestamptz,
  add column if not exists terminal_at timestamptz;

-- Conservative backfill for a pilot upgraded with existing rows. It does not
-- invent historical uncertainty after a job has already left that state.
-- Existing application-supplied timestamps are normalized before the ordering
-- constraints are installed. From this migration onward the database owns all
-- timestamps that participate in those constraints.
update public.copilot_jobs
set provider_dispatched_at = greatest(provider_dispatched_at, created_at)
where provider_dispatched_at is not null
  and provider_dispatched_at < created_at;

update public.copilot_jobs
set reviewed_at = greatest(
  reviewed_at,
  coalesce(provider_dispatched_at, created_at),
  created_at
)
where reviewed_at is not null;

update public.copilot_jobs
set review_ready_at = case
  -- Accepted/rejected rows already have an explicit review. Using that
  -- normalized instant preserves reviewed_at >= review_ready_at.
  when state in ('accepted', 'rejected') and reviewed_at is not null
    then reviewed_at
  else greatest(
    coalesce(updated_at, created_at),
    coalesce(provider_dispatched_at, created_at),
    created_at
  )
end
where state in ('review', 'accepted', 'rejected')
  and review_ready_at is null;

update public.copilot_jobs
set review_ready_at = greatest(
  review_ready_at,
  coalesce(provider_dispatched_at, created_at),
  created_at
)
where review_ready_at is not null;

update public.copilot_jobs
set reviewed_at = greatest(reviewed_at, review_ready_at, created_at)
where reviewed_at is not null;

update public.copilot_jobs
set first_uncertain_at = coalesce(updated_at, created_at)
where state = 'uncertain'
  and first_uncertain_at is null;

update public.copilot_jobs
set terminal_at = greatest(
  coalesce(reviewed_at, updated_at, created_at),
  created_at
)
where state in ('accepted', 'rejected', 'failed', 'cancelled')
  and terminal_at is null;

create or replace function public.stamp_copilot_job_milestones()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- The first database value wins even if a caller attempts to overwrite it.
    -- An explicit clear remains meaningful: the provider adapter proved that
    -- the attempted command could not have produced a remote effect.
    if new.provider_dispatched_at is null then
      new.provider_dispatched_at := null;
    elsif old.provider_dispatched_at is not null then
      new.provider_dispatched_at := old.provider_dispatched_at;
    else
      new.provider_dispatched_at := greatest(now(), new.created_at);
    end if;

    if old.reviewed_at is not null then
      new.reviewed_at := old.reviewed_at;
    else
      -- An application timestamp is evidence of the modeled transition only;
      -- it is never trusted as the authoritative clock value.
      new.reviewed_at := null;
    end if;

    new.review_ready_at := old.review_ready_at;
    new.first_uncertain_at := old.first_uncertain_at;
    new.terminal_at := old.terminal_at;
  else
    if new.provider_dispatched_at is not null then
      new.provider_dispatched_at := greatest(now(), new.created_at);
    end if;

    new.reviewed_at := null;
    new.review_ready_at := null;
    new.first_uncertain_at := null;
    new.terminal_at := null;
  end if;

  if new.review_ready_at is null
    and new.state in ('review', 'accepted', 'rejected')
  then
    new.review_ready_at := greatest(
      now(),
      coalesce(new.provider_dispatched_at, new.created_at),
      new.created_at
    );
  end if;

  if new.reviewed_at is null
    and new.state in ('accepted', 'rejected')
  then
    new.reviewed_at := greatest(
      now(),
      coalesce(new.review_ready_at, new.created_at),
      new.created_at
    );
  end if;

  if new.first_uncertain_at is null and new.state = 'uncertain' then
    new.first_uncertain_at := greatest(now(), new.created_at);
  end if;

  if new.terminal_at is null
    and new.state in ('accepted', 'rejected', 'failed', 'cancelled')
  then
    new.terminal_at := greatest(
      now(),
      coalesce(new.reviewed_at, new.created_at),
      new.created_at
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_copilot_job_milestones on public.copilot_jobs;
create trigger on_copilot_job_milestones
  before insert or update on public.copilot_jobs
  for each row
  execute function public.stamp_copilot_job_milestones();

alter table public.copilot_jobs
  drop constraint if exists copilot_jobs_provider_dispatched_order,
  add constraint copilot_jobs_provider_dispatched_order check (
    provider_dispatched_at is null or provider_dispatched_at >= created_at
  ),
  drop constraint if exists copilot_jobs_review_ready_order,
  add constraint copilot_jobs_review_ready_order check (
    review_ready_at is null
    or provider_dispatched_at is null
    or review_ready_at >= provider_dispatched_at
  ),
  drop constraint if exists copilot_jobs_reviewed_order,
  add constraint copilot_jobs_reviewed_order check (
    reviewed_at is null
    or (review_ready_at is not null and reviewed_at >= review_ready_at)
  ),
  drop constraint if exists copilot_jobs_terminal_order,
  add constraint copilot_jobs_terminal_order check (
    terminal_at is null or terminal_at >= created_at
  ),
  drop constraint if exists copilot_jobs_review_milestone_required,
  add constraint copilot_jobs_review_milestone_required check (
    state not in ('review', 'accepted', 'rejected') or review_ready_at is not null
  ),
  drop constraint if exists copilot_jobs_terminal_milestone_required,
  add constraint copilot_jobs_terminal_milestone_required check (
    state not in ('accepted', 'rejected', 'failed', 'cancelled') or terminal_at is not null
  );

revoke execute on function public.stamp_copilot_job_milestones() from public, anon, authenticated;
grant execute on function public.stamp_copilot_job_milestones() to service_role;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create or replace view private.copilot_job_facts
with (security_invoker = true)
as
select
  job.id as job_id,
  job.user_id,
  job.dossier_id,
  job.operation_kind,
  job.created_at,
  job.provider_dispatched_at,
  job.review_ready_at,
  job.reviewed_at,
  job.terminal_at,
  job.first_uncertain_at,
  job.state as final_state,
  case
    when job.state <> 'failed' then null
    when job.failure->>'code' in (
      'AUTHENTICATION_REQUIRED',
      'ENTITLEMENT_DENIED',
      'OWNERSHIP_DENIED',
      'INSUFFICIENT_CREDITS',
      'RATE_LIMITED',
      'RESERVATION_FAILED',
      'PROVIDER_FAILED',
      'RESULT_INVALID',
      'CANCELLATION_FAILED',
      'REFUND_FAILED',
      'RECONCILIATION_FAILED'
    ) then job.failure->>'code'
    else 'UNKNOWN'
  end as failure_code,
  job.uncertain_phase,
  coalesce(ledger.net_credits, 0)::integer as net_credits,
  coalesce(ledger.reservation_count, 0)::integer as reservation_count,
  coalesce(ledger.refund_count, 0)::integer as refund_count
from public.copilot_jobs job
left join lateral (
  select
    sum(case
      when entry.reason = 'generation' and entry.source = 'copilot_reservation'
        then -entry.amount
      when entry.reason = 'adjustment' and entry.source = 'copilot_refund'
        then -entry.amount
      else 0
    end)::integer as net_credits,
    count(*) filter (
      where entry.reason = 'generation' and entry.source = 'copilot_reservation'
    )::integer as reservation_count,
    count(*) filter (
      where entry.reason = 'adjustment' and entry.source = 'copilot_refund'
    )::integer as refund_count
  from public.credit_transactions entry
  where entry.copilot_job_id = job.id
) ledger on true;

create or replace view private.copilot_dossier_facts
with (security_invoker = true)
as
select
  dossier.id as dossier_id,
  dossier.user_id,
  dossier.created_at,
  min(job.review_ready_at) filter (
    where job.operation_kind <> 'analysis'
  ) as first_draft_review_ready_at,
  min(job.reviewed_at) filter (
    where job.operation_kind <> 'analysis' and job.final_state = 'accepted'
  ) as first_accepted_content_at,
  coalesce(bool_or(
    job.operation_kind <> 'analysis' and job.final_state = 'accepted'
  ), false) as has_approved_content,
  coalesce(sum(job.net_credits), 0)::integer as net_credits,
  coalesce(sum(job.reservation_count), 0)::integer as reservations,
  coalesce(sum(job.refund_count), 0)::integer as refunds,
  count(*) filter (where job.final_state = 'failed') as failed_jobs,
  count(*) filter (where job.first_uncertain_at is not null) as uncertain_jobs
from public.copilot_dossiers dossier
left join private.copilot_job_facts job
  on job.dossier_id = dossier.id
group by dossier.id;

revoke all on private.copilot_job_facts from public, anon, authenticated;
revoke all on private.copilot_dossier_facts from public, anon, authenticated;
grant select on private.copilot_job_facts to service_role;
grant select on private.copilot_dossier_facts to service_role;
