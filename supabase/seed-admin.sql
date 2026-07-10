-- Default login accounts after a clean bootstrap (dev / recovery only).
-- Passwords: admin@test.com → admin123, engineer@test.com → engineer123
-- Change or remove in production once real users are synced via npm run supabase:sync-users.

insert into public.app_users (
  id, name, email, email_lower, role, active,
  password_hash, must_change_password, created_at, updated_at
) values
  (
    'bootstrap-admin-001',
    'Admin',
    'admin@test.com',
    'admin@test.com',
    'ADMIN',
    true,
    '$2b$12$wVrk8AKFzoiXEI7Omnk.T.dglEnJb2dJ3tCQb6WzMwjZFTcWcAdJS',
    false,
    now(),
    now()
  ),
  (
    'bootstrap-engineer-001',
    'Engineer',
    'engineer@test.com',
    'engineer@test.com',
    'ENGINEER',
    true,
    '$2b$12$/DdL.xz2gZCeQ9D6iOROkurSonjZLdrEZJ/yzZfDf3kQvoAiUW0gy',
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
