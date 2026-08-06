# Oryx Design — Job Tracker

Scaffold design job management for ORYX. **Local dev** uses SQLite; **production (Vercel)** uses Supabase Postgres.
Path A sunset plan: [`docs/sqlite-sunset.md`](docs/sqlite-sunset.md).

## Quick start (local)

```bash
npm install
cp .env.example .env.local   # optional for local dev
npm run dev
# → http://localhost:3000
```

On first start, `lib/db/` creates SQLite at `.data/oryx.db` and runs migrations automatically.

Default dev logins (SQLite only, when `ALLOW_BOOTSTRAP_TEST_ACCOUNTS` is not blocked): `admin@test.com` / `admin123`

## Testing

```bash
npm run test:unit
npm run test:e2e:setup   # if Playwright browser missing

# Local e2e against SQLite (no Supabase credentials):
npm run test:e2e

# Local e2e against Supabase (Docker + Supabase CLI required — matches CI):
npm run test:e2e:supabase
```

CI starts a local Supabase stack, seeds `admin@test.com` / `engineer@test.com`,
and runs Playwright with `FORCE_SUPABASE_ONLY=true`.

CI runs typecheck, unit tests, backup-restore round-trip, lint, security audit, build, and Supabase e2e on every push to `main`.

### Pre-release gate

A deployment is **not releasable** until both are green:

1. `npm run release:check` locally or in your release pipeline
2. Required GitHub Actions checks on `main`

```bash
npm run release:check
```

Runs, in order: `lint`, `typecheck`, `test:unit`, `test:backup-restore`, `build`, `test:e2e`, `npm audit --audit-level=high`. Stops on the first failure. E2E requires the isolated Supabase stack (`npm run test:e2e:supabase` or CI-equivalent setup).

## Production on Vercel + Supabase

### 1. Database setup (Supabase SQL Editor)

Run **in order** on a fresh project (or after a deliberate wipe):

1. `supabase/00-drop-all.sql` — drops all ORYX tables
2. `supabase/01-bootstrap.sql` — full schema (migrations 001–042)

Regenerate `01-bootstrap.sql` after editing migrations:

```bash
npm run supabase:bootstrap
```

See `docs/supabase-migration-numbering.md` before adding or renaming migration files (duplicate `004`/`005` prefixes already exist; do not renumber applied migrations).

> **Do not use** deprecated `setup-vercel.sql` — it stops at migration 017.

Production bootstrap (`01-bootstrap.sql`) does **not** create test users. Provision the first real administrator once:

```bash
ADMIN_PROVISION_EMAIL=you@company.com ADMIN_PROVISION_PASSWORD='YourSecurePass1' npm run admin:provision
```

Requirements:

- Run manually — never during normal app startup
- Refuses if an active admin already exists (unless `ADMIN_PROVISION_FORCE_RECOVERY=true` for explicit recovery)
- Password must meet strength rules; the password is never logged
- Records a `FIRST_ADMIN_PROVISIONED` audit entry
- Remove `ADMIN_PROVISION_PASSWORD` from your shell history and secret stores immediately afterward

For migrating existing SQLite users instead:

```bash
npm run supabase:sync-users
```

E2E/CI only: `supabase/seed-e2e-users.sql` creates `admin@test.com`, `engineer@test.com`, and `accounts@test.com` when the fail-closed test-environment guard passes.

### 2. Vercel environment variables (required)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Postgres access (**never** expose to client) |
| `AUTH_SECRET` | Session cookie signing (`openssl rand -base64 32`) |
| `VAULT_ENCRYPTION_KEY` | Password vault AES-256-GCM |
| `BACKUP_DOWNLOAD_SECRET` | Signed backup download links |
| `COOKIE_SECURE` | Set `true` on HTTPS |
| `ORS_API_KEY` | Site visit routing ([OpenRouteService](https://openrouteservice.org/)) — **required in production**. Missing key: boot logs a warning on Vercel; the calculate route returns a clear `UNAVAILABLE` error (not a silent empty route). |
| `ORYX_PRODUCTION_SUPABASE_PROJECT_REF` | Production Supabase project ref — required on Vercel for test-user guard fail-closed behaviour |

Optional but recommended:

| Variable | Purpose |
|----------|---------|
| `ERROR_WEBHOOK_URL` | Slack/Datadog JSON webhook for `logError` / `apiInternalError` |
| `SUPABASE_SITE_VISIT_CALCULATIONS` | Default on when service role is set |
| `SUPABASE_PASSWORD_VAULT` | Default on when service role is set |

### Production smoke check

```bash
PRODUCTION_URL=https://oryx-software.vercel.app npm run smoke:production
```

Checks `/api/ping` and that anonymous `/api/jobs` returns 401. Also runs weekdays via GitHub Actions (`.github/workflows/smoke.yml`).

When `SUPABASE_SERVICE_ROLE_KEY` is set, all modules use Supabase by default. Disable one with `SUPABASE_<MODULE>=false`.

### 3. Sync existing SQLite data

From a machine with your `.data/oryx.db`:

```bash
npm run supabase:check
npm run supabase:sync-all
npm run supabase:verify-all
```

### 4. Verify before go-live

- Admin → **System Health → Supabase** (or `GET /api/supabase/status`)
- `npm run supabase:verify-site-visit-calculations` — confirms migration 025 + `ORS_API_KEY`
- Log in, change bootstrap passwords, confirm core flows (jobs, quotes, site visit calculator)

### Module flags

| Flag | Module |
|------|--------|
| `SUPABASE_USERS` | Login accounts |
| `SUPABASE_CLIENTS` | Clients |
| `SUPABASE_JOBS` | Jobs |
| `SUPABASE_STATUS_HISTORY` | Job audit trail |
| `SUPABASE_QUOTES` | Quotes |
| `SUPABASE_HOLDS` | Client holds |
| `SUPABASE_BILLING` | Billing queue |
| `SUPABASE_CALENDAR` | Calendar |
| `SUPABASE_IDENTITY_LOG` | Admin switch-user audit |
| `SUPABASE_BACKUPS` | Backup metadata |
| `SUPABASE_EMPLOYEES` | HR profiles |
| `SUPABASE_LEAVE` | Leave requests |
| `SUPABASE_PASSWORD_VAULT` | Account passwords |
| `SUPABASE_SITE_VISIT_CALCULATIONS` | Site visit calculator saves |

### Backups on Vercel

Local SQLite filesystem dumps **do not run** when Supabase is the data store. For production recovery:

1. **Supabase project backups / PITR** — full database restore (primary).
2. **Admin → Backups → Export full data** — portable JSON v2 of Users (no password hashes), Clients, Jobs, and Quotes with sha256 checksum; re-import with **Import JSON**.
3. **Export / Import Excel** — same entities for spreadsheet workflows (Users without password hashes; restored accounts must set a new password).

### Experimental modules (off in production)

Employees and Leave are gated by `shared/experimental/experimental-features.ts` (`employees` / `leave` = `false`). Nav, pages, and APIs stay in the repo but return 404 / stay hidden until those flags are flipped. Employee photos/documents now write to the private Supabase Storage bucket `employee-files` (migration `028`) when Supabase admin is configured — still keep `employees` false until HR review and migrations 014–016 + 028 are verified.

### Production checklist (Vercel)

- Keep `employees` / `leave` experimental flags **false** until HR review is complete.
- Local filesystem backups and employee document files are **not durable** across multiple Vercel instances — use Supabase backups / storage for production durability.
- `AUTH_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are **required** on Vercel (boot fails loudly without a configured Supabase admin client).
- Boot also verifies the private Supabase Storage bucket `job-files` exists (migration `037`). With `employees` enabled, `employee-files` (migration `028`) is required too — uploads never fall back to ephemeral `/tmp`.
- Set `ORS_API_KEY` for reliable site-visit routing (optional but recommended).

### Geocoding (job map + site visit)

Address geocoding uses free public APIs with soft rate limiting in-process (~1 req/s for Nominatim). Fine for a small team; not a bulk-import geocoder. Prefer UK postcodes (postcodes.io) when possible. Site visit **routing** uses OpenRouteService when `ORS_API_KEY` is set.

## Database (local)

```bash
npm run db:seed      # sample Bristol jobs
npm run db:reset     # wipe and re-seed
npm run db:check     # health CLI
```

Health dashboard: http://localhost:3000/health

## Environment variables

Copy `.env.example` to `.env.local`. See `docs/synology.env.example` for Synology/Docker reference.

## Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Framework | Next.js 16 (App Router)             |
| Language  | TypeScript                          |
| Database  | SQLite (local) / Supabase Postgres (prod) |
| Styling   | Tailwind CSS                        |
| UI        | Radix UI primitives                 |

## Drawing numbers

Auto-assigned on job creation: `YY/ORYX/MM/NNN` → `26/ORYX/06/001` (resets monthly).
