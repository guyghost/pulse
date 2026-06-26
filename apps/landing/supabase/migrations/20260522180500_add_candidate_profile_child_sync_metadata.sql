-- Add sync metadata to canonical CV child rows imported by profile extractors.

alter table public.candidate_experiences
  add column if not exists revision bigint not null default 1 check (revision > 0),
  add column if not exists updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.candidate_education
  add column if not exists revision bigint not null default 1 check (revision > 0),
  add column if not exists updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.candidate_skills
  add column if not exists revision bigint not null default 1 check (revision > 0),
  add column if not exists updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.candidate_links
  add column if not exists revision bigint not null default 1 check (revision > 0),
  add column if not exists updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists on_candidate_experiences_updated on public.candidate_experiences;
create trigger on_candidate_experiences_updated
  before update on public.candidate_experiences
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_candidate_education_updated on public.candidate_education;
create trigger on_candidate_education_updated
  before update on public.candidate_education
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_candidate_skills_updated on public.candidate_skills;
create trigger on_candidate_skills_updated
  before update on public.candidate_skills
  for each row
  execute function public.update_updated_at();

drop trigger if exists on_candidate_links_updated on public.candidate_links;
create trigger on_candidate_links_updated
  before update on public.candidate_links
  for each row
  execute function public.update_updated_at();
