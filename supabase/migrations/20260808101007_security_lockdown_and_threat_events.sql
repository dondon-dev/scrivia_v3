-- Security lockdown + threat event log.
-- Part of the anti-attack hardening: an emergency database lockdown flag
-- (unlocked with the hardcoded master key in src/lib/lockdown.ts) plus an
-- audit trail of every detected threat (e.g. blocked suspicious uploads).
-- Run this in the Supabase SQL Editor exactly once.

create table if not exists public.security_settings (
  id integer primary key default 1 check (id = 1),
  lockdown_enabled boolean not null default false,
  lockdown_reason text,
  lockdown_at timestamptz,
  locked_by uuid,
  updated_at timestamptz not null default now(),
  constraint security_settings_singleton check (id = 1)
);

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text not null default 'low',
  detail text not null default '',
  source text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists security_events_created_at_idx on public.security_events (created_at desc);

alter table public.security_settings enable row level security;
alter table public.security_events enable row level security;

-- Seed the singleton settings row.
insert into public.security_settings (id, lockdown_enabled)
values (1, false)
on conflict (id) do nothing;

-- Authenticated-only access: anonymous users must not see lockdown state or
-- the threat log (matching the payroll-table hardening migration pattern).
drop policy if exists "security_settings_select" on public.security_settings;
create policy "security_settings_select" on public.security_settings
  for select to authenticated using (true);

drop policy if exists "security_settings_update" on public.security_settings;
create policy "security_settings_update" on public.security_settings
  for update to authenticated using (true) with check (true);

drop policy if exists "security_events_select" on public.security_events;
create policy "security_events_select" on public.security_events
  for select to authenticated using (true);

drop policy if exists "security_events_insert" on public.security_events;
create policy "security_events_insert" on public.security_events
  for insert to authenticated with check (true);

grant usage on schema public to authenticated;
grant select, update on table public.security_settings to authenticated;
grant select, insert on table public.security_events to authenticated;

-- Reload the PostgREST schema cache so the new tables are immediately usable.
notify pgrst, 'reload schema';
