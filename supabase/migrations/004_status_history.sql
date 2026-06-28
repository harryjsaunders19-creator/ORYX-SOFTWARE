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
