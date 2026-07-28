-- Per-user module visibility controls (admin-managed toggles).
alter table public.app_users
  add column if not exists module_access_json jsonb;

notify pgrst, 'reload schema';
