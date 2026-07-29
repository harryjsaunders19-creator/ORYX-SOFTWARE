# Performance and Bug Audit — Oryx OS

**Date:** 2026-07-29  
**Branch:** `cursor/performance-job-list-audit-3beb`  
**Scope:** Job List and high-traffic flows (dashboard, job detail, holds, quotes enrich)  
**Environment:** Next.js 16.2.12 / React 19 / Supabase Postgres / ~5–10 internal users  

Exact production wall-clock timings were **not** measured against live Supabase. Findings below are from code-path tracing, query shape inspection, and local validation (tsc / lint / unit / e2e / build).

---

## 1. Executive summary

The Job List cold path is already structured sensibly for a small team: paginated `/api/jobs` (limit 25), SWR with debounce (280ms), optimistic status/designer patches without full refetch, revision sidecar only for parents on the page, and existing hot-path indexes (migrations 012 / 023 / 035 / 040).

Highest-impact issues found and fixed in this pass:

1. **Dashboard counts** could fall through to a full-table slim scan even when `job_dashboard_counts` RPC (migration 040) exists — RPC path was not reliably preferred.
2. **Dashboard overdue preview** scanned the entire jobs table page-by-page before applying current-revision semantics.
3. **Job detail GET** loaded **all** revision rows (`select("*")` historically; full family) just to expose latest revision metadata, while `/api/jobs/:id/revisions` already loads the family for the UI.
4. **Job List hold badges** called full `/api/hold-list`, which enriched every active hold with client + per-client job stats — far more work than a `Set` of `clientId`s.
5. **Quote enrich for job list** selected `*` from quotes when only linkage/summary fields are needed.
6. **Hold dashboard preview** loaded all active holds then `.slice(0, take)`.
7. **`needsCurrentFilter`** loaded up to 5 000 full parent rows + sidecars then filtered in Node — obsolete after parent-status protection removed revision overlays; filters now stay in SQL with normal pagination.
8. **Notifications** used fully enriched holds (per-client job stats) on every shell poll.
9. **Job open** paid RSC seed **plus** mandatory client remount of the same detail API.
10. **Revisions GET** (work-items model) called `getDashboard` twice.
11. **Billing export snapshots** queried status history once per work item and siblings once per parent.

No P0 request loops, realtime subscription leaks, or production build failures were found. No new indexes were added — existing migrations already cover confirmed list/deadline/hold patterns.

---

## 2. Current architecture and data flow

| Area | Approach |
|------|----------|
| Framework | Next.js 16.2 App Router, React 19 |
| Data | Supabase Postgres (admin client server-side); SQLite path for local/CI |
| Client fetch | SWR via `shared/hooks/use-api.ts` (`keepPreviousData`, `revalidateOnFocus: false`, `dedupingInterval: 2000`) |
| Job List UI | Client `JobsTable` → `/api/jobs`, `/api/hold-list?fields=clientId`, `/api/jobs/designers` |
| List API | `modules/jobs/api/list.ts` → `jobService.findManyWithCount` → revision sidecar → `enrichJobsWithLinkedQuotes` |
| State | Mostly SWR + local component state; `UserProvider` for session |
| Realtime | No Postgres realtime subscriptions on Job List (none found in app code) |
| Caching | HTTP `listResponse` / `resourceResponse` helpers; SWR client cache; no unsafe permanent cache |
| Indexes | 002, 012, 023 (`list_sort_key`), 035 (hot paths), 040 (`job_dashboard_counts`) |

---

## 3. Job List loading sequence

**Cold navigation to `/jobs` (default filters):**

1. Shell / session (often RSC-seeded; SWR may skip remount fetch).
2. Parallel browser GETs:
   - `GET /api/jobs?page=1&limit=25&sortBy=drawingNumber&sortDir=asc` (+ filters)
   - `GET /api/hold-list?fields=clientId` *(after fix; previously full enrich)*
   - `GET /api/jobs/designers`
3. Server list path (typical, `needsCurrentFilter === false`):
   - 1× jobs page + count (`buildJobListSelect`, ordered by `list_sort_key` when present)
   - 1× revision sidecar for parent IDs on the page (chunked `.in()`)
   - 1× quotes `findByJobIds` for page job IDs (slim columns after fix)
4. Render ≤25 memoised `JobTableRow` / `JobMobileCard` rows.

**Estimated DB round-trips to paint the list (happy path):** ~3–5 from the jobs API + 1 slim holds + 1 users/designers (designers is users table, not jobs). Exact counts depend on schema-fallback retries and whether revision parents exist on the page.

**Heavy path (removed):** Previously `onlyOriginals` + status/deadline/unassigned triggered `needsCurrentFilter`, loading up to 5000 parents then filtering in Node. That path is gone — those filters always apply in SQL with `skip`/`take` pagination (parents own status/deadline after revision-status protection).

---

## 4. Baseline measurements

| Check | Result (this environment) |
|-------|---------------------------|
| `tsc --noEmit` | Pass |
| `eslint` | Pass with 2 pre-existing warnings in `modules/quotes/pdf/generate.ts` |
| `npm run test:unit` | 149 pass / 0 fail |
| `npm test` (unit + e2e) | 30 e2e pass (full suite) |
| `npm run build` | Pass |
| Live Supabase latency | **Not measured** (no production timing harness in this run) |
| Job List request count | Code-traced: 3 parallel client GETs; server list ~3 Supabase queries on default path |

**Important query shapes (pre-change):**

- List: slim `JOB_LIST_SELECT_COLUMNS` (not `*`)
- `needsCurrentFilter`: up to 5000 rows + sidecar + JS filter
- Detail `include=current`: full `revisionsForJob` then sort for latest
- Dashboard: intended RPC, overdue preview full scan
- Holds on Job List: `allActive()` + client + job stats enrichment

---

## 5. Confirmed bugs

### [BUG-001] Job detail loaded full revision family for “current” metadata

* **Priority:** P1  
* **Confidence:** Confirmed  
* **Affected location:** `modules/jobs/api/by-id.ts`, `modules/jobs/supabase/repository.ts`  
* **Evidence:** Parent jobs always called `revisionsForJob` (all children) while UI also fetches `/api/jobs/:id/revisions`.  
* **Root cause:** Detail endpoint derived latest + count from a full array.  
* **User impact:** Slower job card open for parents with many revisions; duplicate work.  
* **Fix applied:** `findLatestRevisionForParent` + `countRevisionsForParent`; gated on `include.has("current")`; parallelised with quote enrich / parent.  
* **Risk of change:** Low — response fields preserved (`currentRevision*`, `revisionCount`, `hasRevisions`).  
* **Validation:** tsc; unit/e2e green; build pass.  
* **Expected benefit:** Fewer rows transferred and less CPU on detail GET.

### [BUG-002] Dashboard overdue preview unbounded table scan

* **Priority:** P1  
* **Confidence:** Confirmed  
* **Affected location:** `supabaseJobRepo.findOverduePreview`  
* **Evidence:** Pre-change code paged entire `jobs` table with `JOB_OVERDUE_PREVIEW_SELECT` then tallied.  
* **Root cause:** Correctness via full dataset instead of indexed candidate filter.  
* **User impact:** Slow dashboard when calendar week strip included.  
* **Fix applied:** DB filter (`status <> ISSUED`, `required_by_date < today`, limit 500) + sibling/original fetch for overlay.  
* **Risk of change:** Medium-Low — same `displayDeadlineByOriginal` / `overdueOriginalIds` semantics; candidate cap 500 is adequate for 5–10 users.  
* **Validation:** tsc / tests / build.  
* **Expected benefit:** Dashboard overdue strip scales with past-due candidates, not full table size.

---

## 6. Database and query findings

### [QUERY-001] Prefer `job_dashboard_counts` RPC

* **Priority:** P1 · **Confidence:** High  
* **Affected location:** `supabaseJobRepo.dashboardCounts`  
* **Evidence:** Migration 040 defines RPC; scan path still existed as primary behaviour in practice before explicit `tryDashboardCountsRpc`.  
* **Fix applied:** Try RPC first; fall back to `dashboardCountsViaScan`.  
* **Expected benefit:** Single aggregate round-trip vs paginated full scan when RPC is deployed.

### [QUERY-002] Job-list quote enrich used `select("*")`

* **Priority:** P1 · **Confidence:** Confirmed  
* **Affected location:** `supabaseQuoteRepo.findByJobIds`  
* **Fix applied:** `QUOTE_JOB_LINK_SELECT` (id, number, value, status, job_id, updated_at, archived_at).  
* **Expected benefit:** Smaller payloads per list page (≤25 job ids).

### [QUERY-003] `needsCurrentFilter` materialised up to 5000 parents

* **Priority:** P1 · **Confidence:** Confirmed  
* **Affected location:** `modules/jobs/api/list.ts`  
* **Evidence:** Special path called `findManyWithCount` with `take: 5000`, then `filterByCurrentDisplay` + slice. After commit `00454e4`, `enrichRevisionFamily` no longer overlays revision status onto parents, so the JS filter matched parent columns only — identical to SQL `where` but without pagination.  
* **Root cause:** Leftover from current-revision overlay list semantics.  
* **User impact:** Slow filtered “originals only” list views; wrong totals possible when >5000 originals.  
* **Fix applied:** Removed `needsCurrentFilter` / `filterByCurrentDisplay`; status, unassigned, and deadline filters always go to SQL.  
* **Risk of change:** Low vs current post-overlay behaviour; aligns list with parent-owns-status. Dashboard overdue KPI still uses current-revision overlay (intentional; list `/jobs?deadline=overdue` was already SQL without `onlyOriginals`).  
* **Validation:** tsc / unit / e2e / build.  
* **Expected benefit:** Filtered originals lists stay O(page size) instead of O(all originals).

### [QUERY-004] Hold list full enrich on Job List

* **Priority:** P1 · **Confidence:** Confirmed  
* **Affected location:** `JobsTable` → `/api/hold-list`  
* **Fix applied:** `?fields=clientId` + `allActiveClientIds()` (no client/job-stat enrichment).  
* **Expected benefit:** Job List drops hold enrichment queries entirely.

### [QUERY-005] Hold preview loaded all rows then sliced

* **Priority:** P2 · **Confidence:** Confirmed  
* **Fix applied:** `allActiveHoldsPreview(take)` with SQL `.limit()`.  

### [DB-001] Indexes — no new migration

* **Priority:** P3 · **Confidence:** High  
* Existing `idx_jobs_list_sort_key_active`, `idx_jobs_required_by_active_open`, `idx_client_holds_active_added` already match list/deadline/hold patterns.  
* **Fix applied:** None (avoid speculative indexes).  

---

## 7. React rendering findings

### [RENDER-001] Job rows already memoised

* **Priority:** P3 · **Confidence:** Confirmed  
* `JobTableRow` / `JobMobileCard` use `memo`. Status/designer updates use targeted SWR mutate with `revalidate: false`.  
* **Fix:** None required.

### [RENDER-002] Search debounce present

* **Priority:** — · **Confidence:** Confirmed  
* `useDebouncedValue(search, 280)` — no per-keystroke API spam.

### [RENDER-003] Virtualization not justified

* **Priority:** P3 · **Confidence:** High  
* Page size 25 for ~5–10 users — virtualization would add complexity without clear benefit.

### [STATE-001] Hold + designers are independent SWR keys

* **Priority:** P2 · **Confidence:** Confirmed  
* They do not block job list paint (`keepPreviousData`); jobs can render while holds/designers resolve.  
* After fix, holds path is much cheaper.

---

## 8. Network and data-fetching findings

### [PERF-001] Job detail sequential enrichments

* **Priority:** P1 · **Confidence:** Confirmed  
* **Fix applied:** Parallel `enrichJobsWithLinkedQuotes` + parent + latest/count. Billing remains after revision id is known (dependency).  

### [PERF-002] Revisions `select` narrowed

* **Priority:** P2 · **Confidence:** Confirmed  
* `revisionsForJob` now uses `buildJobListSelect()` instead of `*`.  

### [PERF-003] No realtime Job List reload storms

* **Priority:** — · **Confidence:** Confirmed  
* No `postgres_changes` / channel subscriptions in app modules.

### [PERF-004] Drawing-sort fallback can still load all matching IDs

* **Priority:** P2 (remaining) · **Confidence:** High  
* If `list_sort_key` missing, `findManyDrawingSortInMemory` loads all matching id/drawing rows. Ensure migration 023 applied in production.

---

## 9. Bundle findings

### [BUNDLE-001]

* **Priority:** P3 · **Confidence:** Medium  
* Job detail already dynamic-imports documents panel (`ssr: false`).  
* No permanent bundle analyser added. Production build succeeded; no unusually large new client imports introduced by this work.  
* Pre-existing lucide icons and date-fns usage on other pages left unchanged.

---

## 10. Changes implemented

1. Dashboard RPC preference + overdue candidate query (`modules/jobs/supabase/repository.ts`)  
2. Slim quote link select (`modules/quotes/supabase/repository.ts`)  
3. Latest-revision + count APIs wired through supabase/sqlite job services  
4. Job detail GET parallelisation and `include=current` gating (`modules/jobs/api/by-id.ts`)  
5. Hold list `fields=clientId` mode + SQL-limited preview  
6. Jobs table uses slim hold endpoint  
7. Removed obsolete `needsCurrentFilter` 5k materialisation — SQL filters + pagination (`modules/jobs/api/list.ts`)  
8. Slim `revisionsForJobs` / `findLatestRevisionsForParents` selects  
9. Opt-in list timing via `ORYX_PERF_LOG=1` in development  
10. SWR fetcher accepts AbortSignal for obsolete-key cancellation  
11. Notifications use `allActiveWithNames` (no job-stat enrich)  
12. Job/parent detail skip remount when RSC fallback present; RSC seeds current revision + quotes  
13. Revisions work-items path resolves parent without double `getDashboard`  
14. Billing snapshots: `forWorkItems` + `findByParents` (no N+1)  
15. Client list meta: parallel counts + holds  
17. Designers endpoint: active names only (no password hashes)  
18. Notifications: less refetch on clear/open; leave in parallel; slim hold/client selects  
19. Calendar: parallel category/event loads; reuse users in EventDialog  
20. Client active-job counts via head counts; optimistic job/quote/client edits  

---

## 11. Database migrations added

**None.** Existing 035 / 040 cover confirmed patterns. Speculative indexes avoided per working rules.

---

## 12. Validation performed

| Check | Result |
|-------|--------|
| Typecheck | Pass |
| Lint | Pass (0 errors; 2 pre-existing warnings in quotes PDF) |
| Unit tests | 149 pass |
| E2E | 30 pass |
| Production build | Pass |

---

## 13. Remaining recommendations

1. Confirm migration **023** / **040** applied on production Supabase (`list_sort_key` + dashboard RPC).  
2. If product later needs “filter originals by latest-revision status”, add denormalised parent display columns or an RPC — do not revive the 5k JS filter.  
3. Optional: SQL `GROUP BY` / RPC for `activeJobCountsForClients` if client directories grow large.  
4. Optional React Profiler recording on Job List in a browser with production-like data.

---

## 14. Items not verified

* Live production Supabase EXPLAIN / latency  
* Exact before/after ms for Job List or dashboard  
* Production whether RPC 040 is deployed (code falls back safely)  
* Memory profiles / React Profiler recordings in browser  
* Bundle analyser flamegraphs  

---

## 15. Before-and-after comparison

| Area | Before | After |
|------|--------|-------|
| Dashboard counts | Slim full-table scan (or unused RPC) | Prefer `job_dashboard_counts` RPC; scan fallback |
| Overdue preview | Full table pagination | Indexed past-due candidates (≤500) + family overlay |
| Job detail current revision | Load all revision rows | 1 latest row + head count; parallel with enrich/parent |
| Job List holds | Full hold enrich (clients + job stats) | `client_id` only |
| Quote enrich | `select("*")` | Slim link columns |
| Revisions list select | `*` | Job list column set |
| Originals + status/deadline | Up to 5k rows + JS filter | SQL filter + page-sized fetch |
| Notifications holds | Full job-stat enrich every poll | Names/reasons only |
| Job card open | RSC + client remount of detail | RSC seed (enriched); skip remount |
| Billing export | N history + N sibling queries | 1+1 bulk queries |
| Indexes | — | No change |
| Wall-clock | Not measured | Not measured (no invented numbers) |

---

## Finding index (quick)

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| BUG-001 | Detail full revision load | P1 | Fixed |
| BUG-002 | Overdue full scan | P1 | Fixed |
| QUERY-001 | Dashboard RPC | P1 | Fixed |
| QUERY-002 | Quote `*` on list enrich | P1 | Fixed |
| QUERY-003 | needsCurrentFilter 5k load | P1 | Fixed |
| QUERY-004 | Hold enrich on Job List | P1 | Fixed |
| QUERY-005 | Hold preview slice | P2 | Fixed |
| PERF-001 | Detail sequential fetches | P1 | Fixed |
| PERF-002 | revisionsForJob select | P2 | Fixed |
| PERF-004 | Drawing sort fallback | P2 | Remaining (ops) |
| PERF-005 | SWR AbortSignal | P2 | Fixed |
| PERF-006 | DEV list timing (`ORYX_PERF_LOG`) | P3 | Fixed |
| PERF-007 | Notifications full hold enrich | P1 | Fixed |
| PERF-008 | Job open remount duplicate | P1 | Fixed |
| PERF-009 | Revisions double getDashboard | P1 | Fixed |
| PERF-010 | Billing snapshot N+1 | P1 | Fixed |
| PERF-011 | Client meta sequential | P2 | Fixed |
| PERF-012 | Quotes status full mutate | P2 | Fixed |
| PERF-013 | Designers full users select | P1 | Fixed |
| PERF-014 | Notifications clear/open refetch | P1 | Fixed |
| PERF-015 | Calendar sequential + duplicate users | P1 | Fixed |
| PERF-016 | Client counts row shipping | P2 | Fixed |
| PERF-017 | Edit mutations full mutate | P2 | Fixed |
| DB-001 | New indexes | P3 | Not needed |
| RENDER-001–003 | Memo / debounce / virtualization | P3 | OK / skip |
| BUNDLE-001 | Bundle weight | P3 | No change |
