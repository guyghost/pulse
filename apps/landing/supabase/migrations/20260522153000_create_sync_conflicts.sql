-- Track field-level connected sync conflicts for dashboard visibility.

create table if not exists public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  device_id uuid references public.extension_devices(id) on delete set null,
  entity text not null check (entity in ('applications', 'candidate_profile')),
  entity_id uuid not null,
  field text not null,
  local_value text,
  remote_value text,
  local_updated_by text not null check (local_updated_by in ('dashboard', 'extension', 'system')),
  remote_updated_by text not null check (remote_updated_by in ('dashboard', 'extension', 'system')),
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  detected_at timestamptz not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.sync_conflicts enable row level security;

drop policy if exists "Users can manage own sync conflicts" on public.sync_conflicts;
create policy "Users can manage own sync conflicts"
  on public.sync_conflicts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_sync_conflicts_user_pending
  on public.sync_conflicts (user_id, status, detected_at desc);
