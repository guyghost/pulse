-- Extension generated assets are synced idempotently with client_asset_id.
-- Existing rows predate this invariant, so backfill from the stable row id first.

update public.generated_application_assets
set client_asset_id = id::text
where client_asset_id is null;

alter table public.generated_application_assets
  alter column client_asset_id set not null;
