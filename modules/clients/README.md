# Clients

Client directory, detail pages, import, search, and hold list.

**Routes:** `/clients`, `/clients/[id]`, `/clients/import`, `/clients/hold-list`, `/api/clients/*`, `/api/hold-list`

**Migration status:** **Migrated (Phase 5)** — logic in `modules/clients/`. Legacy paths remain valid via re-export shims.

**Structure:**
```
modules/clients/
  api/          list.ts, by-id.ts, search.ts, import.ts, analytics.ts, restore.ts
  components/   client-directory-page.tsx, client-detail-page.tsx, client-import-page.tsx,
                client-combobox.tsx, quick-create-client-modal.tsx
  import/       import-clients.ts
  services/     client-service.ts
  supabase/     repository.ts, mapper.ts
  types/        client-types.ts
  hold/         hold sub-domain (service, API, UI, supabase)
  index.ts      public API
```

**Shims (legacy paths):**
- `lib/services/client-service.ts`, `lib/services/hold-service.ts`
- `lib/db/client-types.ts`, `lib/db/hold-types.ts`
- `lib/import-clients.ts`
- `lib/supabase/repositories/clients.ts`, `client-holds.ts`
- `lib/supabase/mappers/client.ts`, `client-hold.ts`
- `components/client-combobox.tsx`, `quick-create-client-modal.tsx`

**Cross-module deps:**
- Analytics API → `jobService` (jobs not yet migrated — via `@/lib/services/job-service`)
- Client service → `archiveLogService`, `supabaseJobRepo` (not yet modularized)

**Public API:** `clientService`, `ensureClientInSqlite`, `holdService`, types, import helpers, `ClientCombobox`, `QuickCreateClientModal`, page components.
