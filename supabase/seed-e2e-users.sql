-- E2E / local test accounts with stable known passwords (must_change_password = false).
-- Passwords: admin@test.com → admin123, engineer@test.com → engineer123
-- Hashes match lib/db/schema.ts bootstrapAccounts (E2E branch).
--
-- Unlike seed-admin.sql, ON CONFLICT resets password + must_change for reproducible e2e.

insert into public.app_users (
  id, name, email, email_lower, role, active,
  password_hash, must_change_password, created_at, updated_at
) values
  (
    'bootstrap-admin-00000001',
    'Admin',
    'admin@test.com',
    'admin@test.com',
    'ADMIN',
    true,
    '$2b$12$92nRgb8jPt20D4.fPVhIOudgpnPaAozVDOxbw32dArHspiSFy2OGS',
    false,
    now(),
    now()
  ),
  (
    'bootstrap-engineer-00000001',
    'Engineer',
    'engineer@test.com',
    'engineer@test.com',
    'ENGINEER',
    true,
    '$2b$12$NWRIw4dbY47HJRDhOZStaOuY7s4Js.emZPm9QMHJysvYgj1gOrB7u',
    false,
    now(),
    now()
  )
on conflict (email_lower) do update set
  name = excluded.name,
  role = excluded.role,
  active = true,
  password_hash = excluded.password_hash,
  must_change_password = false,
  updated_at = now();
