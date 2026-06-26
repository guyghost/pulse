alter table public.candidate_profile_field_suggestions
  drop constraint if exists candidate_profile_field_suggestions_field_check;

alter table public.candidate_profile_field_suggestions
  add constraint candidate_profile_field_suggestions_field_check
  check (field in ('title', 'summary', 'location', 'target_role'));
