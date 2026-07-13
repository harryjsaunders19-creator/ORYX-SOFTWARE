-- Login rate-limit counters (shared across Vercel serverless instances).

create table if not exists public.login_rate_limits (
  rate_key      text primary key,
  attempt_count integer not null default 1,
  reset_at      timestamptz not null
);

create index if not exists idx_login_rate_limits_reset
  on public.login_rate_limits (reset_at);

alter table public.login_rate_limits enable row level security;
drop policy if exists "Service role full access on login_rate_limits" on public.login_rate_limits;
create policy "Service role full access on login_rate_limits"
  on public.login_rate_limits for all to service_role using (true) with check (true);
