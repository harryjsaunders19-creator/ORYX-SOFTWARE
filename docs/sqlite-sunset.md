# SQLite → Supabase sunset (Path A)

ORYX is an **internal** ops app. Production (Vercel) uses **Supabase Postgres
only**. Local/CI keep SQLite until e2e is moved off it.

There is **no** `DATA_BACKEND` env var. Routing is:

| Condition | Data store |
|-----------|------------|
| `SUPABASE_SERVICE_ROLE_KEY` (+ URL + anon) set | Supabase (`isSupabaseOnly()` = true) |
| Service role absent | SQLite (local/CI/e2e) |
| `VERCEL=1` or `FORCE_SUPABASE_ONLY=true` | Per-module `SUPABASE_*=false` overrides ignored when admin is configured |

## Invariant (split modules)

For the seven modules with `*-service.ts` + `*-sqlite.ts` / `*-supabase.ts`
routers, `useSupabase*()` is only true when admin credentials exist — which
also makes `isSupabaseOnly()` true. All seven hybrids have been collapsed to
pure SQLite local/CI services; dual-write branches were unreachable whenever
Supabase was configured.

## Progress

| Module | Status |
|--------|--------|
| password-vault | Hybrid collapsed → `vault-service-sqlite.ts` |
| calendar | Hybrid collapsed → `calendar-service-sqlite.ts` |
| billing | Hybrid collapsed → `billing-handoff-service-sqlite.ts` |
| users | Hybrid collapsed → `user-service-sqlite.ts` |
| clients | Hybrid collapsed → `client-service-sqlite.ts` |
| quotes | Hybrid collapsed → `quote-service-sqlite.ts` |
| jobs | Hybrid collapsed → `job-service-sqlite.ts` |

**Still dual-path in a single file** (no hybrid split yet): leave, employees,
holds, history, site-visit saved calculations, job-documents, backups,
client-contacts, identity/session helpers, import-export.

## Suggested order

1. Split or collapse inline dual-path services
2. Move e2e to Supabase (or a test Postgres) so `lib/db` can shrink
3. Remove `better-sqlite3` / SQLite boot when CI no longer needs it

## Out of scope for early slices

- Deleting `lib/db` or `better-sqlite3`
- Requiring Supabase for local/e2e
- Changing `isSupabaseOnly()` to mean something other than “admin configured”
