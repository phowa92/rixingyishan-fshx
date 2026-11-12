-- Apply only in the new, separate Supabase project.
create extension if not exists pgcrypto;
create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  group_key text not null check (group_key in ('departed','patients','blessings')),
  minor_key text not null default '' check ((group_key = 'departed' and minor_key in ('deceased','infants','animals')) or (group_key <> 'departed' and minor_key = '')),
  name text not null check (char_length(name) between 1 and 60),
  name_key text not null,
  submitted_at timestamptz not null default now()
);
-- Keep every submission as a separate row, including repeated names.
alter table public.records drop constraint if exists records_group_key_minor_key_name_key_key;
create index if not exists records_submitted_at_idx on public.records (submitted_at);
create index if not exists records_visible_dedupe_idx on public.records (group_key, minor_key, name_key, submitted_at desc);
alter table public.records enable row level security;

create table if not exists public.cleanup_logs (
  id bigint generated always as identity primary key,
  run_at timestamptz not null default now(),
  deleted_count integer not null,
  cutoff_at timestamptz not null
);
alter table public.cleanup_logs enable row level security;
create table if not exists public.admin_accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null check (role in ('owner','admin')),
  created_at timestamptz not null default now()
);
alter table public.admin_accounts enable row level security;
-- No public policies: Netlify Functions access tables using the service role key.

create or replace function public.cleanup_expired_records()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff timestamptz;
  deleted_count integer;
begin
  cutoff := (date_trunc('day', now() at time zone 'Asia/Shanghai') - interval '7 days') at time zone 'Asia/Shanghai';
  delete from public.records where submitted_at < cutoff;
  get diagnostics deleted_count = row_count;
  insert into public.cleanup_logs (run_at, deleted_count, cutoff_at) values (now(), deleted_count, cutoff);
  delete from public.cleanup_logs where run_at < now() - interval '90 days';
  return deleted_count;
end;
$$;
revoke all on function public.cleanup_expired_records() from public, anon, authenticated;
grant execute on function public.cleanup_expired_records() to service_role;
