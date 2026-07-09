-- =============================================================================
-- ORYX Supabase Setup — Part 2 (run AFTER setup-vercel.sql)
-- Migrations 009, 011–016
-- =============================================================================

-- =============================================================================
-- Oryx Design â€” Supabase migration 009: identity switch audit log
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
-- 011_soft_delete.sql
-- Adds soft-delete (archive) support to jobs, quotes, and clients,
-- plus a unified archive audit log table.
--
-- Idempotent: uses IF NOT EXISTS / DO NOTHING patterns throughout.
-- Safe to run on a database that already has data â€” all new columns
-- default to NULL (active), so every existing row stays visible.

-- â”€â”€ Jobs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS archived_by  TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_archived_at ON jobs(archived_at);

-- â”€â”€ Quotes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS archived_by  TEXT;

CREATE INDEX IF NOT EXISTS idx_quotes_archived_at ON quotes(archived_at);

-- â”€â”€ Clients â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE clients ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS archived_by  TEXT;

CREATE INDEX IF NOT EXISTS idx_clients_archived_at ON clients(archived_at);

-- â”€â”€ Archive audit log â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- Enable Row Level Security (permissive â€” internal app only)
ALTER TABLE archive_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'archive_log' AND policyname = 'archive_log_open'
  ) THEN
    CREATE POLICY archive_log_open ON archive_log FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
-- 012_indexes.sql
-- Performance indexes for common query patterns.
-- Idempotent: all use CREATE INDEX IF NOT EXISTS.
-- Run this in the Supabase SQL editor after 011_soft_delete.sql.

-- â”€â”€ Jobs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Active job list (most common query â€” status + not archived)
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

-- Revision chains (parent â†’ children)
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

-- â”€â”€ Quotes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€ Clients â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Active client list
CREATE INDEX IF NOT EXISTS idx_clients_active
  ON clients(active);

-- Name search
CREATE INDEX IF NOT EXISTS idx_clients_name_lower
  ON clients(name_lower);

-- â”€â”€ Status history â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Job history lookup (already created by 004 but included for safety)
CREATE INDEX IF NOT EXISTS idx_status_history_job_id
  ON status_history(job_id);

-- Recency sort on history
CREATE INDEX IF NOT EXISTS idx_status_history_changed_at
  ON status_history(changed_at DESC);

-- â”€â”€ Archive log â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- (indexes already created in 011_soft_delete.sql â€” included here for reference only)
-- idx_archive_log_entity    ON archive_log(entity_type, entity_id)
-- idx_archive_log_performed ON archive_log(performed_at DESC)
-- =============================================================================
-- Oryx Design â€” Supabase migration 013: client_holds updated_at
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
-- =============================================================================
-- Oryx Design â€” Supabase migration 014: employee HR profiles
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
-- =============================================================================
-- Oryx Design â€” Supabase migration 015: leave requests + calendar links
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
-- =============================================================================
-- Oryx Design â€” Supabase migration 016: annual leave calendar category
-- Required for leave â†” calendar sync (categoryId cat_annual_leave)
-- =============================================================================

insert into public.event_categories (id, name, color, icon) values
  ('cat_annual_leave', 'Annual Leave', '#15803D', 'calendar-off')
on conflict (id) do nothing;

notify pgrst, 'reload schema';
-- =============================================================================
-- Oryx Design — Supabase migration 017: account password vault
-- Enable with SUPABASE_PASSWORD_VAULT=true after sync script
-- Passwords stored as AES-256-GCM ciphertext (password_enc) — encrypted app-side.
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
-- =============================================================================
-- Oryx Design — Supabase migration 019: job map query indexes
-- =============================================================================

create index if not exists idx_jobs_latitude on public.jobs (latitude)
  where latitude is not null;

create index if not exists idx_jobs_longitude on public.jobs (longitude)
  where longitude is not null;

create index if not exists idx_jobs_map_plotted on public.jobs (status, archived_at, latitude, longitude)
  where status = 'ISSUED'
    and archived_at is null
    and latitude is not null
    and longitude is not null;

create index if not exists idx_jobs_map_missing_coords on public.jobs (status, archived_at)
  where status = 'ISSUED'
    and archived_at is null
    and (latitude is null or longitude is null);

notify pgrst, 'reload schema';
-- =============================================================================
-- Oryx Design — Supabase migration 020: job location management fields
-- =============================================================================

alter table public.jobs add column if not exists site_name text;
alter table public.jobs add column if not exists site_address text;
alter table public.jobs add column if not exists location_status text;
alter table public.jobs add column if not exists location_source text;

update public.jobs
set site_address = address
where (site_address is null or trim(site_address) = '')
  and address is not null
  and trim(address) != '';

update public.jobs
set location_status = 'mapped',
    location_source = 'geocoded'
where latitude is not null
  and longitude is not null
  and location_status is null;

create index if not exists idx_jobs_location_status on public.jobs (location_status)
  where status = 'ISSUED' and archived_at is null;

notify pgrst, 'reload schema';
