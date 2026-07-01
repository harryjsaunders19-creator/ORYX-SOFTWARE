-- =============================================================================
-- ORYX Full Supabase Setup — Run this ONCE in Supabase SQL Editor
-- Paste the entire file → click Run. All tables are created safely (IF NOT EXISTS).
-- After this, set these env vars in Vercel → Settings → Environment Variables:
--
--   SUPABASE_USERS=true
--   SUPABASE_CLIENTS=true
--   SUPABASE_JOBS=true
--   SUPABASE_QUOTES=true
--   SUPABASE_STATUS_HISTORY=true
--   SUPABASE_HOLDS=true
--   SUPABASE_BILLING=true
--   SUPABASE_CALENDAR=true
--   SUPABASE_EMPLOYEES=true
--   SUPABASE_LEAVE=true
--   NEXT_PUBLIC_SUPABASE_URL=<your supabase project url>
--   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon key>
--   SUPABASE_SERVICE_ROLE_KEY=<your service role key>
--
-- Then redeploy Vercel. All data will now persist permanently.
--
-- ALSO run supabase/setup-vercel-part2.sql (migrations 009–016: identity log,
-- soft delete, indexes, employees, leave).
-- =============================================================================

-- Shared trigger function for updated_at columns
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- 001: CLIENTS
-- =============================================================================
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
create index if not exists idx_clients_active     on public.clients (active);

drop trigger if exists clients_updated_at on public.clients;
create trigger clients_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

alter table public.clients enable row level security;
drop policy if exists "Service role full access on clients" on public.clients;
create policy "Service role full access on clients"
  on public.clients for all to service_role using (true) with check (true);

-- =============================================================================
-- 002: JOBS
-- =============================================================================
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
  variation_fees          numeric,
  additional_charges      numeric,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint jobs_drawing_number_unique unique (drawing_number)
);

create index if not exists idx_jobs_status           on public.jobs (status);
create index if not exists idx_jobs_client_company   on public.jobs (client_company);
create index if not exists idx_jobs_client_id        on public.jobs (client_id);
create index if not exists idx_jobs_designer         on public.jobs (designer);
create index if not exists idx_jobs_created_at       on public.jobs (created_at);
create index if not exists idx_jobs_date_created     on public.jobs (date_created);
create index if not exists idx_jobs_parent_job_id    on public.jobs (parent_job_id);
create index if not exists idx_jobs_required_by_date on public.jobs (required_by_date);

drop trigger if exists jobs_updated_at on public.jobs;
create trigger jobs_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

alter table public.jobs enable row level security;
drop policy if exists "Service role full access on jobs" on public.jobs;
create policy "Service role full access on jobs"
  on public.jobs for all to service_role using (true) with check (true);

-- =============================================================================
-- 003: QUOTES + QUOTE LINE ITEMS
-- =============================================================================
create table if not exists public.quotes (
  id                      text primary key,
  quote_number            text not null,
  client_id               text references public.clients (id) on delete set null,
  client_company          text not null,
  contact_name            text,
  address                 text not null,
  description             text not null,
  quote_value             numeric not null default 0,
  quote_date              date not null,
  expiry_date             date,
  status                  text not null default 'DRAFT',
  notes                   text,
  job_id                  text references public.jobs (id) on delete set null,
  created_by              text not null default 'System',
  pdf_path                text,
  prepared_by             text,
  vat_rate                numeric,
  type_of_works           text,
  custom_type_description text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint quotes_quote_number_unique unique (quote_number)
);

create index if not exists idx_quotes_client_id  on public.quotes (client_id);
create index if not exists idx_quotes_status     on public.quotes (status);
create index if not exists idx_quotes_quote_date on public.quotes (quote_date);
create index if not exists idx_quotes_job_id     on public.quotes (job_id);

drop trigger if exists quotes_updated_at on public.quotes;
create trigger quotes_updated_at
  before update on public.quotes
  for each row execute function public.set_updated_at();

alter table public.quotes enable row level security;
drop policy if exists "Service role full access on quotes" on public.quotes;
create policy "Service role full access on quotes"
  on public.quotes for all to service_role using (true) with check (true);

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
  on public.quote_line_items for all to service_role using (true) with check (true);

-- =============================================================================
-- 004: STATUS HISTORY
-- =============================================================================
create table if not exists public.status_history (
  id          text primary key,
  job_id      text not null references public.jobs (id) on delete cascade,
  from_status text,
  to_status   text not null,
  changed_by  text not null default 'System',
  changed_at  timestamptz not null default now(),
  note        text
);

create index if not exists idx_status_history_job_id     on public.status_history (job_id);
create index if not exists idx_status_history_changed_at on public.status_history (changed_at);

alter table public.status_history enable row level security;
drop policy if exists "Service role full access on status_history" on public.status_history;
create policy "Service role full access on status_history"
  on public.status_history for all to service_role using (true) with check (true);

-- =============================================================================
-- 005: CLIENT HOLDS
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
create index if not exists idx_client_holds_status    on public.client_holds (status);

drop trigger if exists client_holds_updated_at on public.client_holds;
create trigger client_holds_updated_at
  before update on public.client_holds
  for each row execute function public.set_updated_at();

alter table public.client_holds enable row level security;
drop policy if exists "Service role full access on client_holds" on public.client_holds;
create policy "Service role full access on client_holds"
  on public.client_holds for all to service_role using (true) with check (true);

-- =============================================================================
-- 006: BILLING (HANDOFFS + EXPORT BATCHES)
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
  on public.billing_export_batches for all to service_role using (true) with check (true);

create table if not exists public.billing_handoffs (
  id                        text primary key,
  source_job_id             text not null references public.jobs (id),
  billing_event_type        text not null default 'JOB_COMPLETED',
  drawing_number            text not null,
  item_type                 text not null,
  type_of_works             text,
  custom_type_description   text,
  client_company            text not null,
  address                   text not null,
  designer                  text,
  quote_value               numeric,
  quote_reference           text,
  completion_date           date not null,
  added_to_billing_queue_at timestamptz not null default now(),
  cleared_by_accounts_at    timestamptz,
  cleared_by                text,
  export_batch_id           text references public.billing_export_batches (id),
  notes                     text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists idx_billing_handoffs_source_job on public.billing_handoffs (source_job_id);
create index if not exists idx_billing_handoffs_cleared    on public.billing_handoffs (cleared_by_accounts_at);
create index if not exists idx_billing_handoffs_batch      on public.billing_handoffs (export_batch_id);

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
  on public.billing_handoffs for all to service_role using (true) with check (true);

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
  on public.billing_export_snapshots for all to service_role using (true) with check (true);

-- =============================================================================
-- 007: CALENDAR
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

alter table public.event_categories enable row level security;
drop policy if exists "Service role full access on event_categories" on public.event_categories;
create policy "Service role full access on event_categories"
  on public.event_categories for all to service_role using (true) with check (true);

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

create index if not exists idx_calendar_events_start    on public.calendar_events (start_date);
create index if not exists idx_calendar_events_end      on public.calendar_events (end_date);
create index if not exists idx_calendar_events_category on public.calendar_events (category_id);
create index if not exists idx_calendar_events_job      on public.calendar_events (job_id);
create index if not exists idx_calendar_events_client   on public.calendar_events (client_id);

drop trigger if exists calendar_events_updated_at on public.calendar_events;
create trigger calendar_events_updated_at
  before update on public.calendar_events
  for each row execute function public.set_updated_at();

alter table public.calendar_events enable row level security;
drop policy if exists "Service role full access on calendar_events" on public.calendar_events;
create policy "Service role full access on calendar_events"
  on public.calendar_events for all to service_role using (true) with check (true);

create table if not exists public.calendar_assignments (
  id       text primary key,
  event_id text not null references public.calendar_events (id) on delete cascade,
  user_id  text not null,
  constraint calendar_assignments_event_user_unique unique (event_id, user_id)
);

create index if not exists idx_calendar_assignments_event on public.calendar_assignments (event_id);
create index if not exists idx_calendar_assignments_user  on public.calendar_assignments (user_id);

alter table public.calendar_assignments enable row level security;
drop policy if exists "Service role full access on calendar_assignments" on public.calendar_assignments;
create policy "Service role full access on calendar_assignments"
  on public.calendar_assignments for all to service_role using (true) with check (true);

-- =============================================================================
-- 008: APP USERS (login accounts)
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

create index if not exists idx_app_users_role   on public.app_users (role);
create index if not exists idx_app_users_active on public.app_users (active);

drop trigger if exists app_users_updated_at on public.app_users;
create trigger app_users_updated_at
  before update on public.app_users
  for each row execute function public.set_updated_at();

alter table public.app_users enable row level security;
drop policy if exists "Service role full access on app_users" on public.app_users;
create policy "Service role full access on app_users"
  on public.app_users for all to service_role using (true) with check (true);

notify pgrst, 'reload schema';

-- =============================================================================
-- Backup jobs + audit log (SUPABASE_BACKUPS=true)
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
