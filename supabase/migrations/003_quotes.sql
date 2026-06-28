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
