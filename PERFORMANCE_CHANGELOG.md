# Performance Changelog

Branch: `cursor/performance-job-list-audit-3beb`  
Related report: `PERFORMANCE_AND_BUG_AUDIT.md`

---

## Summary of files changed

### `modules/jobs/api/list.ts` (follow-up)

* **What:** Removed `needsCurrentFilter` / `filterByCurrentDisplay` path; always apply status/unassigned/deadline in SQL with normal pagination. Opt-in DEV timing via `ORYX_PERF_LOG=1`.  
* **Why:** After parent-status protection, JS filter matched parent columns only but still loaded ≤5000 rows.  
* **Behaviour:** Same as current post-overlay list semantics; faster and correctly paginated for `onlyOriginals` + filters.  
* **Tested:** tsc, lint, unit, e2e, build.  
* **Expected improvement:** Filtered originals lists no longer materialise the full originals set.  
* **Rollback:** Restore previous GET branch from git history.

### `shared/hooks/use-api.ts` (follow-up)

* **What:** Fetcher forwards SWR `AbortSignal` when provided.  
* **Why:** Reduce stale response races on rapid filter/search key changes.  
* **Behaviour:** None when signal unused; aborted fetches throw AbortError (SWR handles).  
* **Rollback:** Drop second fetcher argument.

### `modules/jobs/services/deadline-tallies.ts` (follow-up)

* **What:** Comment clarified — dashboard uses current-revision overlay; list does not.  
* **Behaviour:** Documentation only.

### `modules/jobs/supabase/repository.ts`

* **What:** Prefer `job_dashboard_counts` RPC; rewrite `findOverduePreview` to DB-filtered candidates; slim `revisionsForJob` / bulk revision selects; add `findLatestRevisionForParent` and `countRevisionsForParent`.  
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

### Follow-up 2 — shell / job open / billing / clients / quotes

* **`notification-service` + hold services:** `allActiveWithNames()` — bell skips per-client job stats.  
* **`app/jobs/[id]/page.tsx`:** RSC seeds quotes + current revision; billing uses currentRevisionId.  
* **`job-detail-page` / `parent-job-dashboard`:** Skip SWR remount when fallback present.  
* **`revisions.ts`:** Resolve parent without double `getDashboard`.  
* **`status-history-repository.forWorkItems` + `work-item-repository.findByParents`:** Billing snapshot N+1 removed.  
* **`client-service-supabase.batchClientMeta`:** Parallel counts + holds.  
* **`quotes-page.setStatus`:** Optimistic targeted mutate.

---

## Behaviour change checklist

| User-visible behaviour | Changed? |
|------------------------|----------|
| Job statuses / revisions / drawing numbers | No |
| Job List filters, search, sort, pagination | Pagination now correct for `onlyOriginals` + status/deadline (was JS over ≤5k) |
| Hold badges on Job List | No (same clientId set) |
| Hold list page | No |
| Notifications content | No (same titles/messages; cheaper fetch) |
| Job detail first paint | Richer RSC seed; no duplicate remount GET |
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
