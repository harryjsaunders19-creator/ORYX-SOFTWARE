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

For the seven modules with `*-service.ts` + `*-hybrid.ts` / `*-supabase.ts`
routers, `useSupabase*()` is only true when admin credentials exist — which
also makes `isSupabaseOnly()` true. The hybrid dual-write branches are therefore
**unreachable** whenever Supabase is configured. Hybrids only run as the
SQLite-only path when credentials are absent.

## Progress

| Module | Status |
|--------|--------|
| password-vault | Hybrid collapsed → `vault-service-sqlite.ts` (this slice) |
| calendar | Hybrid still present (dead dual-write) |
| billing | Hybrid still present |
| users | Hybrid still present |
| clients | Hybrid still present |
| quotes | Hybrid still present |
| jobs | Hybrid still present (+ `ensure*InSqlite` helpers) |

**Still dual-path in a single file** (no hybrid split yet): leave, employees,
holds, history, site-visit saved calculations, job-documents, backups,
client-contacts, identity/session helpers, import-export.

## Suggested order

1. Collapse remaining hybrids (calendar → billing → users → clients → quotes → jobs)
2. Split or collapse inline dual-path services
3. Move e2e to Supabase (or a test Postgres) so `lib/db` can shrink
4. Remove `better-sqlite3` / SQLite boot when CI no longer needs it

## Out of scope for early slices

- Deleting `lib/db` or `better-sqlite3`
- Requiring Supabase for local/e2e
- Changing `isSupabaseOnly()` to mean something other than “admin configured”
