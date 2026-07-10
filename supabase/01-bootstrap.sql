-- =============================================================================
-- ORYX Supabase — Step 1: Full bootstrap (auto-generated)
-- =============================================================================
-- DO NOT EDIT BY HAND — regenerate with:
--   node scripts/build-supabase-bootstrap.mjs
--
-- Prerequisites: run supabase/00-drop-all.sql first (clean slate), OR run on a
-- fresh project (idempotent: IF NOT EXISTS throughout).
--
-- After this:
--   1. Set Vercel env vars (SUPABASE_*, VAULT_ENCRYPTION_KEY, AUTH_SECRET)
--   2. Log in with admin@test.com / admin123 (seeded at end of this file)
--   3. npm run supabase:sync-all  (from a machine with SQLite data)
--   4. System Health → Supabase — confirm all modules green
-- =============================================================================

-- Shared trigger for updated_at columns
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── 001_clients.sql ───
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

drop policy if exists "Service role full access on clients" on public.clients;
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

-- ─── 002_jobs.sql ───
-- =============================================================================
-- Oryx Design — Supabase migration 002: jobs
-- Run in Supabase Dashboard → SQL Editor after 001_clients.sql
-- =============================================================================
-- Enable with SUPABASE_JOBS=true in .env.local after running this + sync script.
-- StatusHistory / BillingHandoff remain SQLite-only for now.

create table if not exists public.jobs (
  id                      text primary key,
  drawing_number          text not null,
  item_type               text not null default 'DESIGN',
  address                 text not null,
  type_of_works           text not null,
  custom_type_description text,
  legacy_type_of_works    text,
  client_company          text not null,
  client_id               text references public.clients (id) on delete set null,
  requested_by            text not null,
  status                  text not null default 'NEW_REQUEST',
  designer                text not null default '',
  date_created            timestamptz not null default now(),
  date_completed          date,
  notes                   text,
  parent_job_id           text references public.jobs (id) on delete set null,
  revision_letter         text,
  quote_value             numeric,
  quote_reference         text,
  quote_date              date,
  commercial_notes        text,
  invoice_id              text,
  billing_status          text,
  billing_batch_id        text,
  requested_date          date,
  required_by_date        date,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint jobs_drawing_number_unique unique (drawing_number)
);

create index if not exists idx_jobs_status on public.jobs (status);
create index if not exists idx_jobs_client_company on public.jobs (client_company);
create index if not exists idx_jobs_client_id on public.jobs (client_id);
create index if not exists idx_jobs_designer on public.jobs (designer);
create index if not exists idx_jobs_created_at on public.jobs (created_at);
create index if not exists idx_jobs_date_created on public.jobs (date_created);
create index if not exists idx_jobs_parent_job_id on public.jobs (parent_job_id);
create index if not exists idx_jobs_required_by_date on public.jobs (required_by_date);

drop trigger if exists jobs_updated_at on public.jobs;
create trigger jobs_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

alter table public.jobs enable row level security;

drop policy if exists "Service role full access on jobs" on public.jobs;
create policy "Service role full access on jobs"
  on public.jobs
  for all
  to service_role
  using (true)
  with check (true);

-- Refresh PostgREST schema cache so API writes work immediately
notify pgrst, 'reload schema';

-- ─── 005_job_commercial_extras.sql ───
-- Variation fees and additional charges on jobs (commercial extras).

alter table public.jobs
  add column if not exists variation_fees numeric,
  add column if not exists additional_charges numeric;

notify pgrst, 'reload schema';

-- ─── 003_quotes.sql ───
-- =============================================================================
-- Oryx Design — Supabase migration 003: quotes + quote_line_items
-- Run in Supabase Dashboard → SQL Editor after 001_clients.sql and 002_jobs.sql
-- =============================================================================
-- Enable with SUPABASE_QUOTES=true in .env.local after running this + sync script.

create table if not exists public.quotes (
  id              text primary key,
  quote_number    text not null,
  client_id       text references public.clients (id) on delete set null,
  client_company  text not null,
  contact_name    text,
  address         text not null,
  description     text not null,
  quote_value     numeric not null default 0,
  quote_date      date not null,
  expiry_date     date,
  status          text not null default 'DRAFT',
  notes           text,
  job_id          text references public.jobs (id) on delete set null,
  created_by      text not null default 'System',
  pdf_path        text,
  prepared_by     text,
  vat_rate        numeric,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint quotes_quote_number_unique unique (quote_number)
);

create index if not exists idx_quotes_client_id on public.quotes (client_id);
create index if not exists idx_quotes_status on public.quotes (status);
create index if not exists idx_quotes_quote_date on public.quotes (quote_date);
create index if not exists idx_quotes_job_id on public.quotes (job_id);

drop trigger if exists quotes_updated_at on public.quotes;
create trigger quotes_updated_at
  before update on public.quotes
  for each row execute function public.set_updated_at();

alter table public.quotes enable row level security;

drop policy if exists "Service role full access on quotes" on public.quotes;
create policy "Service role full access on quotes"
  on public.quotes
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.quote_line_items (
  id             text primary key,
  quote_id       text not null references public.quotes (id) on delete cascade,
  description    text not null,
  amount         numeric not null default 0,
  vat_applicable boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists idx_quote_line_items_quote_id on public.quote_line_items (quote_id);

alter table public.quote_line_items enable row level security;

drop policy if exists "Service role full access on quote_line_items" on public.quote_line_items;
create policy "Service role full access on quote_line_items"
  on public.quote_line_items
  for all
  to service_role
  using (true)
  with check (true);

notify pgrst, 'reload schema';

-- ─── 004_quote_type_of_works.sql ───
-- Add controlled Type of Works fields to quotes (mirrors Job.typeOfWorks).

alter table public.quotes
  add column if not exists type_of_works text,
  add column if not exists custom_type_description text;

notify pgrst, 'reload schema';

-- ─── 004_status_history.sql ───
-- =============================================================================
-- Oryx Design — Supabase migration 004: status_history
-- Run after 002_jobs.sql
-- Enable with SUPABASE_STATUS_HISTORY=true after sync script
-- =============================================================================

create table if not exists public.status_history (
  id           text primary key,
  job_id       text not null references public.jobs (id) on delete cascade,
  from_status  text,
  to_status    text not null,
  changed_by   text not null default 'System',
  changed_at   timestamptz not null default now(),
  note         text
);

create index if not exists idx_status_history_job_id on public.status_history (job_id);
create index if not exists idx_status_history_changed_at on public.status_history (changed_at);

alter table public.status_history enable row level security;

drop policy if exists "Service role full access on status_history" on public.status_history;
create policy "Service role full access on status_history"
  on public.status_history
  for all
  to service_role
  using (true)
  with check (true);

notify pgrst, 'reload schema';

-- ─── 005_client_holds.sql ───
-- =============================================================================
-- Oryx Design — Supabase migration 005: client_holds
-- Run after 001_clients.sql
-- Enable with SUPABASE_HOLDS=true after sync script
-- =============================================================================

create table if not exists public.client_holds (
  id             text primary key,
  client_id      text not null references public.clients (id) on delete cascade,
  status         text not null default 'ACTIVE',
  reason         text not null,
  notes          text,
  added_by       text not null default 'System',
  added_at       timestamptz not null default now(),
  removed_by     text,
  removed_at     timestamptz,
  removed_reason text,
  updated_at     timestamptz not null default now()
);

create index if not exists idx_client_holds_client_id on public.client_holds (client_id);
create index if not exists idx_client_holds_status on public.client_holds (status);

drop trigger if exists client_holds_updated_at on public.client_holds;
create trigger client_holds_updated_at
  before update on public.client_holds
  for each row execute function public.set_updated_at();

alter table public.client_holds enable row level security;

drop policy if exists "Service role full access on client_holds" on public.client_holds;
create policy "Service role full access on client_holds"
  on public.client_holds
  for all
  to service_role
  using (true)
  with check (true);

notify pgrst, 'reload schema';

-- ─── 013_client_holds_updated_at.sql ───
-- =============================================================================
-- Oryx Design — Supabase migration 013: client_holds updated_at
-- Fixes: record "new" has no field "updated_at" on hold remove/update
--
-- 005_client_holds omitted updated_at; setup-vercel.sql added the trigger anyway.
-- =============================================================================

alter table public.client_holds
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists client_holds_updated_at on public.client_holds;
create trigger client_holds_updated_at
  before update on public.client_holds
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';

-- ─── 006_billing.sql ───
-- =============================================================================
-- Oryx Design — Supabase migration 006: billing (handoffs + export batches)
-- Run after 002_jobs.sql
-- Enable with SUPABASE_BILLING=true after sync script
-- =============================================================================

create table if not exists public.billing_export_batches (
  id           text primary key,
  batch_number text not null,
  export_date  date not null,
  exported_by  text not null default 'System',
  record_count integer not null default 0,
  notes        text,
  created_at   timestamptz not null default now(),
  constraint billing_export_batches_batch_number_unique unique (batch_number)
);

create index if not exists idx_billing_export_batches_date on public.billing_export_batches (export_date);

alter table public.billing_export_batches enable row level security;

drop policy if exists "Service role full access on billing_export_batches" on public.billing_export_batches;
create policy "Service role full access on billing_export_batches"
  on public.billing_export_batches for all to service_role
  using (true) with check (true);

create table if not exists public.billing_handoffs (
  id                      text primary key,
  source_job_id           text not null references public.jobs (id),
  billing_event_type      text not null default 'JOB_COMPLETED',
  drawing_number          text not null,
  item_type               text not null,
  type_of_works           text,
  custom_type_description text,
  client_company          text not null,
  address                 text not null,
  designer                text,
  quote_value             numeric,
  quote_reference         text,
  completion_date         date not null,
  added_to_billing_queue_at timestamptz not null default now(),
  cleared_by_accounts_at  timestamptz,
  cleared_by              text,
  export_batch_id         text references public.billing_export_batches (id),
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_billing_handoffs_source_job on public.billing_handoffs (source_job_id);
create index if not exists idx_billing_handoffs_cleared on public.billing_handoffs (cleared_by_accounts_at);
create index if not exists idx_billing_handoffs_batch on public.billing_handoffs (export_batch_id);

create unique index if not exists idx_billing_handoffs_active_unique
  on public.billing_handoffs (source_job_id)
  where cleared_by_accounts_at is null;

drop trigger if exists billing_handoffs_updated_at on public.billing_handoffs;
create trigger billing_handoffs_updated_at
  before update on public.billing_handoffs
  for each row execute function public.set_updated_at();

alter table public.billing_handoffs enable row level security;

drop policy if exists "Service role full access on billing_handoffs" on public.billing_handoffs;
create policy "Service role full access on billing_handoffs"
  on public.billing_handoffs for all to service_role
  using (true) with check (true);

create table if not exists public.billing_export_snapshots (
  id            text primary key,
  batch_id      text not null references public.billing_export_batches (id),
  handoff_id    text not null references public.billing_handoffs (id),
  snapshot_json text not null,
  created_at    timestamptz not null default now(),
  constraint billing_export_snapshots_handoff_unique unique (handoff_id)
);

create index if not exists idx_billing_export_snapshots_batch on public.billing_export_snapshots (batch_id);

alter table public.billing_export_snapshots enable row level security;

drop policy if exists "Service role full access on billing_export_snapshots" on public.billing_export_snapshots;
create policy "Service role full access on billing_export_snapshots"
  on public.billing_export_snapshots for all to service_role
  using (true) with check (true);

notify pgrst, 'reload schema';

-- ─── 007_calendar.sql ───
-- =============================================================================
-- Oryx Design — Supabase migration 007: calendar
-- Enable with SUPABASE_CALENDAR=true after sync script
-- =============================================================================

create table if not exists public.event_categories (
  id    text primary key,
  name  text not null,
  color text not null,
  icon  text,
  constraint event_categories_name_unique unique (name)
);

insert into public.event_categories (id, name, color, icon) values
  ('cat_site_visit',       'Site Visit',       '#3B82F6', 'map-pin'),
  ('cat_teams_meeting',    'Teams Meeting',    '#A855F7', 'video'),
  ('cat_survey',           'Survey',           '#F97316', 'clipboard'),
  ('cat_installation',     'Installation',     '#22C55E', 'wrench'),
  ('cat_client_meeting',   'Client Meeting',   '#A855F7', 'users'),
  ('cat_deadline',         'Deadline',         '#EF4444', 'alert-circle'),
  ('cat_leave',            'Leave',            '#6B7280', 'calendar-off'),
  ('cat_internal_meeting', 'Internal Meeting', '#14B8A6', 'message-square')
on conflict (id) do nothing;

create table if not exists public.calendar_events (
  id          text primary key,
  title       text not null,
  description text,
  category_id text not null references public.event_categories (id),
  start_date  timestamptz not null,
  end_date    timestamptz not null,
  all_day     boolean not null default true,
  location    text,
  priority    text not null default 'MEDIUM',
  status      text not null default 'SCHEDULED',
  job_id      text references public.jobs (id) on delete set null,
  client_id   text references public.clients (id) on delete set null,
  created_by  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_calendar_events_start on public.calendar_events (start_date);
create index if not exists idx_calendar_events_end on public.calendar_events (end_date);
create index if not exists idx_calendar_events_category on public.calendar_events (category_id);
create index if not exists idx_calendar_events_job on public.calendar_events (job_id);
create index if not exists idx_calendar_events_client on public.calendar_events (client_id);

drop trigger if exists calendar_events_updated_at on public.calendar_events;
create trigger calendar_events_updated_at
  before update on public.calendar_events
  for each row execute function public.set_updated_at();

alter table public.calendar_events enable row level security;

drop policy if exists "Service role full access on calendar_events" on public.calendar_events;
create policy "Service role full access on calendar_events"
  on public.calendar_events for all to service_role
  using (true) with check (true);

alter table public.event_categories enable row level security;

drop policy if exists "Service role full access on event_categories" on public.event_categories;
create policy "Service role full access on event_categories"
  on public.event_categories for all to service_role
  using (true) with check (true);

create table if not exists public.calendar_assignments (
  id       text primary key,
  event_id text not null references public.calendar_events (id) on delete cascade,
  user_id  text not null,
  constraint calendar_assignments_event_user_unique unique (event_id, user_id)
);

create index if not exists idx_calendar_assignments_event on public.calendar_assignments (event_id);
create index if not exists idx_calendar_assignments_user on public.calendar_assignments (user_id);

alter table public.calendar_assignments enable row level security;

drop policy if exists "Service role full access on calendar_assignments" on public.calendar_assignments;
create policy "Service role full access on calendar_assignments"
  on public.calendar_assignments for all to service_role
  using (true) with check (true);

notify pgrst, 'reload schema';

-- ─── 008_users.sql ───
-- =============================================================================
-- Oryx Design — Supabase migration 008: app users (custom bcrypt auth)
-- NOT Supabase Auth — password_hash mirrors SQLite for login verification.
-- Enable with SUPABASE_USERS=true after sync script
-- =============================================================================

create table if not exists public.app_users (
  id                   text primary key,
  name                 text not null,
  email                text,
  email_lower          text,
  role                 text not null default 'ENGINEER',
  active               boolean not null default true,
  password_hash        text,
  must_change_password boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint app_users_email_lower_unique unique (email_lower)
);

create index if not exists idx_app_users_role on public.app_users (role);
create index if not exists idx_app_users_active on public.app_users (active);

drop trigger if exists app_users_updated_at on public.app_users;
create trigger app_users_updated_at
  before update on public.app_users
  for each row execute function public.set_updated_at();

alter table public.app_users enable row level security;

drop policy if exists "Service role full access on app_users" on public.app_users;
create policy "Service role full access on app_users"
  on public.app_users for all to service_role
  using (true) with check (true);

notify pgrst, 'reload schema';

-- ─── 009_identity_switch_logs.sql ───
-- =============================================================================
-- Oryx Design — Supabase migration 009: identity switch audit log
-- Enable with SUPABASE_IDENTITY_LOG=true after sync script
-- =============================================================================

create table if not exists public.identity_switch_logs (
  id               text primary key,
  action           text not null,
  real_user_id     text,
  real_user_name   text,
  target_user_id   text,
  target_user_name text,
  detail           text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_identity_switch_logs_real on public.identity_switch_logs (real_user_id);
create index if not exists idx_identity_switch_logs_target on public.identity_switch_logs (target_user_id);
create index if not exists idx_identity_switch_logs_action on public.identity_switch_logs (action);
create index if not exists idx_identity_switch_logs_created on public.identity_switch_logs (created_at desc);

alter table public.identity_switch_logs enable row level security;

drop policy if exists "Service role full access on identity_switch_logs" on public.identity_switch_logs;
create policy "Service role full access on identity_switch_logs"
  on public.identity_switch_logs for all to service_role
  using (true) with check (true);

notify pgrst, 'reload schema';

-- ─── 010_backups.sql ───
-- =============================================================================
-- Oryx Design — Supabase migration 010: backup jobs + audit log
-- Enable with SUPABASE_BACKUPS=true after sync script
-- =============================================================================

create table if not exists public.backup_jobs (
  id                text primary key,
  status            text not null default 'PENDING',
  trigger           text not null default 'MANUAL',
  triggered_by      text not null,
  triggered_by_name text not null,
  folder_name       text not null,
  started_at        timestamptz not null,
  completed_at      timestamptz,
  duration_ms       integer,
  size_bytes        bigint,
  checksum          text,
  row_counts_json   text,
  error_message     text,
  retry_of_id       text references public.backup_jobs (id),
  file_deleted_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint backup_jobs_folder_name_unique unique (folder_name)
);

create index if not exists idx_backup_jobs_status on public.backup_jobs (status);
create index if not exists idx_backup_jobs_created on public.backup_jobs (created_at desc);

drop trigger if exists backup_jobs_updated_at on public.backup_jobs;
create trigger backup_jobs_updated_at
  before update on public.backup_jobs
  for each row execute function public.set_updated_at();

alter table public.backup_jobs enable row level security;

drop policy if exists "Service role full access on backup_jobs" on public.backup_jobs;
create policy "Service role full access on backup_jobs"
  on public.backup_jobs for all to service_role
  using (true) with check (true);

create table if not exists public.backup_audit_logs (
  id         text primary key,
  action     text not null,
  backup_id  text,
  user_id    text not null,
  user_name  text not null,
  detail     text,
  created_at timestamptz not null default now()
);

create index if not exists idx_backup_audit_logs_backup on public.backup_audit_logs (backup_id);
create index if not exists idx_backup_audit_logs_action on public.backup_audit_logs (action);
create index if not exists idx_backup_audit_logs_created on public.backup_audit_logs (created_at desc);

alter table public.backup_audit_logs enable row level security;

drop policy if exists "Service role full access on backup_audit_logs" on public.backup_audit_logs;
create policy "Service role full access on backup_audit_logs"
  on public.backup_audit_logs for all to service_role
  using (true) with check (true);

notify pgrst, 'reload schema';

-- ─── 011_soft_delete.sql ───
-- 011_soft_delete.sql
-- Adds soft-delete (archive) support to jobs, quotes, and clients,
-- plus a unified archive audit log table.
--
-- Idempotent: uses IF NOT EXISTS / DO NOTHING patterns throughout.
-- Safe to run on a database that already has data — all new columns
-- default to NULL (active), so every existing row stays visible.

-- ── Jobs ──────────────────────────────────────────────────────────
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS archived_by  TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_archived_at ON jobs(archived_at);

-- ── Quotes ────────────────────────────────────────────────────────
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS archived_by  TEXT;

CREATE INDEX IF NOT EXISTS idx_quotes_archived_at ON quotes(archived_at);

-- ── Clients ───────────────────────────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS archived_by  TEXT;

CREATE INDEX IF NOT EXISTS idx_clients_archived_at ON clients(archived_at);

-- ── Archive audit log ─────────────────────────────────────────────
-- Append-only; never deleted. Tracks who archived/restored each record.
CREATE TABLE IF NOT EXISTS archive_log (
  id               TEXT PRIMARY KEY,
  entity_type      TEXT        NOT NULL,  -- 'job' | 'quote' | 'client'
  entity_id        TEXT        NOT NULL,
  entity_label     TEXT        NOT NULL,
  action           TEXT        NOT NULL,  -- 'archive' | 'restore'
  performed_by     TEXT        NOT NULL,
  performed_by_name TEXT       NOT NULL,
  performed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason           TEXT
);

CREATE INDEX IF NOT EXISTS idx_archive_log_entity    ON archive_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_archive_log_performed ON archive_log(performed_at DESC);

-- Enable Row Level Security — service role only (app uses service role server-side)
ALTER TABLE archive_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS archive_log_open ON archive_log;
DROP POLICY IF EXISTS "Service role full access on archive_log" ON archive_log;
CREATE POLICY "Service role full access on archive_log"
  ON archive_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── 022_fix_archive_log_rls.sql ───
-- Restrict archive_log to service_role only (replaces permissive archive_log_open policy).

ALTER TABLE archive_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS archive_log_open ON archive_log;
DROP POLICY IF EXISTS "Service role full access on archive_log" ON archive_log;

CREATE POLICY "Service role full access on archive_log"
  ON archive_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── 012_indexes.sql ───
-- 012_indexes.sql
-- Performance indexes for common query patterns.
-- Idempotent: all use CREATE INDEX IF NOT EXISTS.
-- Run this in the Supabase SQL editor after 011_soft_delete.sql.

-- ── Jobs ──────────────────────────────────────────────────────────
-- Active job list (most common query — status + not archived)
CREATE INDEX IF NOT EXISTS idx_jobs_status_archived
  ON jobs(status, archived_at);

-- Client job history
CREATE INDEX IF NOT EXISTS idx_jobs_client_id
  ON jobs(client_id);

-- Deadline / overdue views
CREATE INDEX IF NOT EXISTS idx_jobs_required_by_date
  ON jobs(required_by_date)
  WHERE required_by_date IS NOT NULL;

-- Drawing number lookup / sort
CREATE INDEX IF NOT EXISTS idx_jobs_drawing_number
  ON jobs(drawing_number);

-- Revision chains (parent → children)
CREATE INDEX IF NOT EXISTS idx_jobs_parent_job_id
  ON jobs(parent_job_id)
  WHERE parent_job_id IS NOT NULL;

-- Item type filter (Design / CATIII / etc.)
CREATE INDEX IF NOT EXISTS idx_jobs_item_type
  ON jobs(item_type);

-- Designer assignment filter
CREATE INDEX IF NOT EXISTS idx_jobs_designer
  ON jobs(designer)
  WHERE designer IS NOT NULL AND designer <> '';

-- Billing queue
CREATE INDEX IF NOT EXISTS idx_jobs_billing_status
  ON jobs(billing_status)
  WHERE billing_status IS NOT NULL;

-- Recency sort
CREATE INDEX IF NOT EXISTS idx_jobs_created_at
  ON jobs(created_at DESC);

-- ── Quotes ────────────────────────────────────────────────────────
-- Active quote list
CREATE INDEX IF NOT EXISTS idx_quotes_status_archived
  ON quotes(status, archived_at);

-- Client quote history
CREATE INDEX IF NOT EXISTS idx_quotes_client_id
  ON quotes(client_id)
  WHERE client_id IS NOT NULL;

-- Expiry checking (auto-expire cron)
CREATE INDEX IF NOT EXISTS idx_quotes_expiry_date
  ON quotes(expiry_date)
  WHERE expiry_date IS NOT NULL;

-- Quote linked to job
CREATE INDEX IF NOT EXISTS idx_quotes_job_id
  ON quotes(job_id)
  WHERE job_id IS NOT NULL;

-- Recency sort
CREATE INDEX IF NOT EXISTS idx_quotes_created_at
  ON quotes(created_at DESC);

-- ── Clients ───────────────────────────────────────────────────────
-- Active client list
CREATE INDEX IF NOT EXISTS idx_clients_active
  ON clients(active);

-- Name search
CREATE INDEX IF NOT EXISTS idx_clients_name_lower
  ON clients(name_lower);

-- ── Status history ────────────────────────────────────────────────
-- Job history lookup (already created by 004 but included for safety)
CREATE INDEX IF NOT EXISTS idx_status_history_job_id
  ON status_history(job_id);

-- Recency sort on history
CREATE INDEX IF NOT EXISTS idx_status_history_changed_at
  ON status_history(changed_at DESC);

-- ── Archive log ───────────────────────────────────────────────────
-- (indexes already created in 011_soft_delete.sql — included here for reference only)
-- idx_archive_log_entity    ON archive_log(entity_type, entity_id)
-- idx_archive_log_performed ON archive_log(performed_at DESC)

-- ─── 014_employees.sql ───
-- =============================================================================
-- Oryx Design — Supabase migration 014: employee HR profiles
-- Enable with SUPABASE_EMPLOYEES=true after sync script
-- =============================================================================

create table if not exists public.employee_profiles (
  user_id                        text primary key references public.app_users (id) on delete cascade,
  employee_id                    text unique,
  profile_photo_path             text,
  first_name                     text,
  last_name                      text,
  preferred_name                 text,
  phone                          text,
  mobile                         text,
  date_of_birth                  text,
  gender                         text,
  nationality                    text,
  address                        text,
  city                           text,
  county                         text,
  postcode                       text,
  country                        text,
  emergency_contact_name         text,
  emergency_contact_phone        text,
  emergency_contact_relationship text,
  job_title                      text,
  department                     text,
  manager_id                     text references public.app_users (id) on delete set null,
  office_location                text,
  employment_type                text not null default 'FULL_TIME',
  employment_status              text not null default 'ACTIVE',
  start_date                     text,
  end_date                       text,
  probation_end_date             text,
  working_hours                  text,
  salary                         double precision,
  annual_leave_allowance         double precision not null default 25,
  leave_taken                    double precision not null default 0,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now()
);

create index if not exists idx_employee_profiles_department on public.employee_profiles (department);
create index if not exists idx_employee_profiles_status on public.employee_profiles (employment_status);
create index if not exists idx_employee_profiles_manager on public.employee_profiles (manager_id);
create index if not exists idx_employee_profiles_employee_id on public.employee_profiles (employee_id);

drop trigger if exists employee_profiles_updated_at on public.employee_profiles;
create trigger employee_profiles_updated_at
  before update on public.employee_profiles
  for each row execute function public.set_updated_at();

alter table public.employee_profiles enable row level security;
drop policy if exists "Service role full access on employee_profiles" on public.employee_profiles;
create policy "Service role full access on employee_profiles"
  on public.employee_profiles for all to service_role using (true) with check (true);

create table if not exists public.employee_skills (
  id                text primary key,
  user_id           text not null references public.app_users (id) on delete cascade,
  name              text not null,
  level             text,
  years_experience  double precision,
  category          text not null default 'SKILL',
  certificate_path  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_employee_skills_user on public.employee_skills (user_id);

drop trigger if exists employee_skills_updated_at on public.employee_skills;
create trigger employee_skills_updated_at
  before update on public.employee_skills
  for each row execute function public.set_updated_at();

alter table public.employee_skills enable row level security;
drop policy if exists "Service role full access on employee_skills" on public.employee_skills;
create policy "Service role full access on employee_skills"
  on public.employee_skills for all to service_role using (true) with check (true);

create table if not exists public.employee_documents (
  id               text primary key,
  user_id          text not null references public.app_users (id) on delete cascade,
  name             text not null,
  category         text not null default 'OTHER',
  file_path        text not null,
  mime_type        text not null,
  file_size        integer not null default 0,
  restricted       boolean not null default false,
  uploaded_by      text not null,
  uploaded_by_name text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_employee_documents_user on public.employee_documents (user_id);

drop trigger if exists employee_documents_updated_at on public.employee_documents;
create trigger employee_documents_updated_at
  before update on public.employee_documents
  for each row execute function public.set_updated_at();

alter table public.employee_documents enable row level security;
drop policy if exists "Service role full access on employee_documents" on public.employee_documents;
create policy "Service role full access on employee_documents"
  on public.employee_documents for all to service_role using (true) with check (true);

create table if not exists public.employee_notes (
  id               text primary key,
  user_id          text not null references public.app_users (id) on delete cascade,
  content          text not null,
  created_by       text not null,
  created_by_name  text not null,
  updated_by       text,
  updated_by_name  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_employee_notes_user on public.employee_notes (user_id);

drop trigger if exists employee_notes_updated_at on public.employee_notes;
create trigger employee_notes_updated_at
  before update on public.employee_notes
  for each row execute function public.set_updated_at();

alter table public.employee_notes enable row level security;
drop policy if exists "Service role full access on employee_notes" on public.employee_notes;
create policy "Service role full access on employee_notes"
  on public.employee_notes for all to service_role using (true) with check (true);

create table if not exists public.employee_activity (
  id                text primary key,
  user_id           text not null references public.app_users (id) on delete cascade,
  action            text not null,
  detail            text,
  performed_by      text not null,
  performed_by_name text not null,
  created_at        timestamptz not null default now()
);

create index if not exists idx_employee_activity_user on public.employee_activity (user_id, created_at desc);

alter table public.employee_activity enable row level security;
drop policy if exists "Service role full access on employee_activity" on public.employee_activity;
create policy "Service role full access on employee_activity"
  on public.employee_activity for all to service_role using (true) with check (true);

notify pgrst, 'reload schema';

-- ─── 015_leave.sql ───
-- =============================================================================
-- Oryx Design — Supabase migration 015: leave requests + calendar links
-- Enable with SUPABASE_LEAVE=true after sync script
-- =============================================================================

create table if not exists public.leave_requests (
  id               text primary key,
  user_id          text not null references public.app_users (id) on delete cascade,
  leave_type       text not null default 'ANNUAL_LEAVE',
  start_date       text not null,
  end_date         text not null,
  reason           text,
  status           text not null default 'PENDING',
  reviewed_by      text references public.app_users (id) on delete set null,
  reviewed_by_name text,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_leave_requests_user on public.leave_requests (user_id);
create index if not exists idx_leave_requests_status on public.leave_requests (status);
create index if not exists idx_leave_requests_dates on public.leave_requests (start_date, end_date);

drop trigger if exists leave_requests_updated_at on public.leave_requests;
create trigger leave_requests_updated_at
  before update on public.leave_requests
  for each row execute function public.set_updated_at();

alter table public.leave_requests enable row level security;
drop policy if exists "Service role full access on leave_requests" on public.leave_requests;
create policy "Service role full access on leave_requests"
  on public.leave_requests for all to service_role using (true) with check (true);

create table if not exists public.leave_calendar_links (
  leave_request_id  text primary key references public.leave_requests (id) on delete cascade,
  calendar_event_id text not null unique references public.calendar_events (id) on delete cascade,
  user_id           text not null references public.app_users (id) on delete cascade,
  status            text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_leave_calendar_links_event on public.leave_calendar_links (calendar_event_id);

drop trigger if exists leave_calendar_links_updated_at on public.leave_calendar_links;
create trigger leave_calendar_links_updated_at
  before update on public.leave_calendar_links
  for each row execute function public.set_updated_at();

alter table public.leave_calendar_links enable row level security;
drop policy if exists "Service role full access on leave_calendar_links" on public.leave_calendar_links;
create policy "Service role full access on leave_calendar_links"
  on public.leave_calendar_links for all to service_role using (true) with check (true);

notify pgrst, 'reload schema';

-- ─── 016_calendar_annual_leave.sql ───
-- =============================================================================
-- Oryx Design — Supabase migration 016: annual leave calendar category
-- Required for leave ↔ calendar sync (categoryId cat_annual_leave)
-- Note: cat_leave ('Leave') is seeded in 007_calendar.sql — distinct name required.
-- =============================================================================

insert into public.event_categories (id, name, color, icon) values
  ('cat_annual_leave', 'Annual Leave', '#15803D', 'calendar-off')
on conflict (id) do nothing;

notify pgrst, 'reload schema';

-- ─── 017_password_vault.sql ───
-- =============================================================================
-- Oryx Design — Supabase migration 017: account password vault
-- Enable with SUPABASE_PASSWORD_VAULT=true after sync script
--
-- Passwords are stored as AES-256-GCM ciphertext (password_enc) — encrypted
-- app-side before insert. Set VAULT_ENCRYPTION_KEY in production.
-- =============================================================================

create table if not exists public.password_vault_entries (
  id                 text primary key,
  service_name       text not null,
  service_name_lower text not null,
  login_url          text,
  username           text,
  username_lower     text,
  password_enc       text not null,
  category           text,
  category_lower     text,
  notes              text,
  extra_json         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_pvault_service on public.password_vault_entries (service_name_lower);
create index if not exists idx_pvault_category on public.password_vault_entries (category_lower);

drop trigger if exists password_vault_entries_updated_at on public.password_vault_entries;
create trigger password_vault_entries_updated_at
  before update on public.password_vault_entries
  for each row execute function public.set_updated_at();

alter table public.password_vault_entries enable row level security;
drop policy if exists "Service role full access on password_vault_entries" on public.password_vault_entries;
create policy "Service role full access on password_vault_entries"
  on public.password_vault_entries for all to service_role using (true) with check (true);

notify pgrst, 'reload schema';

-- ─── 018_job_geocoding.sql ───
-- =============================================================================
-- Oryx Design — Supabase migration 018: job map geocoding columns
-- =============================================================================

alter table public.jobs add column if not exists latitude double precision;
alter table public.jobs add column if not exists longitude double precision;
alter table public.jobs add column if not exists geocoded_at timestamptz;
alter table public.jobs add column if not exists geocoded_address text;

create index if not exists idx_jobs_geocode on public.jobs (latitude, longitude)
  where latitude is not null;

notify pgrst, 'reload schema';

-- ─── 019_job_map_indexes.sql ───
-- =============================================================================
-- Oryx Design — Supabase migration 019: job map query indexes
-- =============================================================================

-- Individual coordinate indexes (map filter + geocode status queries)
create index if not exists idx_jobs_latitude on public.jobs (latitude)
  where latitude is not null;

create index if not exists idx_jobs_longitude on public.jobs (longitude)
  where longitude is not null;

-- Completed jobs with coordinates (map display query)
create index if not exists idx_jobs_map_plotted on public.jobs (status, archived_at, latitude, longitude)
  where status = 'ISSUED'
    and archived_at is null
    and latitude is not null
    and longitude is not null;

-- Completed jobs missing coordinates (admin geocode + notification count)
create index if not exists idx_jobs_map_missing_coords on public.jobs (status, archived_at)
  where status = 'ISSUED'
    and archived_at is null
    and (latitude is null or longitude is null);

notify pgrst, 'reload schema';

-- ─── 020_job_location.sql ───
-- =============================================================================
-- Oryx Design — Supabase migration 020: job location management fields
-- =============================================================================

alter table public.jobs add column if not exists site_name text;
alter table public.jobs add column if not exists site_address text;
alter table public.jobs add column if not exists location_status text;
alter table public.jobs add column if not exists location_source text;

-- Backfill site_address from legacy address column
update public.jobs
set site_address = address
where (site_address is null or trim(site_address) = '')
  and address is not null
  and trim(address) != '';

-- Existing coordinates → mapped / geocoded (do not change lat/lng)
update public.jobs
set location_status = 'mapped',
    location_source = 'geocoded'
where latitude is not null
  and longitude is not null
  and location_status is null;

create index if not exists idx_jobs_location_status on public.jobs (location_status)
  where status = 'ISSUED' and archived_at is null;

notify pgrst, 'reload schema';

-- ─── 021_client_contacts.sql ───
-- Multiple contact people per client company.

create table if not exists public.client_contacts (
  id          text primary key,
  client_id   text not null references public.clients (id) on delete cascade,
  name        text not null,
  email       text,
  phone       text,
  role        text,
  is_primary  boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_client_contacts_client on public.client_contacts (client_id);
create index if not exists idx_client_contacts_primary on public.client_contacts (client_id, is_primary);

drop trigger if exists client_contacts_updated_at on public.client_contacts;
create trigger client_contacts_updated_at
  before update on public.client_contacts
  for each row execute function public.set_updated_at();

alter table public.client_contacts enable row level security;
drop policy if exists "Service role full access on client_contacts" on public.client_contacts;
create policy "Service role full access on client_contacts"
  on public.client_contacts for all to service_role
  using (true) with check (true);

-- Backfill one contact row from legacy client fields.
insert into public.client_contacts (
  id, client_id, name, email, phone, role, is_primary, sort_order, created_at, updated_at
)
select
  c.id || '-primary',
  c.id,
  coalesce(nullif(trim(c.contact_name), ''), 'Main contact'),
  c.email,
  c.phone,
  null,
  true,
  0,
  c.created_at,
  c.updated_at
from public.clients c
where (
  nullif(trim(c.contact_name), '') is not null
  or nullif(trim(c.email), '') is not null
  or nullif(trim(c.phone), '') is not null
)
and not exists (
  select 1 from public.client_contacts cc where cc.client_id = c.id
);

-- ─── 023_job_list_sort_key.sql ───
-- =============================================================================
-- Oryx Design — Supabase migration 023: job list sort key
-- Enables paginated drawing-number sort without loading all job rows.
-- =============================================================================

alter table public.jobs
  add column if not exists list_sort_key text;

update public.jobs j
set list_sort_key = sub.key
from (
  select
    id,
    case
      when (
        case when parent_job_id is not null
          then regexp_replace(drawing_number, ' Rev [A-Z]$', '')
          else drawing_number
        end
      ) ~ '^\d{2}/ORYX/\d{2}/\d+$' then
        lpad(
          (regexp_match(
            case when parent_job_id is not null
              then regexp_replace(drawing_number, ' Rev [A-Z]$', '')
              else drawing_number
            end,
            '^\d{2}/ORYX/\d{2}/(\d+)$'
          ))[1],
          4, '0'
        )
        || '-'
        || lpad(
          case
            when revision_letter ~ '^[A-Z]$'
              then (ascii(revision_letter) - 64)::text
            else '0'
          end,
          2, '0'
        )
      else 'Z' || drawing_number || coalesce('-' || revision_letter, '')
    end as key
  from public.jobs
) sub
where j.id = sub.id
  and (j.list_sort_key is null or j.list_sort_key <> sub.key);

create index if not exists idx_jobs_list_sort_key
  on public.jobs (list_sort_key, created_at);

notify pgrst, 'reload schema';

-- ─── 024_app_sequences.sql ───
-- Atomic sequence counters for drawing numbers and reference numbers (Supabase-only mode).

create table if not exists public.app_sequences (
  name text primary key,
  value integer not null default 0
);

create or replace function public.bump_app_sequence(p_name text, p_delta int default 1)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v integer;
begin
  insert into app_sequences (name, value)
  values (p_name, p_delta)
  on conflict (name) do update
    set value = app_sequences.value + excluded.value
  returning value into v;
  return v;
end;
$$;

grant execute on function public.bump_app_sequence(text, int) to service_role;

-- ─── 025_site_visit_calculations.sql ───
-- Saved site visit cost calculations (shared across all users).

create table if not exists public.site_visit_calculations (
  id                       text primary key,
  label                    text,
  created_by               text not null references public.app_users(id),
  created_by_name          text,
  site_address             text not null,
  site_lat                 double precision,
  site_lng                 double precision,
  one_way_distance_miles   numeric(8,2) not null,
  one_way_duration_minutes numeric(8,1) not null,
  site_hours               numeric(4,2) not null,
  mileage_rate             numeric(6,4) not null default 0.45,
  hourly_rate              numeric(8,2) not null default 95,
  vat_rate                 numeric(5,4) not null default 0.2,
  mileage_cost             numeric(10,2) not null,
  labour_cost              numeric(10,2) not null,
  subtotal                 numeric(10,2) not null,
  vat                      numeric(10,2) not null,
  grand_total              numeric(10,2) not null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_site_visit_calc_created
  on public.site_visit_calculations (created_at desc);

drop trigger if exists site_visit_calculations_updated_at on public.site_visit_calculations;
create trigger site_visit_calculations_updated_at
  before update on public.site_visit_calculations
  for each row execute function public.set_updated_at();

alter table public.site_visit_calculations enable row level security;
drop policy if exists "Service role full access on site_visit_calculations" on public.site_visit_calculations;
create policy "Service role full access on site_visit_calculations"
  on public.site_visit_calculations for all to service_role using (true) with check (true);

notify pgrst, 'reload schema';

-- ─── seed-admin.sql (default logins) ───
-- Default login accounts after a clean bootstrap (dev / recovery only).
-- Passwords: admin@test.com → admin123, engineer@test.com → engineer123
-- Change or remove in production once real users are synced via npm run supabase:sync-users.

insert into public.app_users (
  id, name, email, email_lower, role, active,
  password_hash, must_change_password, created_at, updated_at
) values
  (
    'bootstrap-admin-001',
    'Admin',
    'admin@test.com',
    'admin@test.com',
    'ADMIN',
    true,
    '$2b$12$wVrk8AKFzoiXEI7Omnk.T.dglEnJb2dJ3tCQb6WzMwjZFTcWcAdJS',
    false,
    now(),
    now()
  ),
  (
    'bootstrap-engineer-001',
    'Engineer',
    'engineer@test.com',
    'engineer@test.com',
    'ENGINEER',
    true,
    '$2b$12$/DdL.xz2gZCeQ9D6iOROkurSonjZLdrEZJ/yzZfDf3kQvoAiUW0gy',
    false,
    now(),
    now()
  )
on conflict (email_lower) do update set
  name = excluded.name,
  role = excluded.role,
  active = true,
  password_hash = excluded.password_hash,
  must_change_password = false,
  updated_at = now();

notify pgrst, 'reload schema';
