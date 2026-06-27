-- =============================================================================
-- Oryx Design — Supabase migration 001: clients
-- Run in Supabase Dashboard → SQL Editor → New query → Paste → Run
-- =============================================================================
-- SQLite (lib/db) remains live for jobs/quotes/etc. until later migrations.
-- Enable with SUPABASE_CLIENTS=true in .env.local after running this + sync script.

-- ── clients ──────────────────────────────────────────────────────────────────
create table if not exists public.clients (
  id              text primary key,
  name            text not null,
  name_lower      text not null,
  contact_name    text,
  email           text,
  phone           text,
  billing_address text,
  notes           text,
  account_code    text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint clients_name_lower_unique unique (name_lower)
);

create index if not exists idx_clients_name_lower on public.clients (name_lower);
create index if not exists idx_clients_active on public.clients (active);

-- Auto-update updated_at on row changes
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clients_updated_at on public.clients;
create trigger clients_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- Row Level Security — server uses service_role (bypasses RLS) during migration.
-- Tighten policies when Supabase Auth replaces cookie auth.
alter table public.clients enable row level security;

create policy "Service role full access on clients"
  on public.clients
  for all
  to service_role
  using (true)
  with check (true);

-- ── Future tables (run in later migrations) ─────────────────────────────────
-- public.jobs              — mirrors SQLite Job
-- public.status_history    — mirrors StatusHistory
-- public.quotes            — mirrors Quote
-- public.client_holds      — mirrors ClientHold
-- public.profiles          — extends auth.users (name, role)
