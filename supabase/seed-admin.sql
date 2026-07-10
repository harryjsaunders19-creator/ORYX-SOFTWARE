-- Default login accounts after a clean bootstrap (local dev / first-time recovery only).
-- Initial passwords: admin@test.com → admin123, engineer@test.com → engineer123
-- Users must set a new password on first login (must_change_password = true).
--
-- Re-running bootstrap will NOT reset existing passwords (on conflict skips credential updates).
-- For production: sync real users via npm run supabase:sync-users, then disable or delete these accounts.

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
    '$2b$12$wVrk8AKFzoiXEI7Omnk.T.dglEnJb2dJ3tCQb6WzMwjZFTcWcAdJS',
    true,
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
    '$2b$12$/DdL.xz2gZCeQ9D6iOROkurSonjZLdrEZJ/yzZfDf3kQvoAiUW0gy',
    true,
    now(),
    now()
  )
on conflict (email_lower) do update set
  name = excluded.name,
  role = excluded.role,
  active = true,
  updated_at = now();
