-- =============================================================================
-- Oryx Design — Supabase migration 008: app users (custom bcrypt auth)
-- NOT Supabase Auth — password_hash mirrors SQLite for login verification.
-- Enable with SUPABASE_USERS=true after sync script
-- =============================================================================

create table if not exists public.app_users (
  id                   text primary key,
  name                 text not null,
  email                text,
  email_lower          text,
  role                 text not null default 'ENGINEER',
  active               boolean not null default true,
  password_hash        text,
  must_change_password boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint app_users_email_lower_unique unique (email_lower)
);

create index if not exists idx_app_users_role on public.app_users (role);
create index if not exists idx_app_users_active on public.app_users (active);

drop trigger if exists app_users_updated_at on public.app_users;
create trigger app_users_updated_at
  before update on public.app_users
  for each row execute function public.set_updated_at();

alter table public.app_users enable row level security;

drop policy if exists "Service role full access on app_users" on public.app_users;
create policy "Service role full access on app_users"
  on public.app_users for all to service_role
  using (true) with check (true);

notify pgrst, 'reload schema';
