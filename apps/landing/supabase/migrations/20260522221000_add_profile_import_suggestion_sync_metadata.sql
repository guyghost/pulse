-- Add sync metadata to profile imports and CV field suggestions.

alter table public.profile_imports
  add column if not exists revision bigint not null default 1 check (revision > 0),
  add column if not exists updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  add column if not exists updated_at timestamptz not null default now();

alter table public.candidate_profile_field_suggestions
  add column if not exists revision bigint not null default 1 check (revision > 0),
  add column if not exists updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists on_profile_imports_updated on public.profile_imports;
create trigger on_profile_imports_updated
  before update on public.profile_imports
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_candidate_profile_field_suggestions_updated
  on public.candidate_profile_field_suggestions;
create trigger on_candidate_profile_field_suggestions_updated
  before update on public.candidate_profile_field_suggestions
  for each row
  execute function public.update_updated_at();
