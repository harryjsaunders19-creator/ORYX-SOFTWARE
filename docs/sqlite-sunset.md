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

For modules with `*-service.ts` + `*-sqlite.ts` / `*-supabase.ts` routers,
`isSupabaseOnly()` selects the backend. Dual-write mirrors are removed.

## Progress

### Seven core hybrids + inline dual-path collapses

See recent Path A PRs — jobs/clients/quotes/users/billing/calendar/vault and
inline services (holds, history, documents, employees, leave, backups,
identity/session, import-excel, job-map) follow the router pattern.

### E2E off SQLite (this step)

| Piece | Status |
|-------|--------|
| CI | `supabase start` + seed + Playwright with `FORCE_SUPABASE_ONLY` |
| Seed | `supabase/seed-e2e-users.sql` + `scripts/e2e-seed-supabase-users.mjs` |
| Local helper | `npm run e2e:supabase:up` / `npm run test:e2e:supabase` (Docker required) |
| Hot paths | Backups GET no longer imports SQLite; reset-data / archive log skip SQLite when admin configured |

## Suggested next steps

1. Remove `better-sqlite3` / shrink `lib/db` once local SQLite is optional-only and unused in CI
2. Optionally delete per-module `SUPABASE_*=false` override knobs

## Out of scope until SQLite is unused locally

- Deleting `lib/db` or `better-sqlite3` from `package.json`
- Requiring Supabase for every `npm run dev`
- Changing `isSupabaseOnly()` to mean something other than “admin configured”
- Multi-tenancy / SaaS Path B
