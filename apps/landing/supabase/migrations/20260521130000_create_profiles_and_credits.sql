-- Base account and credit tables used by landing, dashboard, and generation flows.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  subscription_status text not null default 'free'
    check (subscription_status in ('free', 'premium')),
  subscription_period_end timestamptz,
  credit_balance integer not null default 0 check (credit_balance >= 0),
  ls_subscription_id text,
  ls_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  amount integer not null check (amount <> 0),
  reason text not null check (reason in ('purchase', 'premium_monthly_bonus', 'generation', 'adjustment')),
  source text not null,
  lemon_order_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.credit_transactions enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;

drop policy if exists "Users can read own credit transactions" on public.credit_transactions;
create policy "Users can read own credit transactions"
  on public.credit_transactions for select
  using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_profile_updated on public.profiles;

create trigger on_profile_updated
  before update on public.profiles
  for each row
  execute function public.update_updated_at();

create index if not exists idx_profiles_ls_subscription
  on public.profiles (ls_subscription_id)
  where ls_subscription_id is not null;

create index if not exists idx_profiles_ls_customer
  on public.profiles (ls_customer_id)
  where ls_customer_id is not null;

create unique index if not exists idx_credit_transactions_lemon_order
  on public.credit_transactions (lemon_order_id)
  where lemon_order_id is not null;

create unique index if not exists idx_credit_transactions_premium_period
  on public.credit_transactions (user_id, (metadata->>'period'))
  where reason = 'premium_monthly_bonus';

create index if not exists idx_credit_transactions_user_created
  on public.credit_transactions (user_id, created_at desc);

create or replace function public.grant_premium_monthly_credits(
  p_user_id uuid,
  p_period text,
  p_amount integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  if p_amount <= 0 then
    raise exception 'Credit amount must be positive';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_user_id
      and subscription_status = 'premium'
      and (subscription_period_end is null or subscription_period_end > now())
  ) then
    select credit_balance into new_balance from public.profiles where id = p_user_id;
    return coalesce(new_balance, 0);
  end if;

  insert into public.credit_transactions (user_id, amount, reason, source, metadata)
  values (
    p_user_id,
    p_amount,
    'premium_monthly_bonus',
    'premium_monthly_bonus',
    jsonb_build_object('period', p_period)
  );

  update public.profiles
  set credit_balance = credit_balance + p_amount
  where id = p_user_id
  returning credit_balance into new_balance;

  return new_balance;
exception
  when unique_violation then
    select credit_balance into new_balance from public.profiles where id = p_user_id;
    return coalesce(new_balance, 0);
end;
$$;

create or replace function public.consume_generation_credit(
  p_user_id uuid,
  p_source text,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  update public.profiles
  set credit_balance = credit_balance - 1
  where id = p_user_id
    and credit_balance > 0
  returning credit_balance into new_balance;

  if new_balance is null then
    raise exception 'Insufficient credits';
  end if;

  insert into public.credit_transactions (user_id, amount, reason, source, metadata)
  values (p_user_id, -1, 'generation', p_source, coalesce(p_metadata, '{}'::jsonb));

  return new_balance;
end;
$$;

create or replace function public.refund_generation_credit(
  p_user_id uuid,
  p_source text,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  insert into public.credit_transactions (user_id, amount, reason, source, metadata)
  values (p_user_id, 1, 'adjustment', p_source, coalesce(p_metadata, '{}'::jsonb));

  update public.profiles
  set credit_balance = credit_balance + 1
  where id = p_user_id
  returning credit_balance into new_balance;

  return coalesce(new_balance, 0);
end;
$$;

create or replace function public.add_credits_from_purchase(
  p_user_id uuid,
  p_amount integer,
  p_lemon_order_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  if p_amount <= 0 then
    raise exception 'Credit amount must be positive';
  end if;

  insert into public.credit_transactions (user_id, amount, reason, source, lemon_order_id, metadata)
  values (p_user_id, p_amount, 'purchase', 'lemon_squeezy', p_lemon_order_id, coalesce(p_metadata, '{}'::jsonb));

  update public.profiles
  set credit_balance = credit_balance + p_amount
  where id = p_user_id
  returning credit_balance into new_balance;

  if new_balance is null then
    insert into public.profiles (id, credit_balance)
    values (p_user_id, p_amount)
    returning credit_balance into new_balance;
  end if;

  return new_balance;
exception
  when unique_violation then
    select credit_balance into new_balance from public.profiles where id = p_user_id;
    return coalesce(new_balance, 0);
end;
$$;

revoke execute on function public.grant_premium_monthly_credits(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.consume_generation_credit(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.refund_generation_credit(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.add_credits_from_purchase(uuid, integer, text, jsonb) from public, anon, authenticated;

grant execute on function public.grant_premium_monthly_credits(uuid, text, integer) to service_role;
grant execute on function public.consume_generation_credit(uuid, text, jsonb) to service_role;
grant execute on function public.refund_generation_credit(uuid, text, jsonb) to service_role;
grant execute on function public.add_credits_from_purchase(uuid, integer, text, jsonb) to service_role;
