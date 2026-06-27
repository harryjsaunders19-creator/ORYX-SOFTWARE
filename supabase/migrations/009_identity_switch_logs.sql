-- =============================================================================
-- Oryx Design — Supabase migration 009: identity switch audit log
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

create policy "Service role full access on identity_switch_logs"
  on public.identity_switch_logs for all to service_role
  using (true) with check (true);

notify pgrst, 'reload schema';
