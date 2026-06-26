alter table public.sync_status
  add column if not exists retry_after_at timestamptz;
