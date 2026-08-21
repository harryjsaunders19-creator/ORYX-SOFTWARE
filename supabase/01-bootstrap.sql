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
--   1. Set Vercel env vars (see README production checklist)
--   2. Log in with seeded accounts — passwords must be changed on first login
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
revoke execute on function public.bump_app_sequence(text, int) from public, anon, authenticated;

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

-- ─── 026_login_rate_limits.sql ───
-- Login rate-limit counters (shared across Vercel serverless instances).

create table if not exists public.login_rate_limits (
  rate_key      text primary key,
  attempt_count integer not null default 1,
  reset_at      timestamptz not null
);

create index if not exists idx_login_rate_limits_reset
  on public.login_rate_limits (reset_at);

alter table public.login_rate_limits enable row level security;
drop policy if exists "Service role full access on login_rate_limits" on public.login_rate_limits;
create policy "Service role full access on login_rate_limits"
  on public.login_rate_limits for all to service_role using (true) with check (true);

-- ─── 027_security_sequences_aggregates.sql ───
-- 027: Lock privileged RPCs + app_sequences; safe sequence seed; SQL aggregates.
-- Fixes live advisor findings: anon-executable SECURITY DEFINER wipe/bump,
-- RLS disabled on app_sequences, mutable search_path on set_updated_at.

-- ── Wipe RPC: never callable via anon/authenticated Data API ───────────────
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'reset_operational_data'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    revoke execute on function public.reset_operational_data() from public, anon, authenticated;
    grant execute on function public.reset_operational_data() to service_role;
  end if;
end $$;

-- ── app_sequences: RLS + revoke table privileges from API roles ─────────────
alter table if exists public.app_sequences enable row level security;

revoke all on table public.app_sequences from public, anon, authenticated;
grant all on table public.app_sequences to service_role;

drop policy if exists "service_role all app_sequences" on public.app_sequences;
create policy "service_role all app_sequences"
  on public.app_sequences
  for all
  to service_role
  using (true)
  with check (true);

-- ── bump_app_sequence: service_role only ────────────────────────────────────
revoke execute on function public.bump_app_sequence(text, int) from public, anon, authenticated;
grant execute on function public.bump_app_sequence(text, int) to service_role;

-- Floor seed that never lowers an existing counter (cold-start safe).
create or replace function public.seed_app_sequence(p_name text, p_value int)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v integer;
begin
  if p_value is null or p_value < 0 then
    raise exception 'seed_app_sequence: p_value must be >= 0';
  end if;
  insert into app_sequences (name, value)
  values (p_name, p_value)
  on conflict (name) do update
    set value = greatest(app_sequences.value, excluded.value)
  returning value into v;
  return v;
end;
$$;

revoke all on function public.seed_app_sequence(text, int) from public, anon, authenticated;
grant execute on function public.seed_app_sequence(text, int) to service_role;

-- ── set_updated_at: pin search_path ─────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_updated_at'
  ) then
    execute 'alter function public.set_updated_at() set search_path = public';
  end if;
end $$;

-- ── Dashboard job aggregates (no 1000-row PostgREST cap) ────────────────────
create or replace function public.job_dashboard_counts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with active as (
    select status, item_type, designer, parent_job_id, required_by_date
    from jobs
    where archived_at is null
  ),
  by_status as (
    select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', c) order by status), '[]'::jsonb) as v
    from (select status, count(*)::int as c from active group by status) s
  ),
  by_type as (
    select coalesce(jsonb_agg(jsonb_build_object('itemType', item_type, 'count', c) order by item_type), '[]'::jsonb) as v
    from (select item_type, count(*)::int as c from active group by item_type) t
  ),
  meta as (
    select
      count(*) filter (where coalesce(designer, '') = '')::int as unassigned,
      count(*) filter (where parent_job_id is null)::int as total_active_jobs,
      count(*) filter (where parent_job_id is not null)::int as total_revisions,
      -- Deadline tallies exclude ISSUED; dueThisWeek is today..today+7 inclusive.
      count(*) filter (
        where status <> 'ISSUED'
          and required_by_date is not null
          and required_by_date::date < (timezone('utc', now()))::date
      )::int as overdue_count,
      count(*) filter (
        where status <> 'ISSUED'
          and required_by_date is not null
          and required_by_date::date = (timezone('utc', now()))::date
      )::int as due_today_count,
      count(*) filter (
        where status <> 'ISSUED'
          and required_by_date is not null
          and required_by_date::date >= (timezone('utc', now()))::date
          and required_by_date::date <= ((timezone('utc', now()))::date + 7)
      )::int as due_this_week_count
    from active
  )
  select jsonb_build_object(
    'byStatus', (select v from by_status),
    'byItemType', (select v from by_type),
    'unassigned', (select unassigned from meta),
    'totalActiveJobs', (select total_active_jobs from meta),
    'totalRevisions', (select total_revisions from meta),
    'overdueCount', (select overdue_count from meta),
    'dueTodayCount', (select due_today_count from meta),
    'dueThisWeekCount', (select due_this_week_count from meta)
  );
$$;

revoke all on function public.job_dashboard_counts() from public, anon, authenticated;
grant execute on function public.job_dashboard_counts() to service_role;

-- ── Quote stats aggregates ──────────────────────────────────────────────────
create or replace function public.quote_stats_agg()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with active as (
    select status, coalesce(quote_value, 0)::numeric as quote_value
    from quotes
    where archived_at is null
  ),
  tallies as (
    select
      count(*)::int as total,
      count(*) filter (where status = 'DRAFT')::int as draft,
      count(*) filter (where status = 'SENT')::int as sent,
      count(*) filter (where status = 'ACCEPTED')::int as accepted,
      count(*) filter (where status = 'REJECTED')::int as rejected,
      count(*) filter (where status = 'EXPIRED')::int as expired,
      coalesce(sum(quote_value), 0)::float8 as total_value,
      coalesce(sum(quote_value) filter (where status = 'ACCEPTED'), 0)::float8 as accepted_value
    from active
  )
  select jsonb_build_object(
    'total', total,
    'draft', draft,
    'sent', sent,
    'accepted', accepted,
    'rejected', rejected,
    'expired', expired,
    'totalValue', total_value,
    'acceptedValue', accepted_value,
    'conversionRate', case
      when (accepted + rejected) > 0 then accepted::float8 / (accepted + rejected)::float8
      else 0::float8
    end
  )
  from tallies;
$$;

revoke all on function public.quote_stats_agg() from public, anon, authenticated;
grant execute on function public.quote_stats_agg() to service_role;

-- ─── 028_employee_files_storage.sql ───
-- Private bucket for employee photos/documents (service-role only; no public policies).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-files',
  'employee-files',
  false,
  15728640,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ─── 029_job_billable.sql ───
-- Oryx Design — migration 029: job billable flag for revision invoicing
-- Revisions only enter Ready for Invoicing when billable=true and status=ISSUED.
-- Existing revision rows that already have a handoff stay billable; others default false.

alter table public.jobs
  add column if not exists billable boolean not null default true;

-- New default for revisions: not chargeable unless marked. Preserve handoff queue.
update public.jobs
set billable = false
where parent_job_id is not null;

update public.jobs j
set billable = true
where j.parent_job_id is not null
  and exists (
    select 1 from public.billing_handoffs b where b.source_job_id = j.id
  );

comment on column public.jobs.billable is
  'When true and status=ISSUED, creates a Ready for Invoicing handoff. Originals default true; new revisions default false.';

-- ─── 030_parent_jobs_work_items.sql ───
-- =============================================================================
-- Oryx Design — migration 030: parent_jobs + work_items (design projects)
-- Run after 029_job_billable.sql
--
-- Design drawings become permanent parent_jobs with billable work_items.
-- Non-design jobs (site visits, surveys, etc.) remain in public.jobs unchanged.
-- Enable reads with WORK_ITEMS_MODEL=true after backfill (Phase 2+).
-- =============================================================================

-- ── parent_jobs ───────────────────────────────────────────────────────────────
create table if not exists public.parent_jobs (
  id                      text primary key,
  drawing_number          text not null,
  client_id               text references public.clients (id) on delete set null,
  client_company          text not null,
  site_name               text,
  site_address            text,
  address                 text not null,
  type_of_works           text not null,
  custom_type_description text,
  legacy_type_of_works    text,
  description             text,
  requested_by            text not null,
  item_type               text not null default 'DESIGN',
  archived_at             timestamptz,
  archived_by             text,
  latitude                double precision,
  longitude               double precision,
  geocoded_at             timestamptz,
  geocoded_address        text,
  location_status         text,
  location_source         text,
  legacy_job_id           text not null,
  migrated_at             timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint parent_jobs_drawing_number_unique unique (drawing_number),
  constraint parent_jobs_legacy_job_unique unique (legacy_job_id)
);

create index if not exists idx_parent_jobs_client_id on public.parent_jobs (client_id);
create index if not exists idx_parent_jobs_client_company on public.parent_jobs (client_company);
create index if not exists idx_parent_jobs_archived on public.parent_jobs (archived_at);
create index if not exists idx_parent_jobs_created_at on public.parent_jobs (created_at);

drop trigger if exists parent_jobs_updated_at on public.parent_jobs;
create trigger parent_jobs_updated_at
  before update on public.parent_jobs
  for each row execute function public.set_updated_at();

alter table public.parent_jobs enable row level security;

drop policy if exists "Service role full access on parent_jobs" on public.parent_jobs;
create policy "Service role full access on parent_jobs"
  on public.parent_jobs for all to service_role
  using (true) with check (true);

-- ── work_items ────────────────────────────────────────────────────────────────
create table if not exists public.work_items (
  id                      text primary key,
  parent_job_id           text not null references public.parent_jobs (id) on delete restrict,
  work_type               text not null,
  revision_letter         text,
  title                   text not null,
  description             text,
  status                  text not null default 'NEW_REQUEST',
  designer                text not null default '',
  priority                text,
  billable                boolean not null default true,
  requested_date          date,
  required_by_date        date,
  notes                   text,
  commercial_notes        text,
  quote_value             numeric,
  quote_reference         text,
  quote_date              date,
  variation_fees          numeric,
  additional_charges      numeric,
  invoice_status          text not null default 'NONE',
  invoice_number          text,
  invoice_date            date,
  billed_value            numeric,
  date_created            timestamptz not null,
  completed_at            date,
  legacy_job_id           text,
  migrated_at             timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint work_items_work_type_check check (work_type in ('ORIGINAL', 'REVISION')),
  constraint work_items_invoice_status_check check (
    invoice_status in ('NONE', 'READY', 'INVOICED', 'WRITTEN_OFF')
  )
);

create unique index if not exists idx_work_items_one_original_per_parent
  on public.work_items (parent_job_id)
  where work_type = 'ORIGINAL';

create unique index if not exists idx_work_items_revision_letter_per_parent
  on public.work_items (parent_job_id, revision_letter)
  where work_type = 'REVISION' and revision_letter is not null;

create index if not exists idx_work_items_parent_job_id on public.work_items (parent_job_id);
create index if not exists idx_work_items_status on public.work_items (status);
create index if not exists idx_work_items_designer_status on public.work_items (designer, status);
create index if not exists idx_work_items_legacy_job_id on public.work_items (legacy_job_id);
create index if not exists idx_work_items_invoice_status on public.work_items (invoice_status);

drop trigger if exists work_items_updated_at on public.work_items;
create trigger work_items_updated_at
  before update on public.work_items
  for each row execute function public.set_updated_at();

alter table public.work_items enable row level security;

drop policy if exists "Service role full access on work_items" on public.work_items;
create policy "Service role full access on work_items"
  on public.work_items for all to service_role
  using (true) with check (true);

-- ── migration id map ──────────────────────────────────────────────────────────
create table if not exists public.work_item_id_map (
  legacy_job_id   text primary key,
  work_item_id    text not null references public.work_items (id) on delete cascade,
  parent_job_id   text not null references public.parent_jobs (id) on delete cascade,
  migrated_at     timestamptz not null default now()
);

create index if not exists idx_work_item_id_map_work_item on public.work_item_id_map (work_item_id);
create index if not exists idx_work_item_id_map_parent on public.work_item_id_map (parent_job_id);

alter table public.work_item_id_map enable row level security;

drop policy if exists "Service role full access on work_item_id_map" on public.work_item_id_map;
create policy "Service role full access on work_item_id_map"
  on public.work_item_id_map for all to service_role
  using (true) with check (true);

-- ── FK remap columns (nullable until backfill) ────────────────────────────────
alter table public.status_history
  add column if not exists work_item_id text references public.work_items (id) on delete cascade;

create index if not exists idx_status_history_work_item_id
  on public.status_history (work_item_id);

alter table public.billing_handoffs
  add column if not exists source_work_item_id text references public.work_items (id);

create index if not exists idx_billing_handoffs_source_work_item
  on public.billing_handoffs (source_work_item_id);

alter table public.quotes
  add column if not exists parent_job_id text references public.parent_jobs (id) on delete set null;

create index if not exists idx_quotes_parent_job_id on public.quotes (parent_job_id);

alter table public.calendar_events
  add column if not exists work_item_id text references public.work_items (id) on delete set null;

create index if not exists idx_calendar_events_work_item_id on public.calendar_events (work_item_id);

comment on table public.parent_jobs is
  'Permanent design project shell — one row per drawing number. Never duplicated.';

comment on table public.work_items is
  'Billable work on a design project: Original Issue or Revision A/B/C. Engineers work items, not parents.';

notify pgrst, 'reload schema';

-- ─── 031_work_item_fk_nullable.sql ───
-- =============================================================================
-- Oryx Design — migration 031: allow work-item-only history and billing FKs
-- Required for Phase 2 when new DESIGN projects no longer create jobs rows.
-- =============================================================================

alter table public.status_history
  alter column job_id drop not null;

alter table public.billing_handoffs
  alter column source_job_id drop not null;

create unique index if not exists idx_billing_handoffs_active_work_item_unique
  on public.billing_handoffs (source_work_item_id)
  where cleared_by_accounts_at is null and source_work_item_id is not null;

comment on column public.status_history.work_item_id is
  'Preferred FK when WORK_ITEMS_MODEL is on; job_id kept for legacy rows.';

comment on column public.billing_handoffs.source_work_item_id is
  'Preferred FK when WORK_ITEMS_MODEL is on; source_job_id kept for legacy rows.';

notify pgrst, 'reload schema';

-- ─── 032_audit_rpc_rate_limit_billing_export.sql ───
-- 032: Audit follow-ups — atomic rate limiting + transactional billing export commit.
-- Addresses production-readiness audit M10 (rate-limit race) and H2 (export integrity).

-- ── Atomic rate limit check (single row lock) ─────────────────────────────────
create or replace function public.check_rate_limit(
  p_rate_key text,
  p_window_ms bigint,
  p_max_attempts integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_reset_at timestamptz;
  v_count integer;
begin
  if p_rate_key is null or length(trim(p_rate_key)) = 0 then
    return true;
  end if;
  if p_window_ms is null or p_window_ms <= 0 or p_max_attempts is null or p_max_attempts <= 0 then
    return true;
  end if;

  select reset_at, attempt_count
  into v_reset_at, v_count
  from public.login_rate_limits
  where rate_key = p_rate_key
  for update;

  if not found or v_reset_at <= v_now then
    insert into public.login_rate_limits (rate_key, attempt_count, reset_at)
    values (
      p_rate_key,
      1,
      v_now + make_interval(secs => p_window_ms / 1000.0)
    )
    on conflict (rate_key) do update
      set attempt_count = 1,
          reset_at = excluded.reset_at;
    return true;
  end if;

  if v_count >= p_max_attempts then
    return false;
  end if;

  update public.login_rate_limits
  set attempt_count = attempt_count + 1
  where rate_key = p_rate_key;

  return true;
end;
$$;

revoke all on function public.check_rate_limit(text, bigint, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, bigint, integer) to service_role;

-- ── Billing export: batch + snapshots + clear in one transaction ─────────────
create or replace function public.commit_billing_export(
  p_batch jsonb,
  p_snapshots jsonb,
  p_handoff_ids text[],
  p_cleared_at timestamptz,
  p_cleared_by text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected integer;
  v_cleared integer;
  v_batch_id text;
  snap jsonb;
begin
  if p_batch is null or p_snapshots is null or p_handoff_ids is null then
    raise exception 'commit_billing_export: missing required arguments';
  end if;

  v_batch_id := p_batch->>'id';
  if v_batch_id is null or length(trim(v_batch_id)) = 0 then
    raise exception 'commit_billing_export: batch id required';
  end if;

  v_expected := coalesce(array_length(p_handoff_ids, 1), 0);
  if v_expected = 0 then
    raise exception 'commit_billing_export: no handoff ids';
  end if;

  insert into public.billing_export_batches (
    id, batch_number, export_date, exported_by, record_count, notes, created_at
  )
  values (
    v_batch_id,
    p_batch->>'batch_number',
    (p_batch->>'export_date')::date,
    coalesce(p_batch->>'exported_by', 'System'),
    coalesce((p_batch->>'record_count')::integer, v_expected),
    nullif(p_batch->>'notes', ''),
    coalesce((p_batch->>'created_at')::timestamptz, now())
  );

  for snap in select value from jsonb_array_elements(p_snapshots)
  loop
    insert into public.billing_export_snapshots (
      id, batch_id, handoff_id, snapshot_json, created_at
    )
    values (
      snap->>'id',
      coalesce(snap->>'batch_id', v_batch_id),
      snap->>'handoff_id',
      snap->>'snapshot_json',
      coalesce((snap->>'created_at')::timestamptz, now())
    );
  end loop;

  update public.billing_handoffs
  set
    cleared_by_accounts_at = p_cleared_at,
    cleared_by = p_cleared_by,
    export_batch_id = v_batch_id,
    notes = coalesce(p_notes, notes),
    updated_at = p_cleared_at
  where id = any (p_handoff_ids)
    and cleared_by_accounts_at is null;

  get diagnostics v_cleared = row_count;

  if v_cleared <> v_expected then
    raise exception
      'commit_billing_export: expected % handoffs cleared, got % (already cleared or missing)',
      v_expected, v_cleared;
  end if;
end;
$$;

revoke all on function public.commit_billing_export(jsonb, jsonb, text[], timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.commit_billing_export(jsonb, jsonb, text[], timestamptz, text, text)
  to service_role;

-- ─── 033_convert_quote_to_job.sql ───
-- 033: Atomic quote → job convert (audit M5).
-- Inserts the job + initial status history and links the quote in one transaction.
-- Fails (rolls back) if the quote is missing, not ACCEPTED, or already converted.

create or replace function public.convert_quote_to_job(
  p_quote_id text,
  p_job jsonb,
  p_history_id text,
  p_changed_by text default 'System'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quotes%rowtype;
  v_job_id text;
  v_updated integer;
begin
  if p_quote_id is null or length(trim(p_quote_id)) = 0 then
    raise exception 'convert_quote_to_job: quote id required';
  end if;
  if p_job is null or p_job->>'id' is null then
    raise exception 'convert_quote_to_job: job payload required';
  end if;

  v_job_id := p_job->>'id';

  select * into v_quote
  from public.quotes
  where id = p_quote_id
  for update;

  if not found then
    raise exception 'convert_quote_to_job: quote not found';
  end if;

  if v_quote.status is distinct from 'ACCEPTED' then
    raise exception 'convert_quote_to_job: quote is not ACCEPTED';
  end if;

  if v_quote.job_id is not null then
    raise exception 'convert_quote_to_job: quote already converted';
  end if;

  insert into public.jobs (
    id, drawing_number, item_type, address, type_of_works, custom_type_description,
    legacy_type_of_works, client_company, client_id, requested_by, status, designer,
    date_created, date_completed, notes, quote_value, quote_reference, quote_date,
    commercial_notes, variation_fees, additional_charges, invoice_id, billing_status,
    billing_batch_id, requested_date, required_by_date, parent_job_id, revision_letter,
    billable, archived_at, archived_by, latitude, longitude, geocoded_at, geocoded_address,
    site_name, site_address, location_status, location_source, list_sort_key,
    created_at, updated_at
  )
  values (
    v_job_id,
    coalesce(p_job->>'drawing_number', 'TBC'),
    coalesce(p_job->>'item_type', 'DESIGN'),
    coalesce(p_job->>'address', 'Address TBC'),
    coalesce(p_job->>'type_of_works', 'Other'),
    nullif(p_job->>'custom_type_description', ''),
    nullif(p_job->>'legacy_type_of_works', ''),
    coalesce(p_job->>'client_company', ''),
    nullif(p_job->>'client_id', ''),
    coalesce(p_job->>'requested_by', ''),
    coalesce(p_job->>'status', 'NEW_REQUEST'),
    coalesce(p_job->>'designer', ''),
    coalesce((p_job->>'date_created')::timestamptz, now()),
    nullif(p_job->>'date_completed', '')::date,
    nullif(p_job->>'notes', ''),
    nullif(p_job->>'quote_value', '')::numeric,
    nullif(p_job->>'quote_reference', ''),
    nullif(p_job->>'quote_date', '')::date,
    nullif(p_job->>'commercial_notes', ''),
    nullif(p_job->>'variation_fees', '')::numeric,
    nullif(p_job->>'additional_charges', '')::numeric,
    nullif(p_job->>'invoice_id', ''),
    nullif(p_job->>'billing_status', ''),
    nullif(p_job->>'billing_batch_id', ''),
    nullif(p_job->>'requested_date', '')::date,
    nullif(p_job->>'required_by_date', '')::date,
    nullif(p_job->>'parent_job_id', ''),
    nullif(p_job->>'revision_letter', ''),
    coalesce((p_job->>'billable')::boolean, true),
    null,
    null,
    null,
    null,
    null,
    null,
    nullif(p_job->>'site_name', ''),
    nullif(p_job->>'site_address', ''),
    null,
    null,
    nullif(p_job->>'list_sort_key', ''),
    coalesce((p_job->>'created_at')::timestamptz, now()),
    coalesce((p_job->>'updated_at')::timestamptz, now())
  );

  insert into public.status_history (
    id, job_id, from_status, to_status, changed_by, changed_at, note
  )
  values (
    coalesce(nullif(p_history_id, ''), gen_random_uuid()::text),
    v_job_id,
    null,
    coalesce(p_job->>'status', 'NEW_REQUEST'),
    coalesce(nullif(p_changed_by, ''), 'System'),
    coalesce((p_job->>'created_at')::timestamptz, now()),
    null
  );

  update public.quotes
  set
    job_id = v_job_id,
    updated_at = now()
  where id = p_quote_id
    and job_id is null
    and status = 'ACCEPTED';

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'convert_quote_to_job: failed to link quote (already converted or status changed)';
  end if;

  -- Do not set quotes.parent_job_id here: that column references parent_jobs(id)
  -- (migration 030), not jobs(id). Legacy convert only links via quotes.job_id.
  -- Work-items convert sets parent_job_id in the app layer when a parent_jobs row exists.

  return jsonb_build_object(
    'job_id', v_job_id,
    'quote_id', p_quote_id,
    'drawing_number', p_job->>'drawing_number'
  );
end;
$$;

revoke all on function public.convert_quote_to_job(text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.convert_quote_to_job(text, jsonb, text, text)
  to service_role;

-- ─── 034_session_revocations.sql ───
-- =============================================================================
-- Oryx Design — Supabase migration 034: session revocation table
-- =============================================================================

create table if not exists public.session_revocations (
  token_sig   text primary key,
  revoked_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index if not exists idx_session_revocations_expires
  on public.session_revocations (expires_at);

alter table public.session_revocations enable row level security;

drop policy if exists "Service role full access on session_revocations" on public.session_revocations;
create policy "Service role full access on session_revocations"
  on public.session_revocations for all to service_role
  using (true) with check (true);

notify pgrst, 'reload schema';

-- ─── 035_perf_hot_path_indexes.sql ───
-- =============================================================================
-- Oryx Design — Supabase migration 035: hot-path performance indexes
-- Additive only — matches list/billing/notifications/history query patterns.
-- Idempotent: CREATE INDEX IF NOT EXISTS.
-- =============================================================================

-- Default jobs list: archived_at IS NULL ORDER BY list_sort_key, created_at
create index if not exists idx_jobs_list_sort_key_active
  on public.jobs (list_sort_key, created_at)
  where archived_at is null;

-- Deadline / notifications: non-issued active jobs with a due date
create index if not exists idx_jobs_required_by_active_open
  on public.jobs (required_by_date)
  where archived_at is null
    and status <> 'ISSUED'
    and required_by_date is not null;

-- Billing "Awaiting Accounts Action" queue sort
create index if not exists idx_billing_handoffs_queue_at_active
  on public.billing_handoffs (added_to_billing_queue_at)
  where cleared_by_accounts_at is null;

-- Job status timeline (filter by job, order by changed_at)
create index if not exists idx_status_history_job_changed
  on public.status_history (job_id, changed_at);

-- Active hold list ordered by added_at
create index if not exists idx_client_holds_active_added
  on public.client_holds (added_at desc)
  where status = 'ACTIVE';

-- Quotes list: archived_at IS NULL ORDER BY created_at DESC
create index if not exists idx_quotes_created_at_active
  on public.quotes (created_at desc)
  where archived_at is null;

-- Parent jobs work-items UI orders by updated_at
create index if not exists idx_parent_jobs_updated_at
  on public.parent_jobs (updated_at desc);

-- Low-traffic FK covers (advisor: unindexed_foreign_keys)
create index if not exists idx_leave_requests_reviewed_by
  on public.leave_requests (reviewed_by)
  where reviewed_by is not null;

create index if not exists idx_leave_calendar_links_user_id
  on public.leave_calendar_links (user_id);

create index if not exists idx_site_visit_calculations_created_by
  on public.site_visit_calculations (created_by);

notify pgrst, 'reload schema';

-- ─── 036_job_tags.sql ───
-- Oryx Design — migration 036: multi-select job tags
-- Controlled list lives in lib/constants.ts (JOB_TAGS). Independent of type_of_works.

alter table public.jobs
  add column if not exists tags text[] not null default '{}';

alter table public.parent_jobs
  add column if not exists tags text[] not null default '{}';

create index if not exists idx_jobs_tags on public.jobs using gin (tags);
create index if not exists idx_parent_jobs_tags on public.parent_jobs using gin (tags);

comment on column public.jobs.tags is
  'Multi-select scaffold/site labels from the controlled JOB_TAGS list (e.g. Temporary Roof, Network Rail).';

comment on column public.parent_jobs.tags is
  'Multi-select scaffold/site labels from the controlled JOB_TAGS list.';

notify pgrst, 'reload schema';

-- ─── 037_job_documents.sql ───
-- Oryx Design — migration 037: job documents + private Storage bucket
-- Metadata for every file attached to a job/revision family.
-- Files live in the private `job-files` bucket (service-role only).

-- ── Storage bucket ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-files',
  'job-files',
  false,
  52428800,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream',
    'application/acad',
    'application/x-acad',
    'application/dxf',
    'image/vnd.dwg',
    'image/vnd.dxf',
    'message/rfc822',
    'application/vnd.ms-outlook',
    'text/plain'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── Metadata table ────────────────────────────────────────────────────────────
create table if not exists public.job_documents (
  id                  text primary key,
  root_job_id         text not null,
  job_id              text references public.jobs (id) on delete cascade,
  parent_job_id       text references public.parent_jobs (id) on delete cascade,
  work_item_id        text references public.work_items (id) on delete set null,
  revision_letter     text,
  filename            text not null,
  original_filename   text not null,
  mime_type           text not null,
  file_ext            text not null default '',
  file_size           bigint not null default 0,
  category            text not null default 'General',
  description         text,
  storage_path        text not null,
  uploaded_by         text not null,
  uploaded_by_name    text not null,
  email_subject       text,
  email_from          text,
  email_to            text,
  email_cc            text,
  email_date          timestamptz,
  email_preview       text,
  parse_status        text not null default 'none'
                      check (parse_status in ('none', 'ok', 'failed')),
  version_group_id    text,
  approval_status     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  constraint job_documents_storage_path_unique unique (storage_path),
  constraint job_documents_has_anchor check (
    job_id is not null or parent_job_id is not null
  )
);

create index if not exists idx_job_documents_root
  on public.job_documents (root_job_id, deleted_at, created_at desc);
create index if not exists idx_job_documents_job
  on public.job_documents (job_id) where deleted_at is null;
create index if not exists idx_job_documents_parent
  on public.job_documents (parent_job_id) where deleted_at is null;
create index if not exists idx_job_documents_work_item
  on public.job_documents (work_item_id) where deleted_at is null;
create index if not exists idx_job_documents_category
  on public.job_documents (category) where deleted_at is null;
create index if not exists idx_job_documents_filename
  on public.job_documents (lower(filename));
create index if not exists idx_job_documents_email_subject
  on public.job_documents (lower(email_subject)) where email_subject is not null;

drop trigger if exists job_documents_updated_at on public.job_documents;
create trigger job_documents_updated_at
  before update on public.job_documents
  for each row execute function public.set_updated_at();

alter table public.job_documents enable row level security;

drop policy if exists "Service role full access on job_documents" on public.job_documents;
create policy "Service role full access on job_documents"
  on public.job_documents for all to service_role
  using (true) with check (true);

comment on table public.job_documents is
  'Files attached to a job/revision family. Bytes live in the private job-files Storage bucket.';

notify pgrst, 'reload schema';

-- ─── 038_user_module_access.sql ───
-- Per-user module visibility controls (admin-managed toggles).
alter table public.app_users
  add column if not exists module_access_json jsonb;

notify pgrst, 'reload schema';

-- ─── 039_job_design_standards.sql ───
-- 039: Structured design standards field for CAT II check sheets.
alter table public.jobs
  add column if not exists design_standards text;

-- ─── 040_dashboard_active_jobs_statuses.sql ───
-- 040: Active jobs KPI — only New Request / In Progress / Requires Checking.
-- Completed (ISSUED) and Ready to Send must not inflate totalActiveJobs.
-- Uses current-revision display status (latest revision overlays the original).

create or replace function public.job_dashboard_counts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with active as (
    select id, status, item_type, designer, parent_job_id, revision_letter, required_by_date
    from jobs
    where archived_at is null
  ),
  by_status as (
    select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', c) order by status), '[]'::jsonb) as v
    from (select status, count(*)::int as c from active group by status) s
  ),
  by_type as (
    select coalesce(jsonb_agg(jsonb_build_object('itemType', item_type, 'count', c) order by item_type), '[]'::jsonb) as v
    from (select item_type, count(*)::int as c from active group by item_type) t
  ),
  originals as (
    select id, status from active where parent_job_id is null
  ),
  latest_rev as (
    select distinct on (parent_job_id)
      parent_job_id,
      status
    from active
    where parent_job_id is not null
    order by parent_job_id, revision_letter desc nulls last
  ),
  effective_original as (
    select o.id, coalesce(lr.status, o.status) as status
    from originals o
    left join latest_rev lr on lr.parent_job_id = o.id
  ),
  meta as (
    select
      count(*) filter (where coalesce(designer, '') = '')::int as unassigned,
      (
        select count(*)::int
        from effective_original
        where status in ('NEW_REQUEST', 'IN_DESIGN', 'CHECKING')
      ) as total_active_jobs,
      count(*) filter (where parent_job_id is not null)::int as total_revisions,
      -- Deadline tallies exclude ISSUED; dueThisWeek is today..today+7 inclusive.
      count(*) filter (
        where status <> 'ISSUED'
          and required_by_date is not null
          and required_by_date::date < (timezone('utc', now()))::date
      )::int as overdue_count,
      count(*) filter (
        where status <> 'ISSUED'
          and required_by_date is not null
          and required_by_date::date = (timezone('utc', now()))::date
      )::int as due_today_count,
      count(*) filter (
        where status <> 'ISSUED'
          and required_by_date is not null
          and required_by_date::date >= (timezone('utc', now()))::date
          and required_by_date::date <= ((timezone('utc', now()))::date + 7)
      )::int as due_this_week_count
    from active
  )
  select jsonb_build_object(
    'byStatus', (select v from by_status),
    'byItemType', (select v from by_type),
    'unassigned', (select unassigned from meta),
    'totalActiveJobs', (select total_active_jobs from meta),
    'totalRevisions', (select total_revisions from meta),
    'overdueCount', (select overdue_count from meta),
    'dueTodayCount', (select due_today_count from meta),
    'dueThisWeekCount', (select due_this_week_count from meta)
  );
$$;

revoke all on function public.job_dashboard_counts() from public, anon, authenticated;
grant execute on function public.job_dashboard_counts() to service_role;

-- ─── 041_dashboard_active_jobs_new_in_progress.sql ───
-- 041: Active jobs KPI — only New Request / In Progress.
-- Requires Checking has its own card; Ready to Send and Complete must not
-- inflate totalActiveJobs. Uses current-revision display status.

create or replace function public.job_dashboard_counts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with active as (
    select id, status, item_type, designer, parent_job_id, revision_letter, required_by_date
    from jobs
    where archived_at is null
  ),
  by_status as (
    select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', c) order by status), '[]'::jsonb) as v
    from (select status, count(*)::int as c from active group by status) s
  ),
  by_type as (
    select coalesce(jsonb_agg(jsonb_build_object('itemType', item_type, 'count', c) order by item_type), '[]'::jsonb) as v
    from (select item_type, count(*)::int as c from active group by item_type) t
  ),
  originals as (
    select id, status from active where parent_job_id is null
  ),
  latest_rev as (
    select distinct on (parent_job_id)
      parent_job_id,
      status
    from active
    where parent_job_id is not null
    order by parent_job_id, revision_letter desc nulls last
  ),
  effective_original as (
    select o.id, coalesce(lr.status, o.status) as status
    from originals o
    left join latest_rev lr on lr.parent_job_id = o.id
  ),
  meta as (
    select
      count(*) filter (where coalesce(designer, '') = '')::int as unassigned,
      (
        select count(*)::int
        from effective_original
        where status in ('NEW_REQUEST', 'IN_DESIGN')
      ) as total_active_jobs,
      count(*) filter (where parent_job_id is not null)::int as total_revisions,
      -- Deadline tallies exclude ISSUED; dueThisWeek is today..today+7 inclusive.
      count(*) filter (
        where status <> 'ISSUED'
          and required_by_date is not null
          and required_by_date::date < (timezone('utc', now()))::date
      )::int as overdue_count,
      count(*) filter (
        where status <> 'ISSUED'
          and required_by_date is not null
          and required_by_date::date = (timezone('utc', now()))::date
      )::int as due_today_count,
      count(*) filter (
        where status <> 'ISSUED'
          and required_by_date is not null
          and required_by_date::date >= (timezone('utc', now()))::date
          and required_by_date::date <= ((timezone('utc', now()))::date + 7)
      )::int as due_this_week_count
    from active
  )
  select jsonb_build_object(
    'byStatus', (select v from by_status),
    'byItemType', (select v from by_type),
    'unassigned', (select unassigned from meta),
    'totalActiveJobs', (select total_active_jobs from meta),
    'totalRevisions', (select total_revisions from meta),
    'overdueCount', (select overdue_count from meta),
    'dueTodayCount', (select due_today_count from meta),
    'dueThisWeekCount', (select due_this_week_count from meta)
  );
$$;

revoke all on function public.job_dashboard_counts() from public, anon, authenticated;
grant execute on function public.job_dashboard_counts() to service_role;

-- ─── 042_dashboard_active_revisions.sql ───
-- 042: Dashboard revision KPI — only revisions still in flight.
-- Excludes Ready to Send (sent) and Complete (ISSUED).

create or replace function public.job_dashboard_counts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with active as (
    select id, status, item_type, designer, parent_job_id, revision_letter, required_by_date
    from jobs
    where archived_at is null
  ),
  by_status as (
    select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', c) order by status), '[]'::jsonb) as v
    from (select status, count(*)::int as c from active group by status) s
  ),
  by_type as (
    select coalesce(jsonb_agg(jsonb_build_object('itemType', item_type, 'count', c) order by item_type), '[]'::jsonb) as v
    from (select item_type, count(*)::int as c from active group by item_type) t
  ),
  originals as (
    select id, status from active where parent_job_id is null
  ),
  latest_rev as (
    select distinct on (parent_job_id)
      parent_job_id,
      status
    from active
    where parent_job_id is not null
    order by parent_job_id, revision_letter desc nulls last
  ),
  effective_original as (
    select o.id, coalesce(lr.status, o.status) as status
    from originals o
    left join latest_rev lr on lr.parent_job_id = o.id
  ),
  meta as (
    select
      count(*) filter (where coalesce(designer, '') = '')::int as unassigned,
      (
        select count(*)::int
        from effective_original
        where status in ('NEW_REQUEST', 'IN_DESIGN')
      ) as total_active_jobs,
      count(*) filter (
        where parent_job_id is not null
          and status in ('NEW_REQUEST', 'IN_DESIGN', 'CHECKING')
      )::int as active_revisions,
      -- Deadline tallies exclude ISSUED; dueThisWeek is today..today+7 inclusive.
      count(*) filter (
        where status <> 'ISSUED'
          and required_by_date is not null
          and required_by_date::date < (timezone('utc', now()))::date
      )::int as overdue_count,
      count(*) filter (
        where status <> 'ISSUED'
          and required_by_date is not null
          and required_by_date::date = (timezone('utc', now()))::date
      )::int as due_today_count,
      count(*) filter (
        where status <> 'ISSUED'
          and required_by_date is not null
          and required_by_date::date >= (timezone('utc', now()))::date
          and required_by_date::date <= ((timezone('utc', now()))::date + 7)
      )::int as due_this_week_count
    from active
  )
  select jsonb_build_object(
    'byStatus', (select v from by_status),
    'byItemType', (select v from by_type),
    'unassigned', (select unassigned from meta),
    'totalActiveJobs', (select total_active_jobs from meta),
    'activeRevisions', (select active_revisions from meta),
    'overdueCount', (select overdue_count from meta),
    'dueTodayCount', (select due_today_count from meta),
    'dueThisWeekCount', (select due_this_week_count from meta)
  );
$$;

revoke all on function public.job_dashboard_counts() from public, anon, authenticated;
grant execute on function public.job_dashboard_counts() to service_role;

-- ─── 043_fix_convert_quote_parent_job_id.sql ───
-- 043: Redeploy convert_quote_to_job without writing jobs.id into quotes.parent_job_id.
--
-- Migration 033 originally set quotes.parent_job_id = the new jobs.id. That column
-- FKs to parent_jobs(id) (migration 030), so legacy convert failed with a foreign-key
-- violation → HTTP 500 when creating a job from an accepted quote.
--
-- The SQL in 033 was corrected in-repo, but already-applied databases keep the broken
-- function until CREATE OR REPLACE runs again. This migration redeploys the fixed body.

create or replace function public.convert_quote_to_job(
  p_quote_id text,
  p_job jsonb,
  p_history_id text,
  p_changed_by text default 'System'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quotes%rowtype;
  v_job_id text;
  v_updated integer;
begin
  if p_quote_id is null or length(trim(p_quote_id)) = 0 then
    raise exception 'convert_quote_to_job: quote id required';
  end if;
  if p_job is null or p_job->>'id' is null then
    raise exception 'convert_quote_to_job: job payload required';
  end if;

  v_job_id := p_job->>'id';

  select * into v_quote
  from public.quotes
  where id = p_quote_id
  for update;

  if not found then
    raise exception 'convert_quote_to_job: quote not found';
  end if;

  if v_quote.status is distinct from 'ACCEPTED' then
    raise exception 'convert_quote_to_job: quote is not ACCEPTED';
  end if;

  if v_quote.job_id is not null then
    raise exception 'convert_quote_to_job: quote already converted';
  end if;

  insert into public.jobs (
    id, drawing_number, item_type, address, type_of_works, custom_type_description,
    legacy_type_of_works, client_company, client_id, requested_by, status, designer,
    date_created, date_completed, notes, quote_value, quote_reference, quote_date,
    commercial_notes, variation_fees, additional_charges, invoice_id, billing_status,
    billing_batch_id, requested_date, required_by_date, parent_job_id, revision_letter,
    billable, archived_at, archived_by, latitude, longitude, geocoded_at, geocoded_address,
    site_name, site_address, location_status, location_source, list_sort_key,
    created_at, updated_at
  )
  values (
    v_job_id,
    coalesce(p_job->>'drawing_number', 'TBC'),
    coalesce(p_job->>'item_type', 'DESIGN'),
    coalesce(p_job->>'address', 'Address TBC'),
    coalesce(p_job->>'type_of_works', 'Other'),
    nullif(p_job->>'custom_type_description', ''),
    nullif(p_job->>'legacy_type_of_works', ''),
    coalesce(p_job->>'client_company', ''),
    nullif(p_job->>'client_id', ''),
    coalesce(p_job->>'requested_by', ''),
    coalesce(p_job->>'status', 'NEW_REQUEST'),
    coalesce(p_job->>'designer', ''),
    coalesce((p_job->>'date_created')::timestamptz, now()),
    nullif(p_job->>'date_completed', '')::date,
    nullif(p_job->>'notes', ''),
    nullif(p_job->>'quote_value', '')::numeric,
    nullif(p_job->>'quote_reference', ''),
    nullif(p_job->>'quote_date', '')::date,
    nullif(p_job->>'commercial_notes', ''),
    nullif(p_job->>'variation_fees', '')::numeric,
    nullif(p_job->>'additional_charges', '')::numeric,
    nullif(p_job->>'invoice_id', ''),
    nullif(p_job->>'billing_status', ''),
    nullif(p_job->>'billing_batch_id', ''),
    nullif(p_job->>'requested_date', '')::date,
    nullif(p_job->>'required_by_date', '')::date,
    nullif(p_job->>'parent_job_id', ''),
    nullif(p_job->>'revision_letter', ''),
    coalesce((p_job->>'billable')::boolean, true),
    null,
    null,
    null,
    null,
    null,
    null,
    nullif(p_job->>'site_name', ''),
    nullif(p_job->>'site_address', ''),
    null,
    null,
    nullif(p_job->>'list_sort_key', ''),
    coalesce((p_job->>'created_at')::timestamptz, now()),
    coalesce((p_job->>'updated_at')::timestamptz, now())
  );

  insert into public.status_history (
    id, job_id, from_status, to_status, changed_by, changed_at, note
  )
  values (
    coalesce(nullif(p_history_id, ''), gen_random_uuid()::text),
    v_job_id,
    null,
    coalesce(p_job->>'status', 'NEW_REQUEST'),
    coalesce(nullif(p_changed_by, ''), 'System'),
    coalesce((p_job->>'created_at')::timestamptz, now()),
    null
  );

  update public.quotes
  set
    job_id = v_job_id,
    updated_at = now()
  where id = p_quote_id
    and job_id is null
    and status = 'ACCEPTED';

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'convert_quote_to_job: failed to link quote (already converted or status changed)';
  end if;

  -- Do not set quotes.parent_job_id here: that column references parent_jobs(id)
  -- (migration 030), not jobs(id). Legacy convert only links via quotes.job_id.
  -- Work-items convert sets parent_job_id in the app layer when a parent_jobs row exists.

  return jsonb_build_object(
    'job_id', v_job_id,
    'quote_id', p_quote_id,
    'drawing_number', p_job->>'drawing_number'
  );
end;
$$;

revoke all on function public.convert_quote_to_job(text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.convert_quote_to_job(text, jsonb, text, text)
  to service_role;

notify pgrst, 'reload schema';

-- ─── 044_jobs_list_parent_indexes.sql ───
-- =============================================================================
-- Oryx Design — Supabase migration 044: Jobs list parent/scope indexes
-- Additive only — supports Jobs Register parent-only lists, client filters,
-- and revision sidecar lookups. Idempotent: CREATE INDEX IF NOT EXISTS.
-- =============================================================================

-- Default Jobs Register: active parent jobs ordered by list_sort_key
create index if not exists idx_jobs_parents_list_sort_active
  on public.jobs (list_sort_key, created_at)
  where archived_at is null
    and parent_job_id is null;

-- Client filter on parent Jobs Register
create index if not exists idx_jobs_parents_client_list_sort
  on public.jobs (client_id, list_sort_key, created_at)
  where archived_at is null
    and parent_job_id is null
    and client_id is not null;

-- Revision sidecar fetch ordered by letter within a parent
create index if not exists idx_jobs_parent_revision_letter
  on public.jobs (parent_job_id, revision_letter)
  where parent_job_id is not null;

notify pgrst, 'reload schema';

-- ─── 045_job_stats_for_clients.sql ───
-- 045: Aggregate job stats per client for Hold List + client directory meta.
-- Avoids PostgREST default ~1000-row truncation on unbounded .select().in(...).
--
-- Semantics match the previous TypeScript aggregation:
--   active_job_count  = count of jobs where status <> 'ISSUED' (no archived_at filter)
--   quote_value_total = sum of quote_value where quote_value is not null and > 0
-- Includes originals and revisions; groups only the requested client_ids.

create or replace function public.job_stats_for_clients(p_client_ids text[])
returns table (
  client_id text,
  active_job_count integer,
  quote_value_total double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    j.client_id,
    count(*) filter (where j.status is distinct from 'ISSUED')::integer as active_job_count,
    coalesce(
      sum(j.quote_value) filter (
        where j.quote_value is not null and j.quote_value > 0
      ),
      0
    )::float8 as quote_value_total
  from public.jobs j
  where j.client_id = any (p_client_ids)
    and j.client_id is not null
  group by j.client_id;
$$;

revoke all on function public.job_stats_for_clients(text[]) from public, anon, authenticated;
grant execute on function public.job_stats_for_clients(text[]) to service_role;

-- ─── 046_jobs_list_scoped_page.sql ───
-- =============================================================================
-- Oryx Design — migration 046: Jobs Register scoped page (current-work in SQL)
-- =============================================================================
-- Replaces the application-layer path that loaded up to 5,000 slim originals,
-- enriched current-work in Node, then sliced a page.
--
-- Semantics (must match modules/jobs/lib/jobs-list-overlay.ts + current-work.ts):
--   * Candidates = non-archived originals (parent_job_id IS NULL, archived_at IS NULL)
--   * Current work = latest non-ISSUED revision by letter rank then updated_at;
--     else active original; else none
--   * Status / unassigned / deadline filters use current display fields
--   * Scope counts tallied after those filters, before scope tab filter
--   * Search / client / item_type / type_of_works apply to the original row
--   * Revisions are NOT filtered by archived_at (matches sidecar fetch)
--   * due_this_week uses caller-supplied Mon–Sun anchors (JS calendar week)
--
-- SECURITY DEFINER: service_role only (same model as job_stats_for_clients).
-- search_path locked to public.
-- =============================================================================

create or replace function public.jobs_revision_letter_rank(p_letter text)
returns integer
language sql
immutable
parallel safe
as $$
  select case upper(coalesce(nullif(trim(p_letter), ''), ''))
    when 'A' then 0  when 'B' then 1  when 'C' then 2  when 'D' then 3
    when 'E' then 4  when 'F' then 5  when 'G' then 6  when 'H' then 7
    when 'I' then 8  when 'J' then 9  when 'K' then 10 when 'L' then 11
    when 'M' then 12 when 'N' then 13 when 'O' then 14 when 'P' then 15
    when 'Q' then 16 when 'R' then 17 when 'S' then 18 when 'T' then 19
    when 'U' then 20 when 'V' then 21 when 'W' then 22 when 'X' then 23
    when 'Y' then 24 when 'Z' then 25
    else -1
  end;
$$;

comment on function public.jobs_revision_letter_rank(text) is
  'Rank for ORYX revision letters A–Z; unknown/null => -1. Matches compareRevisionLetters.';

create or replace function public.jobs_list_scoped_page(
  p_scope text default 'all',
  p_page integer default 1,
  p_page_size integer default 25,
  p_search text default null,
  p_search_tags text[] default null,
  p_status text default null,
  p_client_id text default null,
  p_item_type text default null,
  p_type_of_works text default null,
  p_unassigned boolean default false,
  p_overdue boolean default false,
  p_due_today boolean default false,
  p_due_this_week boolean default false,
  p_sort_dir text default 'asc',
  p_include_counts boolean default true,
  p_today date default null,
  p_week_start date default null,
  p_week_end date default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      case
        when lower(coalesce(nullif(trim(p_scope), ''), 'all'))
          in ('all', 'active', 'revisions', 'completed')
        then lower(coalesce(nullif(trim(p_scope), ''), 'all'))
        else 'all'
      end as scope,
      greatest(coalesce(p_page, 1), 1) as page,
      least(greatest(coalesce(p_page_size, 25), 1), 5000) as page_size,
      lower(coalesce(p_sort_dir, 'asc')) <> 'desc' as sort_asc,
      nullif(trim(coalesce(p_search, '')), '') as search,
      coalesce(p_today, (timezone('utc', now()))::date) as today,
      coalesce(p_week_start, coalesce(p_today, (timezone('utc', now()))::date)) as week_start,
      coalesce(p_week_end, coalesce(p_today, (timezone('utc', now()))::date)) as week_end,
      coalesce(p_unassigned, false) as unassigned,
      coalesce(p_overdue, false) as overdue,
      coalesce(p_due_today, false) as due_today,
      coalesce(p_due_this_week, false) as due_this_week,
      coalesce(p_include_counts, true) as include_counts,
      nullif(trim(coalesce(p_status, '')), '') as status,
      nullif(trim(coalesce(p_client_id, '')), '') as client_id,
      nullif(trim(coalesce(p_item_type, '')), '') as item_type,
      nullif(trim(coalesce(p_type_of_works, '')), '') as type_of_works
  ),
  originals as (
    select
      j.id,
      j.status,
      j.designer,
      j.required_by_date,
      j.list_sort_key,
      j.created_at
    from public.jobs j
    cross join params p
    where j.parent_job_id is null
      and j.archived_at is null
      and (p.client_id is null or j.client_id = p.client_id)
      and (p.item_type is null or j.item_type = p.item_type)
      and (p.type_of_works is null or j.type_of_works = p.type_of_works)
      and (
        p.search is null
        or strpos(lower(coalesce(j.drawing_number, '')), lower(p.search)) > 0
        or strpos(lower(coalesce(j.address, '')), lower(p.search)) > 0
        or strpos(lower(coalesce(j.client_company, '')), lower(p.search)) > 0
        or strpos(lower(coalesce(j.requested_by, '')), lower(p.search)) > 0
        or strpos(lower(coalesce(j.type_of_works, '')), lower(p.search)) > 0
        or strpos(lower(coalesce(j.custom_type_description, '')), lower(p.search)) > 0
        or strpos(lower(coalesce(j.designer, '')), lower(p.search)) > 0
        or strpos(lower(coalesce(j.quote_reference, '')), lower(p.search)) > 0
        or (
          p_search_tags is not null
          and cardinality(p_search_tags) > 0
          and j.tags is not null
          and j.tags && p_search_tags
        )
      )
  ),
  -- Latest active revision per parent. No archived_at filter (Node sidecar parity).
  latest_active_rev as (
    select distinct on (r.parent_job_id)
      r.parent_job_id,
      r.id as rev_id,
      r.status as rev_status,
      r.designer as rev_designer,
      r.required_by_date as rev_required_by_date
    from public.jobs r
    where r.parent_job_id is not null
      and r.status is distinct from 'ISSUED'
      and r.parent_job_id in (select id from originals)
    order by
      r.parent_job_id,
      public.jobs_revision_letter_rank(r.revision_letter) desc,
      r.updated_at desc nulls last
  ),
  current_work as (
    select
      o.id,
      o.list_sort_key,
      o.created_at,
      case
        when lar.rev_id is not null then 'revision'
        when o.status is distinct from 'ISSUED' then 'original'
        else 'none'
      end as work_type,
      case
        when lar.rev_id is not null then coalesce(lar.rev_status, o.status)
        else o.status
      end as current_status,
      case
        when lar.rev_id is not null then coalesce(lar.rev_designer, o.designer)
        else o.designer
      end as current_designer,
      case
        when lar.rev_id is not null then coalesce(lar.rev_required_by_date, o.required_by_date)
        else o.required_by_date
      end as current_required_by_date
    from originals o
    left join latest_active_rev lar on lar.parent_job_id = o.id
  ),
  filtered as (
    select c.*
    from current_work c
    cross join params p
    where
      (p.status is null or c.current_status = p.status)
      and (not p.unassigned or trim(coalesce(c.current_designer, '')) = '')
      and (
        not p.overdue
        or (
          c.current_status is distinct from 'ISSUED'
          and c.current_required_by_date is not null
          and c.current_required_by_date < p.today
        )
      )
      and (
        not p.due_today
        or (
          c.current_status is distinct from 'ISSUED'
          and c.current_required_by_date = p.today
        )
      )
      and (
        not p.due_this_week
        or (
          c.current_status is distinct from 'ISSUED'
          and c.current_required_by_date is not null
          and c.current_required_by_date >= p.week_start
          and c.current_required_by_date <= p.week_end
        )
      )
  ),
  counted as (
    select
      count(*)::integer as total_all,
      count(*) filter (where work_type is distinct from 'none')::integer as total_active,
      count(*) filter (where work_type = 'revision')::integer as total_revisions,
      count(*) filter (where work_type = 'none')::integer as total_completed
    from filtered
  ),
  scoped as (
    select f.*
    from filtered f
    cross join params p
    where
      p.scope = 'all'
      or (p.scope = 'active' and f.work_type is distinct from 'none')
      or (p.scope = 'revisions' and f.work_type = 'revision')
      or (p.scope = 'completed' and f.work_type = 'none')
  ),
  ordered as (
    select
      s.id,
      row_number() over (
        order by
          case when (select sort_asc from params) then s.list_sort_key end asc nulls last,
          case when not (select sort_asc from params) then s.list_sort_key end desc nulls last,
          case when (select sort_asc from params) then s.created_at end asc nulls last,
          case when not (select sort_asc from params) then s.created_at end desc nulls last,
          s.id
      ) as rn,
      count(*) over ()::integer as scoped_total
    from scoped s
  )
  select jsonb_build_object(
    'ids', coalesce(
      (
        select jsonb_agg(o.id order by o.rn)
        from ordered o
        cross join params p
        where o.rn > (p.page - 1) * p.page_size
          and o.rn <= p.page * p.page_size
      ),
      '[]'::jsonb
    ),
    'total', coalesce((select scoped_total from ordered limit 1), 0),
    'scope_counts', case
      when (select include_counts from params) then
        jsonb_build_object(
          'all', (select total_all from counted),
          'active', (select total_active from counted),
          'revisions', (select total_revisions from counted),
          'completed', (select total_completed from counted)
        )
      else null
    end
  );
$$;

comment on function public.jobs_list_scoped_page is
  'Paged Jobs Register IDs after current-work scope/status/deadline filters. No app-layer 5k scan.';

revoke all on function public.jobs_revision_letter_rank(text) from public, anon, authenticated;
grant execute on function public.jobs_revision_letter_rank(text) to service_role;

revoke all on function public.jobs_list_scoped_page(
  text, integer, integer, text, text[], text, text, text, text,
  boolean, boolean, boolean, boolean, text, boolean, date, date, date
) from public, anon, authenticated;

grant execute on function public.jobs_list_scoped_page(
  text, integer, integer, text, text[], text, text, text, text,
  boolean, boolean, boolean, boolean, text, boolean, date, date, date
) to service_role;

-- Speeds latest-active-revision DISTINCT ON used by jobs_list_scoped_page.
create index if not exists idx_jobs_revisions_active_current_work
  on public.jobs (parent_job_id, revision_letter, updated_at desc)
  where parent_job_id is not null
    and status is distinct from 'ISSUED';

notify pgrst, 'reload schema';

-- ─── 047_search_pg_trgm_indexes.sql ───
-- =============================================================================
-- Oryx Design — migration 047: pg_trgm GIN indexes for substring search
-- =============================================================================
-- Problem: daily search uses leading+trailing wildcards (ILIKE '%term%' /
-- PostgREST .ilike.%term%). Btree indexes cannot help those predicates.
--
-- Evidence (PGlite / Postgres planner on ~5–8k fixture rows):
--   * strpos(lower(col), lower(term)) > 0  → Seq Scan even with gin_trgm
--   * col ILIKE '%term%'                   → Bitmap Index Scan + BitmapOr
--     when selective and every OR column is covered by gin_trgm_ops
--   * Incomplete OR coverage (some columns unindexed) → Seq Scan
--
-- Therefore:
--   1) Enable pg_trgm
--   2) Add focused GIN trigram indexes on columns actually searched with %term%
--   3) Rewrite jobs_list_scoped_page search from strpos → ILIKE ESCAPE '\'
--      (same case-insensitive substring semantics; %/_/\ treated as literals)
--
-- Index build: plain CREATE INDEX IF NOT EXISTS (not CONCURRENTLY).
-- Supabase migration runners wrap statements in a transaction; CONCURRENTLY
-- is not supported inside a transaction. Current ORYX volumes are modest —
-- a brief SHARE lock during build is acceptable.
--
-- Security: indexes only. RPC grants unchanged (service_role execute).
-- =============================================================================

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Jobs — classic list (postgrestOrIlike) + jobs_list_scoped_page OR search
-- All OR arms must be indexed for BitmapOr; otherwise planner falls back to
-- Seq Scan. Tags already use GIN array overlap (036_job_tags.sql).
-- ---------------------------------------------------------------------------
create index if not exists idx_jobs_drawing_number_trgm
  on public.jobs using gin (drawing_number gin_trgm_ops);

create index if not exists idx_jobs_address_trgm
  on public.jobs using gin (address gin_trgm_ops);

create index if not exists idx_jobs_client_company_trgm
  on public.jobs using gin (client_company gin_trgm_ops);

create index if not exists idx_jobs_requested_by_trgm
  on public.jobs using gin (requested_by gin_trgm_ops);

create index if not exists idx_jobs_type_of_works_trgm
  on public.jobs using gin (type_of_works gin_trgm_ops);

create index if not exists idx_jobs_custom_type_description_trgm
  on public.jobs using gin (custom_type_description gin_trgm_ops);

create index if not exists idx_jobs_designer_trgm
  on public.jobs using gin (designer gin_trgm_ops);

create index if not exists idx_jobs_quote_reference_trgm
  on public.jobs using gin (quote_reference gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Clients — directory OR + typeahead on name_lower
-- ---------------------------------------------------------------------------
create index if not exists idx_clients_name_lower_trgm
  on public.clients using gin (name_lower gin_trgm_ops);

create index if not exists idx_clients_contact_name_trgm
  on public.clients using gin (contact_name gin_trgm_ops);

create index if not exists idx_clients_email_trgm
  on public.clients using gin (email gin_trgm_ops);

create index if not exists idx_clients_phone_trgm
  on public.clients using gin (phone gin_trgm_ops);

create index if not exists idx_clients_account_code_trgm
  on public.clients using gin (account_code gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Quotes — list OR (quote_number, client_company, address, description)
-- ---------------------------------------------------------------------------
create index if not exists idx_quotes_quote_number_trgm
  on public.quotes using gin (quote_number gin_trgm_ops);

create index if not exists idx_quotes_client_company_trgm
  on public.quotes using gin (client_company gin_trgm_ops);

create index if not exists idx_quotes_address_trgm
  on public.quotes using gin (address gin_trgm_ops);

create index if not exists idx_quotes_description_trgm
  on public.quotes using gin (description gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- jobs_list_scoped_page: use ILIKE so gin_trgm_ops can apply.
-- Substring + case-insensitivity unchanged vs prior strpos(lower(..), lower(..)).
-- Escape % _ \ so user input stays literal (parity with strpos / PostgREST escape).
-- Grants preserved exactly.
-- ---------------------------------------------------------------------------
create or replace function public.jobs_list_scoped_page(
  p_scope text default 'all',
  p_page integer default 1,
  p_page_size integer default 25,
  p_search text default null,
  p_search_tags text[] default null,
  p_status text default null,
  p_client_id text default null,
  p_item_type text default null,
  p_type_of_works text default null,
  p_unassigned boolean default false,
  p_overdue boolean default false,
  p_due_today boolean default false,
  p_due_this_week boolean default false,
  p_sort_dir text default 'asc',
  p_include_counts boolean default true,
  p_today date default null,
  p_week_start date default null,
  p_week_end date default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      case
        when lower(coalesce(nullif(trim(p_scope), ''), 'all'))
          in ('all', 'active', 'revisions', 'completed')
        then lower(coalesce(nullif(trim(p_scope), ''), 'all'))
        else 'all'
      end as scope,
      greatest(coalesce(p_page, 1), 1) as page,
      least(greatest(coalesce(p_page_size, 25), 1), 5000) as page_size,
      lower(coalesce(p_sort_dir, 'asc')) <> 'desc' as sort_asc,
      nullif(trim(coalesce(p_search, '')), '') as search,
      case
        when nullif(trim(coalesce(p_search, '')), '') is null then null
        else
          '%'
          || replace(
               replace(
                 replace(trim(p_search), E'\\', E'\\\\'),
                 '%', E'\\%'
               ),
               '_', E'\\_'
             )
          || '%'
      end as search_pat,
      coalesce(p_today, (timezone('utc', now()))::date) as today,
      coalesce(p_week_start, coalesce(p_today, (timezone('utc', now()))::date)) as week_start,
      coalesce(p_week_end, coalesce(p_today, (timezone('utc', now()))::date)) as week_end,
      coalesce(p_unassigned, false) as unassigned,
      coalesce(p_overdue, false) as overdue,
      coalesce(p_due_today, false) as due_today,
      coalesce(p_due_this_week, false) as due_this_week,
      coalesce(p_include_counts, true) as include_counts,
      nullif(trim(coalesce(p_status, '')), '') as status,
      nullif(trim(coalesce(p_client_id, '')), '') as client_id,
      nullif(trim(coalesce(p_item_type, '')), '') as item_type,
      nullif(trim(coalesce(p_type_of_works, '')), '') as type_of_works
  ),
  originals as (
    select
      j.id,
      j.status,
      j.designer,
      j.required_by_date,
      j.list_sort_key,
      j.created_at
    from public.jobs j
    cross join params p
    where j.parent_job_id is null
      and j.archived_at is null
      and (p.client_id is null or j.client_id = p.client_id)
      and (p.item_type is null or j.item_type = p.item_type)
      and (p.type_of_works is null or j.type_of_works = p.type_of_works)
      and (
        p.search_pat is null
        or coalesce(j.drawing_number, '')          ilike p.search_pat escape E'\\'
        or coalesce(j.address, '')                 ilike p.search_pat escape E'\\'
        or coalesce(j.client_company, '')          ilike p.search_pat escape E'\\'
        or coalesce(j.requested_by, '')            ilike p.search_pat escape E'\\'
        or coalesce(j.type_of_works, '')           ilike p.search_pat escape E'\\'
        or coalesce(j.custom_type_description, '') ilike p.search_pat escape E'\\'
        or coalesce(j.designer, '')                ilike p.search_pat escape E'\\'
        or coalesce(j.quote_reference, '')         ilike p.search_pat escape E'\\'
        or (
          p_search_tags is not null
          and cardinality(p_search_tags) > 0
          and j.tags is not null
          and j.tags && p_search_tags
        )
      )
  ),
  -- Latest active revision per parent. No archived_at filter (Node sidecar parity).
  latest_active_rev as (
    select distinct on (r.parent_job_id)
      r.parent_job_id,
      r.id as rev_id,
      r.status as rev_status,
      r.designer as rev_designer,
      r.required_by_date as rev_required_by_date
    from public.jobs r
    where r.parent_job_id is not null
      and r.status is distinct from 'ISSUED'
      and r.parent_job_id in (select id from originals)
    order by
      r.parent_job_id,
      public.jobs_revision_letter_rank(r.revision_letter) desc,
      r.updated_at desc nulls last
  ),
  current_work as (
    select
      o.id,
      o.list_sort_key,
      o.created_at,
      case
        when lar.rev_id is not null then 'revision'
        when o.status is distinct from 'ISSUED' then 'original'
        else 'none'
      end as work_type,
      case
        when lar.rev_id is not null then coalesce(lar.rev_status, o.status)
        else o.status
      end as current_status,
      case
        when lar.rev_id is not null then coalesce(lar.rev_designer, o.designer)
        else o.designer
      end as current_designer,
      case
        when lar.rev_id is not null then coalesce(lar.rev_required_by_date, o.required_by_date)
        else o.required_by_date
      end as current_required_by_date
    from originals o
    left join latest_active_rev lar on lar.parent_job_id = o.id
  ),
  filtered as (
    select c.*
    from current_work c
    cross join params p
    where
      (p.status is null or c.current_status = p.status)
      and (not p.unassigned or trim(coalesce(c.current_designer, '')) = '')
      and (
        not p.overdue
        or (
          c.current_status is distinct from 'ISSUED'
          and c.current_required_by_date is not null
          and c.current_required_by_date < p.today
        )
      )
      and (
        not p.due_today
        or (
          c.current_status is distinct from 'ISSUED'
          and c.current_required_by_date = p.today
        )
      )
      and (
        not p.due_this_week
        or (
          c.current_status is distinct from 'ISSUED'
          and c.current_required_by_date is not null
          and c.current_required_by_date >= p.week_start
          and c.current_required_by_date <= p.week_end
        )
      )
  ),
  counted as (
    select
      count(*)::integer as total_all,
      count(*) filter (where work_type is distinct from 'none')::integer as total_active,
      count(*) filter (where work_type = 'revision')::integer as total_revisions,
      count(*) filter (where work_type = 'none')::integer as total_completed
    from filtered
  ),
  scoped as (
    select f.*
    from filtered f
    cross join params p
    where
      p.scope = 'all'
      or (p.scope = 'active' and f.work_type is distinct from 'none')
      or (p.scope = 'revisions' and f.work_type = 'revision')
      or (p.scope = 'completed' and f.work_type = 'none')
  ),
  ordered as (
    select
      s.id,
      row_number() over (
        order by
          case when (select sort_asc from params) then s.list_sort_key end asc nulls last,
          case when not (select sort_asc from params) then s.list_sort_key end desc nulls last,
          case when (select sort_asc from params) then s.created_at end asc nulls last,
          case when not (select sort_asc from params) then s.created_at end desc nulls last,
          s.id
      ) as rn,
      count(*) over ()::integer as scoped_total
    from scoped s
  )
  select jsonb_build_object(
    'ids', coalesce(
      (
        select jsonb_agg(o.id order by o.rn)
        from ordered o
        cross join params p
        where o.rn > (p.page - 1) * p.page_size
          and o.rn <= p.page * p.page_size
      ),
      '[]'::jsonb
    ),
    'total', coalesce((select scoped_total from ordered limit 1), 0),
    'scope_counts', case
      when (select include_counts from params) then
        jsonb_build_object(
          'all', (select total_all from counted),
          'active', (select total_active from counted),
          'revisions', (select total_revisions from counted),
          'completed', (select total_completed from counted)
        )
      else null
    end
  );
$$;

comment on function public.jobs_list_scoped_page is
  'Paged Jobs Register IDs after current-work scope/status/deadline filters. Search uses ILIKE for pg_trgm.';

revoke all on function public.jobs_list_scoped_page(
  text, integer, integer, text, text[], text, text, text, text,
  boolean, boolean, boolean, boolean, text, boolean, date, date, date
) from public, anon, authenticated;

grant execute on function public.jobs_list_scoped_page(
  text, integer, integer, text, text[], text, text, text, text,
  boolean, boolean, boolean, boolean, text, boolean, date, date, date
) to service_role;

notify pgrst, 'reload schema';

notify pgrst, 'reload schema';

