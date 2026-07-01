# Jobs

Work items, revisions, status workflow, import, checking queue, and status history.

**Routes:** `/jobs`, `/jobs/[id]`, `/jobs/import`, `/jobs/checking`, `/api/jobs/*`

**Migration status:** **Migrated (Phase 6)** — logic in `modules/jobs/`. Legacy paths remain valid via re-export shims.

**Structure:**
```
modules/jobs/
  api/          list, by-id, import, designers, restore, revisions, assign, history, drawing-number
  components/   jobs-table, job-form, jobs-list-page, job-detail-page, job-import-page, job-checking-page
  import/       import-jobs.ts
  services/     job-service.ts, history-service.ts
  supabase/     repository, mapper, status-history-repository, status-history-mapper
  types/        job-types.ts, history-types.ts
  job-list-sort.ts
  index.ts      public API
```

**Shims (legacy paths):**
- `lib/services/job-service.ts`, `history-service.ts`
- `lib/db/job-types.ts`, `history-types.ts`
- `lib/import-jobs.ts`, `lib/job-list-sort.ts`
- `lib/supabase/repositories/jobs.ts`, `status-history.ts`
- `lib/supabase/mappers/job.ts`, `status-history.ts`
- `components/jobs-table.tsx`, `job-form.tsx`

**Cross-module deps:**
- Jobs → clients (`ensureClientInSqlite`, `clientService` via shims / `@/lib/services/client-service`)
- Jobs → billing (`billingHandoffService` — not yet modularized)
- Calendar, stats, quotes, clients analytics → `jobService` via shims

**Public API:** `jobService`, `ensureJobInSqliteForBilling`, `historyService`, types, import helpers, `JobsTable`, `JobForm`, page components, list sort utilities.
