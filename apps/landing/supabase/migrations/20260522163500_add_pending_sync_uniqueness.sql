-- Prevent duplicate pending field conflicts when dashboard and extension retries race.

delete from public.sync_conflicts duplicate
using (
  select
    id,
    row_number() over (
      partition by
        user_id,
        coalesce(device_id, '00000000-0000-0000-0000-000000000000'::uuid),
        entity,
        entity_id,
        field
      order by detected_at desc, created_at desc, id desc
    ) as duplicate_rank
  from public.sync_conflicts
  where status = 'pending'
) ranked
where duplicate.id = ranked.id
  and ranked.duplicate_rank > 1;

create unique index if not exists idx_sync_conflicts_pending_unique
  on public.sync_conflicts (
    user_id,
    coalesce(device_id, '00000000-0000-0000-0000-000000000000'::uuid),
    entity,
    entity_id,
    field
  )
  where status = 'pending';

delete from public.candidate_profile_field_suggestions duplicate
using (
  select
    id,
    row_number() over (
      partition by user_id, profile_id, field, source
      order by created_at desc, id desc
    ) as duplicate_rank
  from public.candidate_profile_field_suggestions
  where status = 'pending'
) ranked
where duplicate.id = ranked.id
  and ranked.duplicate_rank > 1;

create unique index if not exists idx_candidate_profile_field_suggestions_pending_unique
  on public.candidate_profile_field_suggestions (user_id, profile_id, field, source)
  where status = 'pending';
