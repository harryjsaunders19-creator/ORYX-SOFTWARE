# Oryx Design — Job Tracker

Scaffold design job management system. Runs entirely locally — no cloud services,
no Docker, no database server.

## Quick start

```bash
npm install
npm run dev
# → http://localhost:3000
```

On first start, `lib/db/` automatically creates the SQLite database at
`.data/oryx.db` and runs the schema migration. No manual steps needed.

## Testing

End-to-end tests use Playwright. Browsers are downloaded automatically on `npm install`.
If tests fail with "Executable doesn't exist", run:

```bash
npm run test:unit    # auth, path validation, PDF cache (Node test runner)
npm run test:e2e:setup
npm run test:e2e
```

Default login for tests: `admin@test.com` / `admin123`

## Supabase migration (in progress)

The app still uses **SQLite** (`lib/db/`). Supabase client files live in `lib/supabase/`.

1. Create a project at [supabase.com](https://supabase.com)
2. Copy `.env.example` → `.env.local` and fill in the three Supabase vars
3. Restart `npm run dev`
4. Log in as admin and check: `GET /api/supabase/status` (or visit while logged in)
5. Run SQL migration: paste `supabase/migrations/001_clients.sql` into Supabase SQL Editor
6. Sync existing clients: `npm run supabase:sync-clients`
7. Enable client module: set `SUPABASE_CLIENTS=true` in `.env.local` and restart
8. Jobs: run `supabase/migrations/002_jobs.sql`, then `npm run supabase:sync-jobs`, set `SUPABASE_JOBS=true`
9. Quotes: run `supabase/migrations/003_quotes.sql`, then `npm run supabase:sync-quotes`, set `SUPABASE_QUOTES=true`
10. Status history: run `004_status_history.sql`, `npm run supabase:sync-status-history`, set `SUPABASE_STATUS_HISTORY=true`
11. Client holds: run `005_client_holds.sql`, `npm run supabase:sync-holds`, set `SUPABASE_HOLDS=true`
12. Billing: run `006_billing.sql`, `npm run supabase:sync-billing`, set `SUPABASE_BILLING=true`
13. Calendar: run `007_calendar.sql`, `npm run supabase:sync-calendar`, set `SUPABASE_CALENDAR=true`
14. Users: run `008_users.sql`, `npm run supabase:sync-users`, set `SUPABASE_USERS=true` (keeps bcrypt + cookie login — not Supabase Auth)
15. Identity log: run `009_identity_switch_logs.sql`, `npm run supabase:sync-identity-log`, set `SUPABASE_IDENTITY_LOG=true`
16. Backups: run `010_backups.sql`, `npm run supabase:sync-backups`, set `SUPABASE_BACKUPS=true` (backup files stay on disk)

Dashboard stats and global export read from Supabase automatically when the relevant module flags are enabled.

SQLite remains the live database for jobs, quotes, etc. until each module is migrated.

## Database

### Seed sample data
```bash
npm run db:seed     # adds sample Bristol scaffold jobs
```

### Reset and re-seed
```bash
npm run db:reset    # deletes oryx.db and re-seeds
```

### Check database health
```bash
npm run db:check    # CLI check — prints job count and DB path
```

### Health check page
Visit http://localhost:3000/health for a live dashboard showing:
- Database connection status
- Read/write test results
- Sequence generator status
- Job count

## Environment variables

Copy `.env.example` to `.env.local` and adjust for your environment. See
`synology.env` for a production (Synology/Docker) example.

## Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Framework | Next.js 16 (App Router)             |
| Language  | TypeScript                          |
| Database  | SQLite via **better-sqlite3**       |
| Styling   | Tailwind CSS                        |
| UI        | Radix UI primitives                 |

> **Why not Prisma?** Prisma requires downloading native binary engines from
> `binaries.prisma.sh`. This host is blocked in many CI, Docker, and managed
> environments. `better-sqlite3` compiles from source using the system Node
> headers and has zero runtime download requirements.

## Drawing numbers

Auto-assigned on job creation:

```
YY/ORYX/MM/NNN    →    26/ORYX/06/001
```

The sequence resets each calendar month. Atomic SQLite transaction prevents
duplicates under concurrent load.

## API

| Method | Path                | Description              |
|--------|---------------------|--------------------------|
| GET    | /api/jobs           | List/search/filter jobs  |
| POST   | /api/jobs           | Create a job             |
| GET    | /api/jobs/:id       | Get a single job         |
| PATCH  | /api/jobs/:id       | Update a job             |
| DELETE | /api/jobs/:id       | Delete a job             |
| GET    | /api/stats          | Dashboard statistics     |
| GET    | /api/health         | System health check      |

### GET /api/jobs query params

| Param         | Default    | Notes                                      |
|---------------|------------|--------------------------------------------|
| page          | 1          |                                            |
| limit         | 25         | Max 100                                    |
| search        | ""         | Searches drawing no, address, client, etc  |
| status        | ""         | Filter by job status                       |
| invoiceStatus | ""         | Filter by invoice status                   |
| sortBy        | createdAt  | createdAt, drawingNumber, clientCompany… |
| sortDir       | desc       | asc or desc                                |
| export        | false      | true = all matching rows, no pagination    |
