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

