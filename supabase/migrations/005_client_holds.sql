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
  removed_reason text
);

create index if not exists idx_client_holds_client_id on public.client_holds (client_id);
create index if not exists idx_client_holds_status on public.client_holds (status);

alter table public.client_holds enable row level security;

drop policy if exists "Service role full access on client_holds" on public.client_holds;
create policy "Service role full access on client_holds"
  on public.client_holds
  for all
  to service_role
  using (true)
  with check (true);

notify pgrst, 'reload schema';
