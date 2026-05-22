-- Add revision metadata to dashboard alert preferences synced to the extension.

alter table public.dashboard_alert_preferences
  add column if not exists revision bigint not null default 1 check (revision > 0);
