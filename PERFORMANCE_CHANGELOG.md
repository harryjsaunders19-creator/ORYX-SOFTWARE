# Performance Changelog

Branch: `cursor/performance-job-list-audit-3beb`  
Related report: `PERFORMANCE_AND_BUG_AUDIT.md`

---

## Summary of files changed

### `modules/jobs/supabase/repository.ts`

* **What:** Prefer `job_dashboard_counts` RPC; rewrite `findOverduePreview` to DB-filtered candidates; slim `revisionsForJob` select; add `findLatestRevisionForParent` and `countRevisionsForParent`.  
* **Why:** Confirmed full-table / full-family reads on dashboard and detail hot paths.  
* **Behaviour:** Same dashboard tallies and overdue semantics when RPC matches scan rules; detail still returns latest revision + accurate count.  
* **Tested:** tsc, lint, unit + e2e, production build.  
* **Expected improvement:** Fewer rows scanned/transferred on dashboard and detail.  
* **Rollback:** Revert this file; RPC/fallback both remain safe.

### `modules/quotes/supabase/repository.ts`

* **What:** `findByJobIds` uses `QUOTE_JOB_LINK_SELECT` instead of `*`.  
* **Why:** Job list enrich only needs linkage/summary fields.  
* **Behaviour:** Same linked quote summaries on cards; omitted quote columns unused by enrich mapper.  
* **Tested:** as above.  
* **Expected improvement:** Smaller quote payloads per list page.  
* **Rollback:** Restore `select("*")`.

### `modules/jobs/services/job-service-supabase.ts` / `job-service-sqlite.ts`

* **What:** Expose `findLatestRevisionForParent` and `countRevisionsForParent`.  
* **Why:** Wire repository helpers to API layer (including SQLite/CI).  
* **Behaviour:** No user-facing change alone.  
* **Tested:** as above.  
* **Rollback:** Remove methods with by-id revert.

### `modules/jobs/api/by-id.ts`

* **What:** Gate current-revision meta on `include=current`; fetch latest + count instead of all revisions; parallelise enrich / parent / revision meta.  
* **Why:** Detail UI already loads full family via `/revisions`; avoid duplicate heavy work.  
* **Behaviour:** Response shape unchanged for current UI query strings; parents without `include=current` no longer get revision meta (UI always sends `current`).  
* **Tested:** as above.  
* **Expected improvement:** Faster parent job detail GET.  
* **Rollback:** Restore previous sequential `revisionsForJob` block.

### `modules/jobs/components/jobs-table.tsx`

* **What:** Hold SWR key → `/api/hold-list?fields=clientId`.  
* **Why:** List only needs client IDs for hold badges.  
* **Behaviour:** Hold badge set unchanged; hold list page still uses full endpoint.  
* **Tested:** as above.  
* **Expected improvement:** Removes hold enrichment from Job List cold load.  
* **Rollback:** Point key back to `/api/hold-list`.

### `modules/clients/hold/api/hold-list.ts`

* **What:** Optional `fields=clientId` returns slim `{ clientId }[]`.  
* **Why:** Support Job List without changing hold-list page contract.  
* **Behaviour:** Default GET unchanged (full enrich).  
* **Tested:** as above.  
* **Rollback:** Remove query branch.

### `modules/clients/hold/supabase/repository.ts`

* **What:** `allActiveHoldsPreview(take)`, `allActiveClientIds()`.  
* **Why:** SQL limit / slim select for dashboard + Job List.  
* **Behaviour:** Same hold records; less data transferred.  
* **Tested:** as above.  
* **Rollback:** Delete helpers; restore callers.

### `modules/clients/hold/services/hold-service-supabase.ts` / `hold-service-sqlite.ts`

* **What:** Preview uses limited query; add `allActiveClientIds`.  
* **Why:** Service-layer API for routes.  
* **Behaviour:** Dashboard preview still capped; SQLite maps from in-memory allActive.  
* **Tested:** as above.  
* **Rollback:** With repository/API revert.

### `PERFORMANCE_AND_BUG_AUDIT.md` / `PERFORMANCE_CHANGELOG.md`

* **What:** Audit report and this changelog.  
* **Why:** Required deliverables for the performance engagement.  
* **Behaviour:** Documentation only.

---

## Behaviour change checklist

| User-visible behaviour | Changed? |
|------------------------|----------|
| Job statuses / revisions / drawing numbers | No |
| Job List filters, search, sort, pagination | No |
| Hold badges on Job List | No (same clientId set) |
| Hold list page | No |
| Dashboard KPI semantics | No (RPC preferred when available) |
| Auth / RLS / validation | No |

---

## Validation log

1. `npx tsc --noEmit` — pass  
2. `npm run lint` — 0 errors (2 pre-existing warnings in quotes PDF)  
3. `npm run test:unit` — 149 pass  
4. `npm test` — e2e 30 pass  
5. `npm run build` — pass  

---

## Migrations

None added in this change set.
