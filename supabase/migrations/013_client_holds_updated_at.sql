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
