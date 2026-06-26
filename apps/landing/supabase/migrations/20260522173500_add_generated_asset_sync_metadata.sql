-- Add sync metadata to generated application assets.

alter table public.generated_application_assets
  add column if not exists revision bigint not null default 1 check (revision > 0),
  add column if not exists updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system')),
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists on_generated_application_assets_updated
  on public.generated_application_assets;
create trigger on_generated_application_assets_updated
  before update on public.generated_application_assets
  for each row
  execute function public.update_updated_at();
