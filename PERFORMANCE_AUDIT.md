# Performance Audit — ORYX Scaffold Design

**Date:** 2026-08-05  
**Branch:** `cursor/jobs-performance-aa4d`  
**Scope:** Full application, with priority on Jobs page / Jobs List  
**Constraint:** No workflow, permission, schema (except additive indexes), or visual redesign changes unless essential for performance

---

## Method

1. Traced Jobs Register route load → SWR keys → `/api/jobs` → Supabase repo → row virtualisation → inspector → mutations.
2. Grepped for `select('*')`, static heavy imports, dual mount trees, full-list `mutate()` after field patches, and realtime usage.
3. Reviewed existing indexes (`012`, `019`, `023`, `035`).
4. Measured what is available in this environment (code-path / bundle analysis). Exact browser React Profiler and Lighthouse runs require a seeded production-like dataset; method and expected deltas are noted below.

---

## Before / after measurements

| Metric | Before (observed / code-path) | After (target / verified) | Method |
| --- | --- | --- | --- |
| Jobs list API path with `scope` + `includeCounts` | Loads up to **5,000 full list rows** + revision sidecars before paging | Slim overlay columns for candidates, **full list select only for current page** | Code review + API path change |
| Quote enrichment on Jobs Register | Extra `quotes.findByJobIds` on every list page | Skipped unless `includeQuotes=true` (register does not send it) | Code path |
| Status / designer change | Full `mutateClassic()` / `mutateWork()` refetch | Optimistic SWR cache patch; background revalidate optional | Code path |
| `designers ?? []` identity | New `[]` each render → breaks row `memo` | Stable `EMPTY_DESIGNERS` | Code path |
| Desktop + mobile trees | Both always mounted (CSS hide) | After media query ready, **only active viewport** mounts | Code path |
| JobsInspector in register chunk | Eager import | `React.lazy` + Suspense | Bundle / code path |
| Search debounce | 280 ms | 200 ms (within 150–250 ms) | Code path |
| Inspector open | List row data first; then by-id + revisions + deferred docs/quotes | Unchanged pattern; prefetch on row hover/focus; keepPreviousData on primary | Code path |
| Duplicate revisions fetch | by-id loads revisions for `currentRevision`; separate `/revisions` for timeline | Primary by-id kept; revisions fetch retained for timeline richness (documented as remaining) | Audit |
| JS route chunks | Job map already dynamic; CommandPalette static in shell | CommandPalette dynamic | Bundle |
| Supabase realtime | None in app | N/A | Grep |
| Lighthouse / React Profiler | Not run in CI agent (no seeded UI session) | Recommend local: Jobs list cold load, select row, status change | Manual |

---

## Phase 1 — Issue register

### Jobs List (priority)

| ID | Location | Cause | User impact | Recommended fix | Risk | Implemented |
| --- | --- | --- | --- | --- | --- | --- |
| J1 | `modules/jobs/api/list.ts` `needsBulkEnrich` | Scope / `includeCounts` / current-work filters load ≤5000 full parent rows then page in Node | Slow initial load and every scope/filter change | Slim select for overlay + hydrate page via `findManyByIds` / list select | Medium | **Yes** |
| J2 | `list.ts` + `enrich-linked-quotes.ts` | Always enriches page with linked quotes | Extra DB round-trip; unused by register rows (inspector loads quotes separately) | Gate on `includeQuotes=true` | Low | **Yes** |
| J3 | `jobs-register.tsx` `handleStatusChanged` | Full list revalidate after status/designer PATCH | List flicker / wait after every field change | Optimistic SWR cache update; soft revalidate | Low | **Yes** |
| J4 | `jobs-register.tsx` `designers ?? []` | Unstable empty array breaks `memo` on rows/table | Selecting unrelated state re-renders all rows | Module-level `EMPTY_DESIGNERS` | Low | **Yes** |
| J5 | `jobs-register.tsx` desktop + mobile | Both layout trees always mounted | Double React work on every update | Mount only active breakpoint after `mediaReady` | Low | **Yes** |
| J6 | `jobs-register.tsx` inspector import | Eager `JobsInspector` | Larger Jobs chunk; slower first paint | `lazy()` + Suspense | Low | **Yes** |
| J7 | Search debounce 280 ms | Slightly above preferred band | Negligible; align to 200 ms | `useDebouncedValue(..., 200)` | Low | **Yes** |
| J8 | Row hover → inspector | No prefetch of detail | Panel waits on network after click | `preload` by-id (+ revisions) on pointer enter / focus | Low | **Yes** |
| J9 | `jobs-inspector.tsx` | Parallel by-id and `/revisions` (by-id also reads revisions for current) | Duplicate revision query when opening panel | Longer-term: return chain from by-id or drop redundant path | Medium | **No** (documented) |
| J10 | Virtualisation | Desktop uses `@tanstack/react-virtual`; mobile maps all page rows (≤100) | Fine at page size 100 | Do not virtualise mobile blindly | — | N/A (OK) |
| J11 | Create job | Awaits full `mutateClassic()` before selecting | Delay before inspector opens | Optimistic prepend + select immediately | Low | **Yes** |
| J12 | `findManyByIds` | `select('*')` | Oversized hydrate payloads | Use `JOB_LIST_SELECT` | Low | **Yes** |

### App-wide

| ID | Location | Cause | User impact | Recommended fix | Risk | Implemented |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | `stitch-top-bar.tsx` | Static `CommandPalette` | Shell JS larger on every page | `next/dynamic` when open / on demand | Low | **Yes** |
| A2 | `notifications-menu.tsx` | Poll every 5 min globally | Background work on all pages | Defer to open / badge endpoint (future) | Medium | **No** |
| A3 | Calendar page | Always fetches `/api/users`; static dialogs | Extra request for non-admins; larger calendar chunk | Gate users on admin; dynamic dialogs | Low | **Yes** (users gate) |
| A4 | Billing handoffs | `select('*')`, page size up to 200 | Heavy queue loads | Column select + lower default (future) | Low | **No** |
| A5 | Password vault list | Selects encrypted password column then blanks | Extra IO | List select without `password_enc` | Low | **Yes** |
| A6 | `user-context.tsx` | Single context for state + actions | Shell-wide rerenders on identity change | Split contexts (future) | Medium | **No** |
| A7 | Hold / users lists | Some `select('*')` | Oversized list payloads | Narrow selects (partial: vault) | Low | Partial |
| A8 | Job map | Leaflet already dynamic | Good | Keep | — | N/A |
| A9 | Realtime | No client subscriptions | N/A | Avoid adding broad channels | — | N/A |
| A10 | SWR defaults | `keepPreviousData`, dedupe 2s, no focus revalidate | Good baseline | Preserve; avoid second cache | — | N/A |

### Supabase / indexes

| ID | Location | Cause | User impact | Recommended fix | Risk | Implemented |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Parent-only list + sort | Partial indexes exist for status/archived/sort; parent filter common | Scope list scans | Additive partial index on parents + `list_sort_key` | Low | **Yes** (`044_jobs_list_parent_indexes.sql`) |
| S2 | Client-filtered parents | `client_id` index exists but not parent-scoped with sort | Client filter lists | `(client_id, list_sort_key)` where parent + active | Low | **Yes** |
| S3 | Revision sidecar by parent | `idx_jobs_parent_job_id` exists | OK | Optional composite `(parent_job_id, revision_letter)` | Low | **Yes** |
| S4 | Destructive changes | — | — | None; EXPLAIN ANALYZE in staging after deploy | — | N/A |

---

## Recommended EXPLAIN ANALYZE (staging)

```sql
explain analyze
select id, list_sort_key, created_at
from public.jobs
where archived_at is null
  and parent_job_id is null
order by list_sort_key, created_at
limit 100;

explain analyze
select id, parent_job_id, revision_letter, status, designer, required_by_date, updated_at
from public.jobs
where parent_job_id = any($1::text[]);
```

---

## Remaining architectural bottlenecks

1. **Current-work / scope filtering in Node** still requires a candidate pass over many parents (now slim). True SQL-side filtering needs denormalised `current_status` / `current_work_type` on parents (schema change — out of scope).
2. **Inspector dual revision fetch** (by-id + `/revisions`).
3. **Notifications global poll** and **unsplit user context**.
4. **Billing / hold / users** wide selects.

---

## Preservation confirmation

- Workflows, permissions, RLS, and visual styling intentionally unchanged except where mount/lazy behaviour is invisible.
- Admin / Engineer (/ Accounts if present) roles preserved; designer lists and job-create gates untouched by this work.
- No new major client caching library; SWR configuration extended in place.

---

## Verification

- TypeScript (`tsc --noEmit`): **pass**
- ESLint: **pass** (0 errors; pre-existing warnings unrelated to this work)
- Production build (`npm run build`): **pass**
