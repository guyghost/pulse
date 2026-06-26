-- Add writer metadata to sync status rows shared by dashboard and extension.

alter table public.sync_status
  add column if not exists revision bigint not null default 1 check (revision > 0),
  add column if not exists updated_by text not null default 'extension'
    check (updated_by in ('dashboard', 'extension', 'system'));
