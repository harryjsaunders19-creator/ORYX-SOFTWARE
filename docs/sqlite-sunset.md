# SQLite → Supabase sunset (Path A)

ORYX is an **internal** ops app. Production (Vercel) uses **Supabase Postgres
only**. CI e2e also runs against local Supabase (`supabase start`). Local
`npm run dev` without service-role credentials can still use SQLite.

There is **no** `DATA_BACKEND` env var. Routing is:

| Condition | Data store |
|-----------|------------|
| `SUPABASE_SERVICE_ROLE_KEY` (+ URL + anon) set | Supabase (`isSupabaseOnly()` = true) |
| Service role absent | SQLite (optional local-only) |
| `VERCEL=1` or `FORCE_SUPABASE_ONLY=true` | Per-module `SUPABASE_*=false` overrides ignored when admin is configured |

## Invariant (split modules)

For modules with `*-service.ts` + `*-sqlite.ts` / `*-supabase.ts`
routers,
`isSupabaseOnly()` selects the backend. SQLite files never call `supabase*Repo`;
Supabase files never call `*Db` or dual-write mirrors.

## Progress

### Seven core hybrids (complete)

| Module | Status |
|--------|--------|
| password-vault | Hybrid collapsed → `vault-service-sqlite.ts` |
| calendar | Hybrid collapsed → `calendar-service-sqlite.ts` |
| billing | Hybrid collapsed → `billing-handoff-service-sqlite.ts` |
| users | Hybrid collapsed → `user-service-sqlite.ts` |
| clients | Hybrid collapsed → `client-service-sqlite.ts` |
| quotes | Hybrid collapsed → `quote-service-sqlite.ts` |
| jobs | Hybrid collapsed → `job-service-sqlite.ts` |

### Inline dual-path collapses (complete)

| Service | Status |
|---------|--------|
| client contacts | SQLite-only (`client-contact-service.ts`; Supabase stays in `client-service-supabase`) |
| job status history | Split → `history-service-{sqlite,supabase}.ts` |
| site-visit saved calculations | Split → `saved-service-{sqlite,supabase}.ts` |
| client holds | Split → `hold-service-{sqlite,supabase}.ts` |
| job documents | Split → `document-service-{sqlite,supabase}.ts` |
| identity switch log | Split → `identity-switch-service-{sqlite,supabase}.ts` |
| session revocation | Split → `session-revocation-service-{sqlite,supabase}.ts` |
| backup records | Split → `backup-record-service-{sqlite,supabase}.ts` |
| employees | Split → `employee-service-{sqlite,supabase}.ts` (+ API routes use service) |
| leave | Split → `leave-service-{sqlite,supabase}.ts` (+ enrichment/permissions) |
| import-excel bulk | Split → `import-excel-bulk-{sqlite,supabase}.ts` |
| job map | Split → `job-map-service-{sqlite,supabase}.ts` |

### E2E off SQLite (this step)

| Piece | Status |
|-------|--------|
| CI | `supabase start` + seed + Playwright with `FORCE_SUPABASE_ONLY` |
| Seed | `supabase/seed-e2e-users.sql` + `scripts/e2e-seed-supabase-users.mjs` |
| Local helper | `npm run e2e:supabase:up` / `npm run test:e2e:supabase` (Docker required) |
| Hot paths | Backups GET no longer imports SQLite; reset-data / archive log skip SQLite when admin configured |

## Suggested next steps

1. Remove `better-sqlite3` / shrink `lib/db` once local SQLite is optional-only and unused in CI
2. Optionally delete unused per-module `SUPABASE_*=false` override knobs

## Out of scope until SQLite is unused locally

- Deleting `lib/db` or `better-sqlite3` from package.json
- Requiring Supabase for every `npm run dev`
- Changing `isSupabaseOnly()` to mean something other than “admin configured”
- Multi-tenancy / SaaS Path B

