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

## Supabase (production on Vercel)

The app supports **SQLite locally** and **Supabase Postgres in production**. Module services dual-write: SQLite first, then mirror to Supabase when configured.

### Quick setup (Vercel)

1. Create a [Supabase](https://supabase.com) project
2. In Supabase SQL Editor, run **`supabase/setup-vercel.sql`** then **`supabase/setup-vercel-part2.sql`**
3. Add to Vercel environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `AUTH_SECRET`, `BACKUP_DOWNLOAD_SECRET`, `COOKIE_SECURE=true`
4. From a machine with your SQLite data: `npm run supabase:sync-all`
5. Redeploy — modules use Supabase automatically when the service role key is set
6. Admin → **System Health → Supabase integration** (or `GET /api/supabase/status`)

### Module flags

When `SUPABASE_SERVICE_ROLE_KEY` is set, **all modules default to Supabase**. Disable one with `SUPABASE_<MODULE>=false`. Omit the service role key entirely for SQLite-only local dev.

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

### Incremental migration (existing SQLite data)

```bash
npm run supabase:check          # env + connectivity
npm run supabase:verify-all     # compare SQLite vs Supabase counts
npm run supabase:sync-all       # copy all modules to Supabase
```

Individual scripts: `supabase:sync-clients`, `supabase:sync-jobs`, … see `package.json`.

Migrations live in `supabase/migrations/` (001–016). Run in order if not using the setup SQL bundles.


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
