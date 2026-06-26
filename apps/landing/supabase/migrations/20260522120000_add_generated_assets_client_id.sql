-- Make extension-generated application assets idempotent across sync retries.

alter table public.generated_application_assets
  add column if not exists client_asset_id text;

create unique index if not exists idx_generated_application_assets_user_client_asset
  on public.generated_application_assets (user_id, client_asset_id);
