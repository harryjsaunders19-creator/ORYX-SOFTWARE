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
