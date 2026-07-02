-- =============================================================================
-- Oryx Design — Supabase migration 017: account password vault
-- Enable with SUPABASE_PASSWORD_VAULT=true after sync script
--
-- Passwords are stored as AES-256-GCM ciphertext (password_enc) — encrypted
-- app-side before insert. Set VAULT_ENCRYPTION_KEY in production.
-- =============================================================================

create table if not exists public.password_vault_entries (
  id                 text primary key,
  service_name       text not null,
  service_name_lower text not null,
  login_url          text,
  username           text,
  username_lower     text,
  password_enc       text not null,
  category           text,
  category_lower     text,
  notes              text,
  extra_json         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_pvault_service on public.password_vault_entries (service_name_lower);
create index if not exists idx_pvault_category on public.password_vault_entries (category_lower);

drop trigger if exists password_vault_entries_updated_at on public.password_vault_entries;
create trigger password_vault_entries_updated_at
  before update on public.password_vault_entries
  for each row execute function public.set_updated_at();

alter table public.password_vault_entries enable row level security;
drop policy if exists "Service role full access on password_vault_entries" on public.password_vault_entries;
create policy "Service role full access on password_vault_entries"
  on public.password_vault_entries for all to service_role using (true) with check (true);

notify pgrst, 'reload schema';
