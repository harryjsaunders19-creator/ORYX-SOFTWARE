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
