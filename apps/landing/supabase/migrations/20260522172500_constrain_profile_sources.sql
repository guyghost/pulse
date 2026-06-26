-- Restrict canonical CV data to sources that can produce profile data.

insert into public.mission_sources (id, label, kind)
values
  ('linkedin', 'LinkedIn', 'profile'),
  ('malt', 'Malt', 'both'),
  ('other', 'Autre', 'both')
on conflict (id) do update
set
  label = excluded.label,
  kind = excluded.kind;

update public.candidate_experiences
set source = 'other'
where source not in ('linkedin', 'malt', 'other');

update public.candidate_education
set source = 'other'
where source not in ('linkedin', 'malt', 'other');

update public.candidate_skills
set source = 'other'
where source not in ('linkedin', 'malt', 'other');

update public.candidate_links
set source = 'other'
where source not in ('linkedin', 'malt', 'other');

update public.profile_imports
set source = 'other'
where source not in ('linkedin', 'malt', 'other');

update public.candidate_profile_field_suggestions
set source = 'other'
where source not in ('linkedin', 'malt', 'other');

alter table public.candidate_experiences
  drop constraint if exists candidate_experiences_profile_source_check,
  add constraint candidate_experiences_profile_source_check
    check (source in ('linkedin', 'malt', 'other'));

alter table public.candidate_education
  drop constraint if exists candidate_education_profile_source_check,
  add constraint candidate_education_profile_source_check
    check (source in ('linkedin', 'malt', 'other'));

alter table public.candidate_skills
  drop constraint if exists candidate_skills_profile_source_check,
  add constraint candidate_skills_profile_source_check
    check (source in ('linkedin', 'malt', 'other'));

alter table public.candidate_links
  drop constraint if exists candidate_links_profile_source_check,
  add constraint candidate_links_profile_source_check
    check (source in ('linkedin', 'malt', 'other'));

alter table public.profile_imports
  drop constraint if exists profile_imports_profile_source_check,
  add constraint profile_imports_profile_source_check
    check (source in ('linkedin', 'malt', 'other'));

alter table public.candidate_profile_field_suggestions
  drop constraint if exists candidate_profile_field_suggestions_profile_source_check,
  add constraint candidate_profile_field_suggestions_profile_source_check
    check (source in ('linkedin', 'malt', 'other'));
