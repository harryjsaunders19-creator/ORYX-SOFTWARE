# Quotes

Quote CRUD, line items, PDF generation, expiry scheduler, and convert-to-job.

**Routes:** `/quotes`, `/api/quotes/*`

**Migration status:** **Migrated (Phase 7)** — logic in `modules/quotes/`. Legacy paths remain valid via re-export shims.

**Structure:**
```
modules/quotes/
  api/          list, by-id, line-items, convert, pdf, restore, expired
  components/   quotes-page.tsx
  services/     quote-service.ts
  supabase/     repository.ts, mapper.ts
  types/        quote-types.ts
  pdf/          generate.ts, urls.ts
  quote-works.ts
  quote-expiry-scheduler.ts
  index.ts      public API
```

**Shims (legacy paths):**
- `lib/services/quote-service.ts`
- `lib/db/quote-types.ts`
- `lib/quote-works.ts`, `lib/quote-expiry-scheduler.ts`
- `lib/quote-pdf/generate.ts`, `lib/quote-pdf/urls.ts`
- `lib/supabase/repositories/quotes.ts`, `lib/supabase/mappers/quote.ts`

**Cross-module deps:**
- Quotes → clients (`ensureClientInSqlite` via shim)
- Quotes → jobs (`ensureJobInSqliteForBilling`, convert-to-job via `jobService`)
- `instrumentation.ts` → expiry scheduler via shim

**Public API:** `quoteService`, types, `quote-works` helpers, PDF generators, `startQuoteExpiryScheduler`, `QuotesPage`.
