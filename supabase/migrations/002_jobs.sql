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

create policy "Service role full access on jobs"
  on public.jobs
  for all
  to service_role
  using (true)
  with check (true);

-- Refresh PostgREST schema cache so API writes work immediately
notify pgrst, 'reload schema';
