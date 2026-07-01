# Modules

Feature modules for the Oryx modular monolith. Each module owns its UI, services, API handlers, types, validation, and (eventually) database access.

## Rules

1. **Public API only** — Other code imports from `@/modules/{name}` (this folder's `index.ts`). Never import internal paths like `@/modules/jobs/components/...`.
2. **No cross-module internals** — If module A needs module B, import from `@/modules/b`.
3. **Routes stay in `app/`** — Pages and API route files remain under `app/` as thin delegators.
4. **Shared code** — If used by 2+ modules, it belongs in `shared/`, not duplicated here.
5. **Incremental migration** — Code moves here one module at a time. Until migration, legacy paths (`@/lib/...`, `@/components/...`) remain valid via re-export shims.

## Target layout (per module)

```
modules/{name}/
  components/
  services/
  api/           # handler logic (not Next.js route files)
  hooks/
  types/
  validation/
  config/
  db/            # SQLite stores — split in `lib/db/stores/` (Phase 13); colocate per module later
  README.md
  index.ts       # public exports only
```

## Module index

| Module | Status | Routes |
|--------|--------|--------|
| dashboard | **Migrated (Phase 11)** | `/`, `/api/stats` |
| clients | **Migrated (Phase 5)** | `/clients/*`, `/api/clients/*`, `/api/hold-list` |
| jobs | **Migrated (Phase 6)** | `/jobs/*`, `/api/jobs/*` |
| quotes | **Migrated (Phase 7)** | `/quotes/*`, `/api/quotes/*` |
| calendar | **Migrated (Phase 4)** | `/calendar/*`, `/api/calendar/*` |
| employees | **Migrated (Phase 2)** | `/employees/*` |
| leave | **Migrated (Phase 3)** | `/api/leave/*` (experimental) |
| billing | **Migrated (Phase 8)** | `/billing/*`, `/api/billing-handoffs/*` |
| archive | **Migrated (Phase 9)** | `/archived`, `/api/archive-log`, `/api/archived` |
| users | **Migrated (Phase 9)** | `/users/*`, `/api/users/*` |
| backups | **Migrated (Phase 9)** | `/backups/*`, `/api/backups/*` |
| health | **Migrated (Phase 9)** | `/health`, `/api/health` |
| notifications | **Migrated (Phase 10)** | `/api/notifications` |
| import-export | **Migrated (Phase 12)** | `/api/import/excel`, `/api/export/all` |

All module Supabase repositories are colocated under `modules/{name}/supabase/` (Phase 14). Shared Supabase client/config/flags live in `shared/supabase/`.

Hold list is a sub-domain of **clients** (`/clients/hold-list`).

## Example public API

```typescript
// modules/clients/index.ts
export { clientService, ensureClientInSqlite } from "./services/client-service"
export type { ClientRow } from "./types"
```
