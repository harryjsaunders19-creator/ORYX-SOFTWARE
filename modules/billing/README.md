# Billing

Ready For Invoicing queue, handoffs, export batches, and Excel export.

**Routes:** `/billing`, `/api/billing-handoffs/*`

**Migration status:** **Migrated (Phase 8)** — logic in `modules/billing/`. Legacy paths remain valid via re-export shims.

**Structure:**
```
modules/billing/
  api/          list, by-id, batches-list, batch-by-id, batch-xlsx, export
  components/   billing-page.tsx
  services/     billing-handoff-service.ts
  supabase/     repository.ts, mapper.ts
  types/        billing-types.ts
  billing-export.ts
  index.ts      public API
```

**Shims (legacy paths):**
- `lib/services/billing-handoff-service.ts`
- `lib/db/billing-types.ts`
- `lib/billing-export.ts`
- `lib/supabase/repositories/billing.ts`
- `lib/supabase/mappers/billing.ts`

**Cross-module deps:**
- Billing → jobs (`ensureJobInSqliteForBilling`, `syncJobHandoffs` called from job-service)
- Billing → SQLite stores (`billingHandoffDb`, `AccountsHandoverSnapshot`)

**Public API:** `billingHandoffService`, types, `buildAccountsHandoverWorkbook`, `workbookToBuffer`, `BillingPage`.
