create table if not exists public.dashboard_alert_preferences (
  user_id uuid references auth.users(id) on delete cascade primary key,
  enabled boolean not null default true,
  score_threshold integer not null default 70 check (score_threshold between 0 and 100),
  min_daily_rate integer not null default 0 check (min_daily_rate between 0 and 5000),
  required_stacks text[] not null default '{}',
  max_results integer not null default 5 check (max_results between 1 and 20),
  updated_by text not null default 'dashboard'
    check (updated_by in ('dashboard', 'extension', 'system')),
  updated_at timestamptz not null default now()
);

alter table public.dashboard_alert_preferences enable row level security;

drop policy if exists "Users can manage own dashboard alert preferences"
  on public.dashboard_alert_preferences;
create policy "Users can manage own dashboard alert preferences"
  on public.dashboard_alert_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists on_dashboard_alert_preferences_updated
  on public.dashboard_alert_preferences;
create trigger on_dashboard_alert_preferences_updated
  before update on public.dashboard_alert_preferences
  for each row
  execute function public.update_updated_at();
