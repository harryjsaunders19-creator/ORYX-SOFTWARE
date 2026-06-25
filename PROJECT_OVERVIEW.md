# Oryx Design Job Tracker — Project Overview

This document explains how the system works from a business-rules perspective. It is written so a new developer or an AI assistant can become productive without reading the entire codebase first. **Keep this file updated whenever a workflow, rule, or schema field changes** — it is documentation of intent, not just a description of current code, so stale sections are worse than missing ones.

---

## 1. Tech stack

- **Framework:** Next.js 16 (App Router), TypeScript, React 19
- **Database:** SQLite via `better-sqlite3`, file at `prisma/oryx.db`, accessed through `lib/db.ts` (no ORM — hand-written SQL with prepared statements)
- **Styling:** Tailwind CSS v4, Radix UI primitives, Lucide icons
- **PDF generation:** `pdf-lib` (quotes)
- **Excel export:** `xlsx` (SheetJS) (billing queue export)
- **IDs:** `@paralleldrive/cuid2` for jobs/clients, `nanoid` for internal records (history rows, batch items, etc.)

There is no Prisma despite the `prisma/` folder name — that folder only holds the SQLite file and the seed script. All schema and queries live in `lib/db.ts`.

Run `npm run dev` for local development, `npm run db:seed` to populate sample data, `npm run db:reset` to wipe and reseed.

---

## 2. Core business workflow

The system tracks **work items** for a structural/temporary-works design consultancy. Everything flows through one table, `Job`, regardless of whether the item is a design drawing, a revision, a site visit, a survey, or an inspection. This is a deliberate design choice: one workflow (status, designer assignment, billing, deadlines) serves every work item type rather than maintaining parallel systems.

The end-to-end flow for the most common path (a new design):

1. A client (existing or newly created) requests work → a **Job** is created with status `NEW_REQUEST`.
2. A designer is assigned and works the job through `IN_DESIGN` → `CHECKING` → `ISSUED`.
3. Once `ISSUED`, the job becomes eligible for the **billing queue** (export to accounts) and the **invoice queue** (formal invoicing).
4. Optionally, before step 1, the work may have started as a **Quote** that the client accepted and that was converted into a Job.
5. If the client requests a change after issue, a **Revision** is created against the original job — a first-class Job row of its own, sharing the same drawing number with a suffix.

---

## 3. Drawing numbering rules

Every work item gets a unique reference number (`Job.drawingNumber`, `UNIQUE NOT NULL`). The format depends on `Job.itemType`:

| Item type | Format | Example | Sequence source | Resets |
|---|---|---|---|---|
| `DESIGN` | `YY/ORYX/MM/NNN` | `26/ORYX/06/014` | `DrawingSequence` table, keyed by `YYMM` | Every calendar **month** |
| `REVISION` | `<parent drawingNumber> Rev <letter>` | `26/ORYX/06/014 Rev A` | Derived from parent — no independent sequence | N/A |
| `SITE_VISIT` | `SV-YYYY-NNN` | `SV-2026-001` | `RefSequence` table, prefix `SV` | Every calendar **year** |
| `SURVEY` | `SRV-YYYY-NNN` | `SRV-2026-001` | `RefSequence`, prefix `SRV` | Every calendar year |
| `INSPECTION` | `INS-YYYY-NNN` | `INS-2026-001` | `RefSequence`, prefix `INS` | Every calendar year |

Implementation: `lib/drawing-number.ts` (`formatDrawingNumber`, `getYearMonthKey`) for Design; `sequenceDb.nextSequence()` and `sequenceDb.nextRefNumber()` in `lib/db.ts` for the rest. Both sequence tables use a SQLite transaction to atomically read-increment-write, so concurrent job creation cannot produce duplicate numbers.

`RefSequence` is also reused for two non-work-item references that follow the same `PREFIX-YYYY-NNN` pattern:
- **Quotes:** `Q-YYYY-NNN` (prefix `Q`)
- **Billing export batches:** `BATCH-YYYY-NNN` (prefix `BATCH`)

Non-Design item types **never require a drawing number from the user** — `lib/constants.ts`'s `isNonDrawingType()` flags this, and the job creation form skips the field entirely for those types.

---

## 4. Revision rules

- A revision is **not a separate table** — it is a normal `Job` row with `itemType = 'REVISION'`, `parentJobId` set to the original job's id, and `revisionLetter` set (`A`, `B`, `C`, …).
- **Only an original job can have a revision created against it.** `POST /api/jobs/[id]/revisions` rejects the request with HTTP 422 if the target job already has a `parentJobId` (i.e. is itself a revision) — this prevents revision-of-revision chains.
- The next available letter is computed automatically (`nextRevisionLetter()` in `lib/constants.ts`, scanning existing children for the lowest unused letter A–Z), but an explicit letter can be supplied in the request body and will be validated for both format and uniqueness.
- A revision **inherits** address, type of works, client, and requested-by from its parent, but always starts fresh: `status = NEW_REQUEST`, `designer = ""` (unassigned). It does not inherit the parent's quote/commercial fields.
- Revisions count separately in commercial and dashboard stats (`jobDb.countWhere({ onlyRevisions: true })`, `groupByItemType()`).

---

## 5. Status definitions

`Job.status` is one of four values, defined in `lib/constants.ts` (`JOB_STATUSES`):

| Status | Meaning |
|---|---|
| `NEW_REQUEST` | Just created, not yet started. Default for every new job/revision. |
| `IN_DESIGN` | Actively being worked on by the assigned designer. |
| `CHECKING` | Design complete, under technical review before issue. |
| `ISSUED` | Final and sent to the client. This is the gate for billing and invoicing eligibility. |

Every status transition is recorded in `StatusHistory` (full audit trail — `fromStatus`, `toStatus`, `changedBy`, `changedAt`, optional `note`), written automatically inside `jobDb.create()` and `jobDb.update()`. This table is the single source of truth for "who changed what status, when" and is never pruned.

There is no "cancelled" or "on hold" job status — if a client should not receive new work, that is handled by the **Client Hold List** (§7), which is independent of any individual job's status.

---

## 6. Client management rules

Clients live in their own `Client` table (`id`, `name`, `nameLower`, `contactName`, `email`, `phone`, `billingAddress`, `notes`, `active`, timestamps). `Job.clientCompany` (a plain string) is preserved for backwards compatibility and is always kept in sync with `Client.name` whenever a job is linked to a client record via `Job.clientId`.

**Duplicate prevention:** `Client.nameLower` has a `UNIQUE` constraint at the database level. Before insert, the API (`POST /api/clients`) checks `clientDb.findByName()` (case-insensitive) and returns HTTP 409 with `{ error, existing }` if a match is found, so the UI can offer "view existing client" instead of silently failing.

**Archiving, not deleting:** `Client.active` is `1` or `0`. `DELETE /api/clients/[id]` archives (`active = 0`) a client if it has any jobs; only a client with zero jobs is hard-deleted. Archived clients are excluded from the searchable combobox (`/api/clients/search`) by default but remain visible in the full client list with a "Show archived" toggle.

**Linking jobs to clients:** the job creation form uses `ClientCombobox`, a searchable dropdown (`/api/clients/search?q=`) that also supports inline creation of a brand-new client without leaving the job form. When a job is saved, both `clientId` and `clientCompany` are written — `clientCompany` is denormalized so existing reports and filters that predate the `Client` table continue to work unmodified.

**Inline client creation (`QuickCreateClientModal`):** `components/quick-create-client-modal.tsx` is a shared modal — Company Name (required), Contact Name, Email, Phone, Address — wired to any `ClientCombobox`'s `onCreateNew` callback. It posts to `POST /api/clients`, and if that returns HTTP 409 (duplicate name), it transparently falls back to the `existing` client returned in the error body rather than blocking the user. On success the caller receives the new (or existing) `Client` and is expected to set both its `clientId` and `clientCompany` fields. This modal renders as a nested `Dialog` inside whatever dialog hosts the parent form (Radix dialogs portal to `document.body`, so nesting is safe) and is currently used by both the job form (`components/job-form.tsx`) and the quote form (`app/quotes/page.tsx`'s `QuoteForm`) — any future form that needs a client field should reuse it rather than re-implementing inline client creation.

**Migration of legacy data:** on startup, `migrateClientsFromJobs()` (in `lib/db.ts`) scans for any `Job.clientCompany` values that don't yet have a matching `Client` record, creates one, and back-fills `Job.clientId`. This runs every time the app starts and is idempotent (it only processes rows where `clientId IS NULL`).

**Client stats** (shown on the client detail page, `clientDb.stats()`): total jobs, active jobs (status not `ISSUED`), issued jobs, total revisions, total quoted value (`SUM(quoteValue)` across that client's jobs), total invoiced value (`SUM` across `InvoiceItem` joined to that client's jobs).

---

## 7. Hold list rules

The hold list is an **advisory, non-blocking warning system** — it never prevents an action, it only surfaces a warning so a human can make the call. Records are never deleted, only marked `REMOVED`, preserving a full audit history of every hold ever placed.

**Schema (`ClientHold`):** `clientId`, `status` (`ACTIVE` | `REMOVED`), `reason`, `notes`, `addedBy`, `addedAt`, and on removal `removedBy`/`removedAt`/`removedReason`.

**Placing a hold is idempotent:** `holdDb.addHold()` checks for an existing active hold on that client first — if one exists, it updates the reason/notes/addedBy in place rather than creating a duplicate row. There is at most one `ACTIVE` hold per client at any time (enforced in application logic, not a DB constraint).

**Where the warning appears:**
- The client combobox (job creation/edit forms) flags held clients in red with the hold reason visible in the dropdown.
- Submitting a job form for a client with an active hold shows a full-screen red modal: "CLIENT ON HOLD — This client is currently restricted from receiving new work," with the reason displayed, and two choices: **Cancel job creation** or **Continue anyway**. Choosing "Continue anyway" proceeds with normal job creation — nothing is blocked at the API level.
- The jobs table shows a red warning icon plus an "On Hold" badge next to the client name for any row whose `clientId` is in the active-holds set (loaded once via `GET /api/hold-list`).
- The client detail page shows a prominent banner with reason, date added, and notes when that client has an active hold.

**Dedicated page:** `/clients/hold-list` lists every actively-held client with reason, date added, active job count, outstanding quote value, and notes, with actions to edit the reason, or remove the hold (which requires `removedBy` and accepts an optional `removedReason`).

**Dashboard:** `clientsOnHold` count (`holdDb.activeCount()` — counts distinct clients with an active hold) is surfaced as a KPI.

---

## 8. Quote workflow

**Quotes are a separate concept from `Job.quoteValue`.** This is the single most important distinction to understand in this codebase:

- **`Job.quoteValue`** is a commercial field directly on any job/revision/site-visit row — the price agreed or estimated for that specific work item, set whenever a job is created or edited. It feeds `commercialDb` aggregates (total quoted value, total issued value, average job value) and the Commercial report.
- **The `Quote` table** is a formal pre-job quotation document — issued *before* a job exists, with its own status lifecycle, PDF generation, and a one-way conversion path into a Job. A `Quote` and a `Job` are linked only after conversion, via `Quote.jobId`.

**Quote fields:** quote number, client (id + denormalized company name), contact name, address, description, quote value, quote date, expiry date, status, notes, who created it, who prepared the PDF, and the generated PDF's storage path.

**Selecting the client on a quote:** the quote form's `ClientCombobox` supports both picking an existing client and inline creation via the shared `QuickCreateClientModal` (§6) — a brand-new client never needs to exist in the system before a quote can be raised for them. Selecting or creating a client sets both `clientId` and `clientCompany` on the form. `POST /api/quotes` itself only hard-requires `clientCompany` (non-empty); if `clientId` is omitted it falls back to `clientDb.findByName(clientCompany)` and otherwise stores `clientId: null` — so a quote can technically exist with just a free-text company name and no linked `Client` row, but the UI's quick-create flow means this is now the exception rather than the default behaviour.

**Quote number format:** `Q-YYYY-NNN` (e.g. `Q-2026-001`), generated via `sequenceDb.nextRefNumber("Q")`, resetting each calendar year.

**Status lifecycle:** `DRAFT` → `SENT` → `ACCEPTED` or `REJECTED`, with `EXPIRED` as a separate terminal state. There is no automatic expiry job — `EXPIRED` must currently be set manually (a candidate for a future scheduled task). Status changes are simple `PATCH` updates; there is no dedicated status-history table for quotes (unlike jobs).

**PDF generation:** `POST /api/quotes/[id]/pdf` builds an A4 PDF with `pdf-lib` (logo mark, quote number, client details, word-wrapped description, a highlighted fee box, validity period, notes, and a "prepared by" footer), writes it to `public/quote-pdfs/<quoteNumber>.pdf`, and stores that relative path in `Quote.pdfPath`. Calling the endpoint again regenerates and overwrites the file at the same path. Generated PDFs are gitignored (`/public/quote-pdfs/*.pdf` in `.gitignore`) — they're regenerable artifacts, not source.

**Quote → Job conversion** (`POST /api/quotes/[id]/convert`):
- Only allowed when `status = 'ACCEPTED'` and the quote has not already been converted (`jobId IS NULL`) — otherwise HTTP 422/409.
- Auto-populated from the quote onto the new job: `address`, `clientCompany`/`clientId`, `requestedBy` (falls back to `clientCompany` if no contact name), `notes`, `quoteValue`, `quoteReference` (set to the quote number), `quoteDate`. The description is also copied into `typeOfWorks` (truncated to 100 characters as a best-fit, since `Job` has no long-form description field).
- The user supplies only: **designer** and **required-by date**. The drawing number is generated automatically using the normal Design sequence — the user never enters it.
- The new job is always `itemType = 'DESIGN'`, `status = 'NEW_REQUEST'`.
- After conversion, `Quote.jobId` is set, linking the two records permanently; the quotes list shows a "View job →" link for converted quotes.

**Commercial reporting from quotes** (`quoteDb.stats()`, surfaced via `/api/stats` and the dashboard):
- `quotesSent`, `quotesAccepted`, `quotesRejected`, `quotesTotalValue` (sum across all quotes regardless of status), `quotesWonValue` (sum of `ACCEPTED` quotes only).
- **Conversion rate formula:** `accepted / (accepted + rejected)`. Draft, sent, and expired quotes are excluded from both numerator and denominator — the rate only measures decided quotes, not the full pipeline.

---

## 9. Billing workflow — superseded, see §19

This section originally documented an invoice queue + billing-export queue (`/invoicing`, `/billing`, `Invoice`/`ExportBatch` tables). The business decided the application should no longer manage invoicing or billing exports internally. That whole workflow has been replaced by the **Ready For Invoicing** handoff queue — see **§19** for the current design, and **§20** for the Accounts Handover export that replaced the old billing-export flow described here previously.

The `Invoice`/`InvoiceItem`/`InvoiceSequence`/`ExportBatch`/`ExportBatchItem` tables and `Job.invoiceId`/`billingStatus`/`billingBatchId` columns referenced by the old version of this section still exist in the schema (kept only so any historical data in a deployed database isn't destroyed) but nothing in the current codebase reads or writes them.

---

## 10. Site visit workflow

Site Visit is one of the five `WORK_ITEM_TYPES` (alongside Design, Revision, Survey, Inspection) and shares the entire Job lifecycle — same four statuses, same designer/engineer assignment field, same deadline tracking, same billing/invoicing eligibility. There is nothing structurally special about a site visit beyond its reference number format and the absence of a required `typeOfWorks` value.

- **Reference format:** `SV-YYYY-NNN` (§3).
- **No drawing number required** — the creation form skips the "Type of works" scaffold-category field entirely for this type (`isNonDrawingType()` / `requiresTypeOfWorks: false` in `lib/constants.ts`).
- Common fields apply identically to a site visit as to a design job: client, address, requested by, assigned designer/engineer, status, quote value, invoice status.
- A site visit can be quoted, issued, billed, and invoiced exactly like a design job — the billing queue, invoice queue, and commercial reports all operate on `itemType` being irrelevant to eligibility; only `status`/`invoiceId`/`billingStatus` matter.
- Survey and Inspection follow the identical pattern with their own prefixes (`SRV-`, `INS-`) — they are not separately documented because the rules are identical to Site Visit, only the prefix differs.

---

## 11. Deadline workflow

Every work item (`Job` row, any `itemType`) supports two independent date fields:

| Field | Set by | Meaning | Can change after creation? |
|---|---|---|---|
| `dateCreated` | Server, automatically, at creation (`now()`) | When the job was created in the system | No — never accepted from any form submission or API body |
| `requiredByDate` | User, optional, via the job form | The deadline for completing the work | Yes, freely editable |

**These two fields must never be conflated.** A historical bug (now fixed) arose from a confusingly-labelled third field ("Requested date") that users mistook for the deadline; that field has been removed from the create/edit form entirely. `requestedDate` still exists as a DB column for backwards compatibility with old records but is no longer exposed in the UI.

**Calculation (`getDeadlineInfo()` in `lib/utils.ts`):** given `requiredByDate`, computes `daysRemaining` (signed integer, midnight-to-midnight local time, deliberately avoiding time-of-day drift), and a `severity` of `overdue` | `today` | `soon` (≤7 days) | `normal` | `none` (no deadline set). This same function drives both the jobs-table deadline badge and the job detail page's deadline card.

**Overdue definition differs slightly at the SQL level versus the UI badge:** the database filters (`where.overdue`, `deadlineStats().overdueCount`, the dashboard's overdue list) all explicitly exclude jobs with `status = 'ISSUED'` — a completed job can never be "overdue" regardless of its deadline having passed. The pure date-math `getDeadlineInfo()` helper does **not** know about status; if you call it directly on an issued job's `requiredByDate` it will still report `overdue` if the date has passed. UI code that displays the badge on an issued job should be aware of this (currently the jobs table shows the badge regardless of status — only the *counts/filters* apply the ISSUED exclusion).

**Filtering:** the jobs API (`GET /api/jobs`) and `jobDb.findMany()` accept `overdue`, `dueToday`, `dueThisWeek` boolean flags, each translating to a `requiredByDate` comparison against SQLite's `date('now')`. The jobs table UI exposes these as filter pills (Overdue / Due today / This week) alongside the item-type and status filters.

**Dashboard:** `overdueCount`, `dueTodayCount`, `dueThisWeekCount` (`jobDb.deadlineStats()`) are surfaced as KPIs, with an explicit list of overdue jobs (`jobDb.overdueJobs()`, capped at 20, ordered soonest-overdue-first) shown prominently so the team can prioritise without leaving the dashboard.

---

## 12. Key files reference

| File | Purpose |
|---|---|
| `lib/db.ts` | All schema (`CREATE TABLE`), live migrations (`ALTER TABLE ADD COLUMN`, run idempotently on every startup), and every query function, grouped into `jobDb`, `clientDb`, `holdDb`, `quoteDb`, `invoiceDb`, `exportBatchDb`, `commercialDb`, `sequenceDb`, `historyDb`, `userDb` |
| `lib/types.ts` | Frontend-facing TypeScript interfaces — `Job`, `Client`, `Quote`, `ExportBatch`, `StatsData`, `User`, `Role`, form data shapes |
| `lib/constants.ts` | `JOB_STATUSES`, `WORK_ITEM_TYPES`, `WORKS_TYPES` (scaffold categories), revision letter helpers |
| `lib/permissions.ts` | The two-role permissions registry — `ROLES`, the `MODULES` access map (drives the sidebar and page guards), and `canViewCommercialValues()`, used only by `/api/stats` to gate the four restricted modules' aggregate totals. See §14. |
| `lib/auth.ts` | Server-side identity/role enforcement for API routes — `getCurrentUser()`, `getCurrentRole()`, `requireRole()`. The session cookie (`oryx_uid`) is the only piece real authentication will need to replace. See §14. |
| `lib/utils.ts` | `formatGBP`/`parseGBP`, deadline calculation (`getDeadlineInfo`, `deadlineBadgeClass`) |
| `lib/drawing-number.ts` | Design drawing number formatting |
| `components/client-combobox.tsx` | Searchable client picker with an `onCreateNew` escape hatch into inline client creation |
| `components/quick-create-client-modal.tsx` | Shared modal for creating a new `Client` inline (used by the job form and quote form) |
| `components/require-role.tsx` | Client-side page guard (`<RequireRole roles={["ADMIN"]}>`) — a UI convenience layered on top of the real API-level enforcement, not the boundary itself |
| `components/inline-edit-selects.tsx` | `InlineStatusSelect`/`InlineDesignerSelect` — the click-to-edit dropdowns used directly in the jobs table (§15) |
| `components/designer-combobox.tsx` | Free-text designer field with a typeahead of existing names — used in the job form and the convert-quote-to-job modal (§15) |
| `components/ui/dropdown-menu.tsx` | Radix dropdown-menu wrapper, styled to match `select.tsx`/`dialog.tsx` — powers the jobs table's per-row Quick Actions menu (§15) |
| `components/side-nav.tsx` | Sidebar — filters its links through `modulesForRole()` and hosts the "switch user" identity picker (pre-auth stand-in) |
| `app/api/**/route.ts` | One route file per resource/action — see the table below |
| `prisma/seed.ts` | Sample data generator (`npm run db:seed`) |

### API route map

Role column: **Both** = Admin and Engineer, identical access in almost every case (see §14 for the four routes/modules where it isn't — Billing, Invoicing, Commercial Dashboard, Users); **Admin** = `requireRole(["ADMIN"])`, 401/403s for anyone else.

| Route | Methods | Role | Purpose |
|---|---|---|---|
| `/api/jobs` | GET, POST | Both | List/filter/search jobs; create a job (Design/Site Visit/Survey/Inspection — not Revision). Not commercially restricted — both roles set and see the real `quoteValue`. |
| `/api/jobs/[id]` | GET, PATCH, DELETE | Both | Single job CRUD. Not commercially restricted. |
| `/api/jobs/[id]/assign` | POST | Both | Assign a designer |
| `/api/jobs/[id]/history` | GET, POST | Both | Status history + manual notes |
| `/api/jobs/[id]/revisions` | GET, POST | Both | List/create revisions of an original job |
| `/api/jobs/board` | GET | Both | All jobs for the kanban board |
| `/api/jobs/designers` | GET | Both | Distinct designer names already used on jobs — feeds the inline assign picker and `DesignerCombobox` (§15) |
| `/api/clients` | GET, POST | Both | List/create clients (duplicate-checked). GET includes `activeJobCount` and `onHold` per client (§15). |
| `/api/clients/[id]` | GET, PATCH, DELETE | Both | Client CRUD (DELETE archives if jobs exist). `stats.totalInvoicedValue` is `null` for Engineers (Invoicing-derived); `stats.totalQuotedValue` is not restricted. |
| `/api/clients/search` | GET | Both | Combobox search, annotates hold status |
| `/api/clients/[id]/hold` | GET, POST, DELETE | Both | Hold management for one client |
| `/api/hold-list` | GET | Both | All active holds, with stats. Not commercially restricted. |
| `/api/quotes` | GET, POST | Both | List/create quotes. Not commercially restricted — both roles set and see the real `quoteValue`. |
| `/api/quotes/[id]` | GET, PATCH, DELETE | Both | Quote CRUD. Not commercially restricted. |
| `/api/quotes/[id]/pdf` | POST | Both | Generate/regenerate the quote PDF — not Admin-only; Quotes aren't commercially restricted. |
| `/api/quotes/[id]/convert` | POST | Both | Convert an accepted quote into a Job. Response is not redacted. |
| `/api/invoices` | GET, POST | **Admin** | List/create invoices |
| `/api/invoices/[id]` | GET, PATCH, DELETE | **Admin** | Invoice CRUD |
| `/api/invoices/queue` | GET | **Admin** | Issued, uninvoiced jobs |
| `/api/invoices/report` | GET | **Admin** | Monthly invoice report |
| `/api/billing/queue` | GET | **Admin** | Issued, uninvoiced, unexported jobs |
| `/api/billing/export/xlsx` | POST | **Admin** | Generate the Excel file (no side effects) |
| `/api/billing/export` | POST | **Admin** | Create the `ExportBatch` and mark jobs (the side-effecting call) |
| `/api/billing/batches` | GET | **Admin** | Export batch history |
| `/api/billing/batches/[id]` | GET | **Admin** | One batch's item snapshot |
| `/api/commercial` | GET | **Admin** | Commercial report data |
| `/api/stats` | GET | Both | Every dashboard KPI in one payload — commercial/billing/invoicing KPIs are `null` for Engineers, see §14 |
| `/api/health` | GET | **Admin** | DB connectivity/read/write check — treated as the "system settings" module |
| `/api/auth/session` | GET | Both | Returns the current identity from the `oryx_uid` cookie, or `{ user: null }` |
| `/api/auth/switch` | POST | Both | Pre-auth stand-in for login — sets the session cookie to an existing active user's id, no password. The one route real authentication replaces. |
| `/api/auth/logout` | POST | Both | Clears the session cookie |
| `/api/auth/users` | GET | Both | Deliberately unauthenticated minimal `{id,name,role}` list powering the "switch user" picker — not the management API |
| `/api/users` | GET, POST | **Admin** | List/create users (user management). New users default to `ENGINEER`. |
| `/api/users/[id]` | GET, PATCH | **Admin** | Edit name/email/role, disable/re-enable. Refuses to demote or disable the last active Admin. |

### Pages

Pages marked **Admin** are wrapped in `<RequireRole roles={["ADMIN"]}>` (`components/require-role.tsx`) — a UI convenience; the actual enforcement is the API routes they call.

| Route | Role | Purpose |
|---|---|---|
| `/` | Both | Dashboard — actionable sections (Overdue, Due This Week, Awaiting Checking, Ready For Billing, Clients On Hold, Unassigned), not generic statistics. Ready For Billing is Admin-only (Billing Queue). See §15. |
| `/jobs` | Both | Filterable/searchable jobs table. Status and designer are inline-editable; a per-row Quick Actions menu covers Create Revision/View Client/Open Quote/Delete. Not commercially restricted. See §15. |
| `/jobs/board` | Both | Kanban board by status |
| `/jobs/[id]` | Both | Job detail — status workflow, revisions, deadline card, activity log, Commercial panel. Not commercially restricted. |
| `/clients` | Both | Client list — search, create, edit, archive. Shows an On Hold badge and active job count per row. |
| `/clients/[id]` | Both | Client detail — stats, hold banner, grouped jobs. "Total invoiced" StatCard hidden for Engineers (Invoicing-derived); quoted value and the job list's Quote column are not restricted. |
| `/clients/hold-list` | Both | Dedicated hold list management. Not commercially restricted. |
| `/quotes` | Both | Quote list — search, filter, status transitions, PDF generation, convert-to-job. Not commercially restricted — Engineers have identical access to Admins here. |
| `/commercial` | **Admin** | Monthly commercial report |
| `/invoicing` | **Admin** | Invoice queue + invoice list |
| `/invoicing/report` | **Admin** | Monthly invoice report |
| `/billing` | **Admin** | Billing queue, Excel export |
| `/billing/history` | **Admin** | Export batch history |
| `/health` | **Admin** | DB health check — treated as the "system settings" module |
| `/users` | **Admin** | User management — create/edit/disable users, assign roles |

---

## 13. Conventions worth preserving

- **`clientCompany` (string) is always kept in sync with `Client.name`** whenever a `clientId` is set — never update one without the other.
- **Never hard-delete** `StatusHistory`, `ExportBatch`, `ExportBatchItem`, or `ClientHold` rows — these are audit trails by design; use status flags (`REMOVED`, etc.) instead.
- **New `Job` columns are added via the `addMissingJobColumns()` migration pattern** (`PRAGMA table_info` check + `ALTER TABLE ADD COLUMN`), not by editing the `CREATE TABLE IF NOT EXISTS` statement — the latter only affects brand-new databases, since `IF NOT EXISTS` makes it a no-op on every existing one. The same pattern (`addMissingQuoteColumns()`) applies to the `Quote` table.
- **Sequence generation always happens inside a `db.transaction()`** to guarantee atomicity under concurrent requests — follow this pattern for any new numbering scheme.
- **`Job.itemType` is immutable after creation** in the UI (the create form locks it once a job exists) even though nothing prevents changing it at the API level — preserve this UI constraint unless there's a specific reason to allow type changes.
- **Commercial restriction is the exception, not the default — and it's scoped to four specific modules** (Billing, Invoicing, Commercial Dashboard, Users; see §14). A new Job or Quote field, however money-related, should be readable and writable by both roles unless there's a specific reason to add it to that named list — don't reflexively gate new commercial-sounding fields. If a genuinely new Admin-only module or report is added, gate the whole route with `requireRole(["ADMIN"])` (lib/auth.ts) and add it to `lib/permissions.ts`'s `MODULES` registry, rather than redacting individual fields inside an otherwise-shared response — see how `/api/stats` and `/api/clients/[id]` do it (inline `canViewCommercialValues(role) ? value : null` on the specific restricted fields) if a restricted aggregate genuinely needs to live inside a shared payload.

---

## 14. Permissions & roles

Two roles: `ADMIN` (full access) and `ENGINEER` (everything except four specific Admin-only modules — see below). The model is deliberately simple — a single `User.role` column, no granular permission bits — because the brief was two roles, not a general-purpose ACL system.

**Where the rules live (`lib/permissions.ts`):**

- **`MODULES`** is the single source of truth for module-level access — an array of `{ key, label, href, roles }`. `components/side-nav.tsx` filters its links through `modulesForRole(role)`, so adding a module here is enough to make it appear/disappear from the sidebar correctly; there's no separate nav config to keep in sync.
- **Commercial restrictions apply to exactly four modules — nothing else:** Billing Queue (`/billing`), Revenue Reports (the Invoicing module — `/invoicing`, `/invoicing/report`), the Commercial Dashboard (`/commercial`), and User Management (`/users`). Each is a full route/page block via `requireRole(["ADMIN"])` (lib/auth.ts) and `<RequireRole>` (the page guard) — not a field redaction, since nobody but an Admin can call those routes at all. **Health/System Health is also Admin-only but is a separate, non-commercial restriction** (system diagnostics, not money) and isn't affected by anything in this section.
- **Jobs and Quotes are fully open to both roles, including money.** This was a deliberate correction — an earlier version of this codebase also redacted `quoteValue`/`quoteReference`/`quoteDate`/`commercialNotes` from Job and Quote responses for Engineers, and gated quote PDF generation to Admins. That broke real Engineer workflows (an Engineer creating a quote needs to price it) and has been removed: Engineers can create quotes, edit them, set the real value, generate PDFs, mark them sent/accepted/rejected, and convert an accepted quote to a job — all with full money figures visible, identically to an Admin. `canViewCommercialValues(role)` still exists, but only for the handful of Admin-only aggregate figures called out below — `/api/stats`, which bundles the four restricted modules' aggregate totals (`totalQuotedValue`/`totalIssuedValue`/`avgJobValue` for the Commercial Dashboard, `readyToInvoice`/`invoicesSent`/`invoicesPaid`/`outstandingValue` for Invoicing, `billingPending*`/`billingExported*` for Billing) into an otherwise fully-shared response — those specific fields stay `null` for Engineers, everything else in that payload (including `quotesTotalValue`/`quotesWonValue`, which is Quotes data) does not — plus the one `/api/clients/[id]` exception immediately below.
- One exception worth knowing: `GET /api/clients/[id]` returns `stats.totalInvoicedValue` as `null` for Engineers (it's Invoicing-derived) but `stats.totalQuotedValue` in full (Quotes-derived, not restricted) — the two figures on that page have different restriction status even though they sit next to each other in the same response.
- **"Deadlines", "Workload", and "Checking Queue"** from the original brief aren't separate pages in this codebase — deadlines are a feature of the Jobs module (§11), and a checking queue is just the Jobs table (or the dashboard's Awaiting Checking section, §15) filtered to `status = CHECKING`. Both are reachable through the Jobs module, which Engineers already have.

**Server-side enforcement (`lib/auth.ts`) — this is the actual security boundary, not the sidebar:**

- `getCurrentUser()` reads the `oryx_uid` cookie, looks the user up in the `User` table, and returns `null` if the cookie is missing, the user doesn't exist, or the user is disabled. The role is always re-read from the database on every request; a client can't influence its own role by sending one.
- `requireRole(roles)` is called at the top of any Admin-only route handler: `const auth = await requireRole(["ADMIN"]); if (auth instanceof NextResponse) return auth`. Returns 401 if nobody is signed in, 403 if the signed-in role isn't allowed.
- `getCurrentRole()` is for routes both roles can call but which redact fields — it defaults to `"ENGINEER"` (the more restrictive role) when nobody is signed in, so commercial data is never leaked just because no identity has been picked yet. Fail closed, not open.
- `components/require-role.tsx`'s `<RequireRole>` is the client-side page-level equivalent, used by wrapping each Admin-only page's default export around an inner component (e.g. `export default function CommercialPage() { return <RequireRole roles={["ADMIN"]}><CommercialPageInner /></RequireRole> }`). It only changes what renders — every API call the inner page makes is independently protected by `requireRole()` regardless, so this is convenience, not the boundary.

**User management (`User` table, `userDb` in `lib/db.ts`):** `id, name, email, emailLower, role, active, createdAt, updatedAt`. `POST /api/users` and `PATCH /api/users/[id]` are Admin-only (§12); new users default to `ENGINEER` unless an Admin deliberately sets `role: "ADMIN"`. Disabling is a flag (`active = 0`), never a delete — consistent with the rest of the app's archive-don't-delete convention (§13). `userDb.activeAdminCount()` backs a safety check in the PATCH handler: an Admin can't demote or disable the last remaining active Admin, which would lock everyone out of user management. On first run, `bootstrapDefaultAdmin()` in `lib/db.ts` inserts a single "System Admin" row if the `User` table is empty, guaranteeing there's always at least one Admin to start from.

**There is no real authentication yet — this is the deliberate seam for it.** `components/user-context.tsx`'s `UserProvider` fetches the current identity from `GET /api/auth/session` and exposes `{ user, role, isAdmin, switchUser, canAccess }`. `switchUser(userId)` calls `POST /api/auth/switch`, which sets the `oryx_uid` cookie after confirming the user exists and is active — no password, by design. This is rendered as a "Switch user" picker in the sidebar footer (`components/side-nav.tsx`), backed by `GET /api/auth/users` (deliberately unauthenticated — it's the equivalent of a login page listing who's available to sign in as, returning only `{id, name, role}`, never email). When real authentication is added: replace `/api/auth/switch` with a real `/api/auth/login` that verifies a password and sets the same cookie, delete `/api/auth/users` (a real login form doesn't enumerate accounts), and remove the `UserSwitcher` component from the sidebar. **Nothing else changes** — `lib/auth.ts`'s `getCurrentUser()`/`requireRole()`, every route's permission check, and the `User` table itself are already exactly what real auth would need; they only care about the cookie and the `User` row, never about how the cookie got set.

---

## 15. Jobs table inline editing, Quick Actions, and the dashboard redesign

A UX pass focused on cutting clicks out of the most frequent daily actions, rather than adding anything new. The principle throughout: a row should look exactly like it always did when nothing is focused, and only reveal "this is editable" on interaction — so the table stays clean rather than turning into a wall of input boxes.

**Inline status and designer editing (`components/inline-edit-selects.tsx`):** the jobs table's Status and Designer cells are no longer static. `InlineStatusSelect` wraps the existing `StatusBadge` visual as a Radix `Select` trigger (`SelectPrimitive.Trigger` used directly, not the shared `components/ui/select.tsx` wrapper, since that wrapper's trigger has its own hard-coded box styling that would fight the "look like a badge until clicked" requirement) — closed, it's pixel-identical to before; clicking opens the normal status dropdown and PATCHes immediately. `InlineDesignerSelect` does the same for the designer name, with options `[Unassigned, ...distinct designers, "+ New designer…"]`; the distinct-designers list comes from `GET /api/jobs/designers` (`jobDb.distinctDesigners()`), fetched once per table mount. Picking "+ New designer…" falls back to the existing `AssignDesignerModal` for entering a name that's never been used before — that modal's plain text input is correct for that one case and wasn't changed. Both inline selects call `patchJobField()` in `jobs-table.tsx`, which updates the row optimistically in local state, PATCHes `/api/jobs/[id]`, and rolls back via a full refetch if the request fails.

**Per-row Quick Actions (`components/ui/dropdown-menu.tsx`):** the table's old separate hover-revealed Edit/Delete icons are now one kebab (`⋯`) menu per row, holding Edit, Create Revision, View Client, Open Quote, and Delete. Create Revision only appears when `!job.parentJobId` (revisions can't have revisions — §4) and is a single click with no modal: it POSTs `/api/jobs/[id]/revisions` with no body, letter auto-assigned server-side, then toasts and refreshes. View Client and Open Quote are conditional on `clientId`/`quoteReference` being set and just navigate (Open Quote goes to `/quotes?search=<quoteReference>` rather than a dedicated lookup route, since `Job.quoteReference` is already the quote's number string — see §8). `components/ui/dropdown-menu.tsx` is a thin Radix `dropdown-menu` wrapper matching `select.tsx`'s styling conventions exactly (same z-[200] tier, same shadow/border tokens); the dependency was already in `package.json` but unused until this menu.

**A redaction bug this surfaced (since fully resolved, see §14):** at the time this sprint was built, `quoteReference` had been bundled into the codebase's then-existing commercial-field redaction alongside the actual money fields. It's just an identifier string ("Q-2026-001"), not a value, so nulling it out for Engineers silently broke the "Open Quote" quick action for that role. That was patched narrowly at the time; a later pass removed Job/Quote field-level redaction altogether (§14), which resolved this the rest of the way — `quoteReference`, like every other Job/Quote field, is simply unredacted now.

**`components/designer-combobox.tsx`** is a separate, simpler component from the inline table selects — a free-text input with a typeahead dropdown of existing designer names, for use *inside forms* (the job form, the convert-quote-to-job modal) rather than table cells. Unlike `ClientCombobox`, there's no "create" confirmation step, because a designer name isn't a backing database record — it's just a string on the `Job` row, so typing a new one needs nothing extra.

**Dashboard (`components/dashboard-stats.tsx`):** rebuilt around "what needs attention" rather than statistics. A single-line "at a glance" strip (active jobs, revisions, and for Admins, total quoted/issued — plain numbers, no cards) sits above a grid of actionable sections: Overdue Jobs, Jobs Due This Week, Awaiting Checking, Ready For Billing (Admin-only, since Billing is an Admin-only module — §14), Clients On Hold, and Unassigned (kept from the old dashboard since it's equally actionable). Each section is the same `Section` shell — icon, title, live count badge, "View all →", and up to 6 rows with an inline action where one makes sense (an "Assign" button on unassigned jobs, same as before). Removed entirely: the status-breakdown grid, the three separate KPI grids (commercial/billing/invoicing), the quote KPI block, "Workload by type", the "Pipeline" bar chart, and the "Recent jobs" feed — none of those told anyone what to do next, which was the point of this pass. Counts on each section header come straight from `/api/stats` (already-correct totals), not from the length of the capped preview list, so a section showing 6 rows but a count of "14" is expected and correct.

**Clients list (`app/clients/page.tsx`):** now shows an "On Hold" badge and an Active Jobs count per row, via a new `clientDb.findManyWithMeta()` (two correlated subqueries against `Job` and `ClientHold`, added to `GET /api/clients` only — `clientDb.findMany()` itself is unchanged and still used elsewhere, e.g. the client search combobox, which doesn't need this).

**Workflow defaults added:** Create Quote's Expiry Date now defaults to Quote Date + 30 days, and keeps re-syncing to that as the user changes the quote date — until they edit the expiry field themselves, at which point it stops auto-following (tracked via a local `expiryTouched` flag, initialized by checking whether a loaded quote's expiry already deviates from the 30-day default, so editing an old quote with a deliberately different expiry doesn't get clobbered). The job form's "Requested by" field now auto-fills from the selected client's contact name when empty (never overwriting something already typed) — `ClientCombobox`'s `onChange` was extended with a 5th `contactName` argument to support this.

**Left as-is, deliberately:** the billing export flow (`/billing`) was already a single primary action — `handleExport()` downloads the Excel file and creates the `ExportBatch` in one sequential call, with a "Select all" checkbox already present — so no click-reduction work was needed there. Admin-only pages (Commercial, Invoicing, Billing, Health, Users) weren't given a fresh visual pass in this sprint; they already share the same design tokens and `Button`/`Dialog` components as everything else, so they're consistent, just not specifically revisited.

---

## 16. Visual design system refresh (monochrome + accent)

A pure visual-layer refresh — no workflow, schema, permission, or API behaviour changed. Every token in `app/globals.css`'s `@theme` block kept its original name (`pg`, `sr`, `bd`, `t1`–`t4`, `ac`, `dn`, `ok`, etc.) so nothing that referenced a token had to change; only the underlying hex values changed, plus a small number of additive tokens for things the old palette had no answer for.

**New tokens added, same naming convention as before:** `ac-bg` (accent tint, for active states and info callouts), `ac2`/`ac2h`/`ac2-bg` (a secondary "slate teal" accent, used sparingly for exactly one category of meaning — see below), `wn`/`wn-bg`/`wn-bd`/`wn-tx`/`wn-ic` (a warning state — the old system only had success and danger, with no answer for "caution," so amber-tinted UI like the "Checking" status or "due soon" deadlines had been borrowed from danger/success or raw Tailwind colours inconsistently). `--radius-md`/`-lg`/`-xl` now resolve to 8px/10px/12px instead of Tailwind's stock 6px/8px/12px, so every existing `rounded-md`/`rounded-lg`/`rounded-xl` class picked up the new scale automatically with zero class-name changes. `--shadow-card`/`--shadow-modal` are softer and more diffused than before.

**Status taxonomy now uses the brand palette, not raw Tailwind colours.** `JOB_BADGE_CLASSES`/`JOB_ROW_BG`/`STATUS_DOT` (`components/status-badge.tsx`), `JOB_STATUSES[].dot` (`lib/constants.ts`), and `QUOTE_STATUSES[].color` (`lib/types.ts`) all moved from literal `bg-yellow-100`/`bg-orange-50`/etc. to the token system: `NEW_REQUEST`/`DRAFT` → neutral ink tint, `IN_DESIGN`/`SENT` → `ac` (indigo — "in progress"), `CHECKING` → `wn` (amber — "needs review"), `ISSUED`/`ACCEPTED` → `ac2`/`ok` respectively, `REJECTED` → `dn`. This is deliberately a different colour family from `WORK_ITEM_TYPES[].color` (`lib/constants.ts`) — work item *type* (Design/Revision/Site Visit/Survey/Inspection) is a 5-way categorical tag with no inherent success/danger meaning, so it was left on its existing blue/violet/amber/teal/pink scheme rather than forced into the status taxonomy's semantic colours; only its badge *shape* (now borderless, fully rounded, matching every other badge in the app) was touched, not its hues. Same treatment for `PaymentBadge` (`components/ui/badge.tsx`): `DRAFT`/`SENT` are categorical (neutral/indigo), but `PAID` now uses the strict `ok` token rather than a one-off green, since "paid" is a genuine system-success state, not just a category label.

**The sidebar (`components/side-nav.tsx`) is the one intentionally dark surface in the app** — a near-black ink background with the indigo accent reserved for the active link (tinted background, 3px left bar, white text) and a muted light grey for everything else. This is a structural choice, not just a colour swap: it gives the monochrome identity a permanent, visible home on every screen while the main content area stays light and airy for the dense tables that make up most of the app. Because nothing else in the app has a dark surface, the handful of colours this needed (`SIDEBAR_BG`, `SIDEBAR_TEXT`, etc.) are literal one-off constants local to that file rather than additions to the global token system — they wouldn't make sense anywhere else.

**Mechanical changes, no visual judgement involved:** every hardcoded hex literal duplicating a token value (`components/ui/*`'s "belt-and-suspenders" inline `style` props, which exist so those primitives render correctly even if Tailwind's class generation has an off day) was updated to match the new token values via direct substitution — same colours the className-based version now resolves to, just also set inline. Every card-shaped container following the `bg-sr border border-bd rounded` pattern (and its `bg-pg` variant for inset info boxes) was bumped from the bare 4px radius to the new 8px card tier across the whole app in one pass, since that pattern was used identically everywhere and the radius change carries no layout risk.

**Follow-up pass — PDF branding, work-item-type colours, and table density (all completed, not just recommended):**

The quote PDF (`app/api/quotes/[id]/pdf/route.ts`) now draws its accent rule, logo mark, and fee figure in the same indigo as the rest of the app (`BRAND_ACCENT`, matching `ac`/`#4640DE`) instead of the old generic blue, with a matching light-tint fee box (`ACCENT_TINT`, matching `ac-bg`). The four colour constants in that file are hand-converted `rgb()` floats — pdf-lib doesn't take hex — each commented with the hex/token it matches, so a future palette change has something to grep for.

`WORK_ITEM_TYPES`' colours (`lib/constants.ts`) moved off raw Tailwind classes onto a new dedicated `--color-tag-*` token set in `app/globals.css` (`tag-design`, `tag-revision`, `tag-sitevisit`, `tag-survey`, `tag-inspection`, each with a `-bg` pair). This is a genuinely separate palette from the five status/semantic tokens, not a relabelling of them — work item *type* has no inherent success/warning/danger meaning, so it shouldn't borrow those colours. Two of the five previously did by coincidence: Site Visit was amber (the same hue as the new `wn` warning token) and Survey was teal (the same hue as the secondary brand accent `ac2`) — both real collision risks given a `WorkItemTypeBadge` and a `StatusBadge` sit side by side in the same table row. The full five were refreshed together (cobalt/plum/clay/olive/rose) rather than patching just those two, so the set reads as one deliberate palette instead of two fixed colours next to three untouched Tailwind defaults. `QUOTE_STATUSES` (`lib/types.ts`) and `JOB_STATUSES[].dot` (`lib/constants.ts`), by contrast, *are* status taxonomies — parallel to `JOB_STATUSES`' main badge colours — so those already use the semantic/brand tokens (§ above), not the new tag palette.

Table density got a deliberately narrow, judgment-based pass rather than a blanket increase. `components/jobs-table.tsx`'s body rows moved from `py-3` to `py-3.5` — the highest column count and most multi-line cells of any table in the app, and the screen people spend the most time in, so it's the one place the extra content density made a stronger case than anywhere else. Two embedded sub-tables in `app/invoicing/page.tsx` (the create-invoice line-items editor and the invoice-detail line-items view) moved from `py-2`/`py-2` header-and-text cells to `py-2.5`, matching the `py-2.5` secondary-table convention used everywhere else in the app (revisions panel, client detail's jobs list, the billing queue) — those two were measurably tighter than every comparable table, including the main invoice list a few hundred lines below them in the same file. The one cell *not* touched in that pass is the `Input`-bearing cell in the line-items editor (`py-1.5`): its row height is already governed by the input's own `h-7` height, not by text density, so padding it further would only add empty space around a fixed-height control rather than making anything easier to read. Every other table in the app (quotes, clients, hold list, users, commercial, billing, billing history, invoicing report) was checked against this same logic and left alone — each was already at the density its own peers use, with header rows intentionally a touch tighter than body rows and totals rows intentionally tighter still, a pattern that holds consistently across the whole app rather than being an oversight in any one file.

**Still worth a real browser pass, since none of the above was visually verified (no rendering capability in this environment):** the actual realised row heights, whether the new `py-3.5` jobs-table density reads as "comfortable" or "loose" next to the still-`py-2.5` tables on adjacent pages, and whether the five new work-item-type tag colours are distinguishable enough from each other and from the status badges at actual badge size (11px text, ~20px tall pill) — colour separation that looks fine reasoned out on a hue wheel doesn't always survive contact with real anti-aliased pixels at that size.

---

## 18. Codebase bug audit — data-integrity rules now enforced

A full-codebase audit (UI workflows, the SQLite schema, every API route, and React state management) found several real defects beyond the jobs-table filter bug in §15. The ones with confirmed root causes were fixed directly; this section documents the new rules so future schema or route changes don't quietly reopen them.

**Job deletion is no longer unconditionally destructive.** `jobDb.deletionBlockers(id)` (`lib/db.ts`) now runs before `DELETE /api/jobs/[id]` and returns a 409 with a human-readable reason if the job has child revisions, is already invoiced, or has already been exported to accounts. Previously, deleting a job with revisions silently orphaned them (`parentJobId` is `ON DELETE SET NULL`, not cascade) — the orphaned revision kept `itemType = 'REVISION'` but `parentJobId = NULL`, which miscounted it as an "original" in dashboard stats and, worse, let someone create a revision *of* it, since the only revision-of-revision guard is "does the target already have a `parentJobId`." Deleting an already-invoiced job cascaded away its `InvoiceItem` row without ever recalculating the parent `Invoice.invoiceValue`, leaving the invoice's stored total silently wrong. Deleting an already-exported job threw a raw, uncaught `FOREIGN KEY constraint failed` straight to the client, since `ExportBatchItem.jobId` has no `ON DELETE` clause. None of these are hypothetical — all three are one click away in the existing UI (the jobs table's row-menu delete action has no awareness of any of this).

**Renaming a client now propagates to every job and quote that references it.** `clientDb.update()` previously only wrote the new name to the `Client` row. Per the existing documented rule in §6 ("`clientCompany` is always kept in sync with `Client.name`"), that sync was only ever implemented at job-creation time and during the one-off legacy migration — not on rename. `clientDb.update()` now does the rename and the `Job.clientCompany` / `Quote.clientCompany` cascade inside one transaction whenever the name actually changes.

**Quote→Job conversion is now atomic.** `POST /api/quotes/[id]/convert` used to call `jobDb.create()` and then `quoteDb.update(id, { jobId })` as two independent statements. If the second one ever failed, the quote would stay unlinked (`jobId` still `NULL`) despite a job already existing for it — and since "already converted" is the only thing the route checks before allowing a conversion, the same accepted quote could be converted a second time, producing a duplicate job. Both writes now run inside one `db.transaction()`; better-sqlite3 handles the nesting via `SAVEPOINT` since `jobDb.create()` already opens its own transaction internally.

**Quotes can no longer be deleted after conversion.** `DELETE /api/quotes/[id]` now returns 409 if `jobId` is set, matching the "linked... permanently" language already in §8 — previously it would silently hard-delete the only record of the original quote (and its PDF reference) out from under a job that still cites it via `quoteReference`.

**A new `parseLocalDate()` helper (`lib/utils.ts`) fixes a systemic timezone bug.** Bare `YYYY-MM-DD` calendar fields (`requiredByDate`, `quoteDate`, `invoiceDate`, `dateCompleted`, `expiryDate`, `exportDate`) were being passed straight to `new Date(...)`, which parses as UTC midnight, and then formatted with `date-fns`'s `format()`, which renders in the server's local time — on any server deployed in a timezone behind UTC, every one of those dates would display one day earlier than stored. `getDeadlineInfo()` already worked around this correctly (appending `T00:00:00` to force local parsing) but the same fix had never been applied anywhere else. `parseLocalDate()` centralises that fix; every display site that formats one of those six fields (the job detail page, quotes list, both invoicing pages, the commercial report, billing history, the billing queue, the jobs table, and the billing XLSX export) now goes through it. True timestamps (`dateCreated`, `createdAt`, `updatedAt`, `sentAt`, `paidAt`, `exportedAt` — all stored with a time component and a `Z`) were deliberately left alone, since formatting those in local time is correct, not a bug.

**Other fixes:** the client-hold warning modal in the job form no longer fires when editing an existing job (only job *creation* ever matched the modal's own copy, "Continue creating the job…" — editing a job for a held client was incorrectly showing the same "this will create new work" warning). `PATCH /api/quotes/[id]` can no longer set `jobId` directly — only the dedicated `/convert` route may link a quote to a job, since that's the only place the ACCEPTED-and-not-already-converted rules are enforced. `quoteValue` is now rejected with a 422 if negative, on both job and quote create/update routes. `invoiceDb.updateStatus()`'s header update and its per-job audit-trail rows are now one transaction instead of two independent writes. Two real N+1 query patterns were fixed: `/api/clients/search` was calling `holdDb.activeHoldForClient()` once per result instead of one batched `IN (...)` lookup (`holdDb.activeHoldReasonsFor()`), and the billing XLSX export was fetching each job individually instead of one `jobDb.findManyByIds()` call. `invoiceDb.create()` was also fetching each job twice (once to validate, once to resolve values) — now fetched once and reused. Finally, a leftover `rounded-md-md` typo (from an over-greedy `\b`-bounded `sed` substitution during the §16 design refresh — `\b` matches before `-md` too, since `-` isn't a word character) was found in three files and fixed; Tailwind silently drops unrecognised utility classes, so the only symptom was those three cards rendering with square corners instead of the intended 8px radius.

**Found but not changed — needs a product decision, not a code fix:** the existing `getDeadlineInfo()` status-blindness gap from §11 (a job's deadline badge can say "Overdue" even though the dashboard/SQL-level counts correctly exclude `ISSUED` jobs) is unchanged; the deadline badges in the jobs table and job detail page still use a bordered, square-cornered style left over from before the §16 pill redesign, a cosmetic inconsistency rather than a functional bug.

---

## 19. Billing workflow simplification — Ready For Invoicing

The business decided to stop managing invoicing and billing exports inside the app entirely. Everything that created, tracked, or reported on `Invoice`/`ExportBatch` rows (`/invoicing`, `/invoicing/report`, `/billing/history`, and the old `/billing` queue-and-export-to-Excel flow, plus every `/api/invoices*` and `/api/billing/{queue,export,batches}` route) was removed. In its place there is a single, deliberately minimal "Ready For Invoicing" handoff queue: when billable work finishes, it appears here automatically; an accounts user marks it processed once they've raised the invoice externally; that's the entire workflow. It is explicitly not an invoicing system — there's no invoice number, no payment status, no PDF, no line-item editing.

**New table — `BillingHandoff`.** One row per billable completion event. `UNIQUE(sourceJobId)` is the actual duplicate-prevention mechanism, enforced by SQLite itself rather than application logic: at most one handoff can ever exist for a given `Job` row, full stop, regardless of how many times that job's status changes. A revision is its own `Job` row with its own id (per §4), so it gets its own handoff the first time *it* reaches `ISSUED` — which is exactly "a revision's completion is a separate billable event" with no special-case code needed. `billingEventType` records `JOB_COMPLETED` or `REVISION_COMPLETED` (derived from whether the job has a `parentJobId`), purely descriptive — the duplicate-prevention logic doesn't depend on it.

Like `ExportBatchItem` before it, every display field on a `BillingHandoff` row (`drawingNumber`, `clientCompany`, `address`, `itemType`, `typeOfWorks`, `designer`, `quoteValue`, `quoteReference`, `completionDate`) is a snapshot taken at creation time, not a live join to `Job`. This means a later edit to the job (a designer reassignment, a client rename cascading from §6's `clientDb.update()`) can't shift what accounts is already looking at mid-process, and the record stays meaningful even if the job itself is later changed.

**Trigger: `jobDb._recordBillingHandoffIfIssued()`.** Both `jobDb.create()` and `jobDb.update()` are already the single, transaction-wrapped chokepoint every job write passes through (per the established pattern throughout this file). Immediately after either one writes a status of `ISSUED` to a job — covers every UI path (inline status select, the job form's status dropdown, anything added later) without needing to duplicate logic anywhere — it calls this helper, which does `INSERT OR IGNORE INTO BillingHandoff (...)`. "OR IGNORE" means a job bouncing `CHECKING → ISSUED → CHECKING → ISSUED` again, or any other repeated-status-update scenario, silently does nothing on the second and subsequent attempts; there's no select-then-insert race window because the database constraint itself is what prevents the duplicate, not a check beforehand.

**Clearing.** Originally a standalone `billingHandoffDb.markCleared()` call. That's since been superseded — see **§20**: every clear now happens as part of an Accounts Handover export, so every cleared item is guaranteed to carry a batch reference. The underlying guarantee is unchanged though: a handoff can only move from uncleared to cleared once, never back, and never twice.

**Removed from the dashboard / commercial report / `/api/stats`:** every `invoicesSent`/`invoicesPaid`/`outstandingValue`/`billingPendingCount`/`billingExportedCount`-shaped field. `commercialDb.uninvoicedValue()` (summed from `Job` directly) was renamed `awaitingAccountsValue()` (summed from uncleared `BillingHandoff` rows instead) — same idea, "money for issued work not yet handed off," but sourced from the new model. The dashboard's "Ready For Billing" section is now "Ready For Invoicing," reading from `/api/billing-handoffs?view=awaiting` instead of the old `/api/billing/queue`.

**Navigation / permissions.** The "Invoicing" module (`lib/permissions.ts`) was deleted outright. "Billing" was kept as the module key and the `/billing` URL (to avoid a second migration of bookmarks/links) but relabelled "Ready For Invoicing" and repointed at the new page. Still Admin-only — the brief's "accounts users" maps onto the existing Admin role rather than introducing a third role, since this app only models Admin/Engineer today; a dedicated Accounts role is a reasonable future addition if the two ever need to diverge (e.g. an Admin who shouldn't see Engineer-only screens, or an accounts user who shouldn't see Commercial/User Management).

**Migration strategy — nothing destructive.** `Invoice`, `InvoiceItem`, `InvoiceSequence`, `ExportBatch`, and `ExportBatchItem` (plus `Job.invoiceId`/`billingStatus`/`billingBatchId`) are *not* dropped. They're marked deprecated in both the schema comment and `lib/types.ts`, and nothing in the app writes to or reads from them anymore — but any historical data already sitting in a deployed database survives untouched. This follows the same "never destroy audit trail" approach already used for `StatusHistory`/`ExportBatch`/`ClientHold` elsewhere in this file; dropping tables on a one-way UI removal, with no way to know what's actually in a real deployment's database, isn't a risk worth taking for the sake of schema tidiness. `jobDb.deletionBlockers()` (§ above) now also blocks deleting a job that already has a `BillingHandoff` row, for the same reason it blocks deleting an invoiced or revision-bearing job.

**Edge cases considered:** a job created already-`ISSUED` via a direct API call (not reachable through any current UI, since every creation path defaults to `NEW_REQUEST`) still gets a handoff, since the trigger lives in `jobDb.create()` too, not only `update()`. A job with `quoteValue = NULL` still gets a handoff (accounts needs to know it completed even if pricing was never entered — the value column on the handoff is simply `NULL`, displayed as "—"). `completionDate` prefers the job's own `dateCompleted` field if the user set one, falling back to the date of the `ISSUED` transition otherwise, so a backfilled completion date is respected rather than overwritten with "today." Engineers (non-Admin) never hit the admin-only `/api/billing-handoffs` endpoints at all — the job detail page's "Ready For Invoicing" status line is gated behind `isAdmin` client-side to avoid a pointless 403 fetch, mirroring how the dashboard already gated the old billing-queue fetch.

---

## 20. Accounts Handover export

The business wants accounts to be able to raise invoices, answer customer queries, and resolve disputes using only the exported workbook — never needing to come back to the app. This replaced the simple single-item "mark processed" flow from §19 with a proper export: every clear now happens by exporting a batch, and every export produces a multi-sheet workbook plus a permanent, numbered record of exactly what was sent. (Originally six sheets — see the addendum below for the later expansion to nine, covering project/client/commercial/design/survey/revision/audit/attachments separately rather than folded together.)

**Data model gap, addressed honestly rather than papered over.** A number of requested fields don't exist anywhere in this application: Priority, a Surveyor role distinct from Designer, Project Lead, Purchase Order Number, Cost Centre, Additional Charges and Variation Amounts as distinct line items, a Billing Contact distinct from Contact Name, a long-form Description distinct from Type of Works, and — entirely — any attachment or document storage. Rather than inventing plausible-looking values (which would actively mislead accounts during reconciliation) or silently leaving cells blank (which looks like a data error rather than a deliberate gap), every such field is populated with the literal string `"—"` and listed by name on a dedicated **Notes** sheet in every export, so accounts knows definitively that the data was never captured rather than wondering if something went missing in the export itself.

**New tables — `BillingExportBatch` and `BillingExportSnapshot`.** A batch is the numbered record requested (`batchNumber`, `exportDate`, `exportedBy`, `recordCount`, plus a free-text `notes` field for the export as a whole). A snapshot is the full point-in-time Accounts Handover payload for *one* handoff — client info, project info, commercial info, operational info, revision history, audit trail, attachments-note, and the list of not-tracked fields — stored as one `snapshotJson` blob per handoff (`UNIQUE(handoffId)`) rather than as dozens of additional flat columns. That's a deliberate choice, not a shortcut: revision history is a variable-length list (doesn't fit a flat row), and the export's content will likely keep evolving as gaps above get filled in over time — a JSON snapshot absorbs that without a schema migration every time a column gets added or renamed. `BillingHandoff` gained an `exportBatchId` column (nullable, set only once cleared) so "every processed item links to the batch that exported it" is answerable with a plain column read, not a join through the snapshot table.

**Batch numbering** reuses the exact same `BATCH-YYYY-NNN` sequence (`sequenceDb.nextRefNumber("BATCH")`, the `RefSequence` table) that the deprecated `ExportBatch` system used — continuing the same counter rather than starting a parallel one, so numbers can never collide with any historical batches sitting in a deployed database. Padding is 3 digits (`BATCH-2026-001`), matching every other reference-number prefix in the app (`Q-`, `SV-`, `SRV-`, `INS-`) rather than the 4-digit example in the brief — a deliberate, minor deviation made for internal consistency.

**Snapshot timing.** "Capture a snapshot of the job data at the moment it is processed" is implemented literally: `billingHandoffDb.buildAccountsHandoverSnapshot()` joins live to `Job`, `Client`, `StatusHistory`, and any sibling revisions *at export time*, not at the (possibly much earlier) moment the handoff was first created. Once written, the JSON is never re-read-and-recomputed — a later edit to the job cannot retroactively change a historical export, satisfying "future edits to the job must not alter historical exported records" by construction rather than by convention.

**Where the harder-to-derive fields actually come from:** `Completed By` and `Created By` aren't separate tracked columns — they're read back out of `StatusHistory` (the entry with `toStatus = 'ISSUED'` for the former, the entry with `fromStatus IS NULL` for the latter), which already exists as a complete audit log per §5. `Last Modified By`/`Last Modified Date` are a deliberately-labelled best effort — the most recent `StatusHistory` entry of any kind — since not every field edit writes a status-history row (editing notes or address alone doesn't), so this can under-report compared to a true field-level audit log. `Revision Charges` sums each revision's own `quoteValue` (revisions are first-class `Job` rows per §4, each with its own commercial fields) rather than being a separately-entered figure.

**Export flow — one combined, recoverable action, not the old system's two-step split.** The deprecated billing-export flow (§9, before removal) split into a no-side-effect "generate the file" call and a separate "confirm" call specifically so a job was never marked exported without accounts actually having the file. That split doesn't transfer cleanly here, because the brief wants the real batch number printed inside the workbook itself (visible proof of which batch a given file belongs to) — and the batch number doesn't exist until the batch is actually committed. Splitting would mean either showing a fake placeholder number in the preview or generating the file twice. Instead, `POST /api/billing-handoffs/export` does both in one transaction (create batch → write snapshots → clear handoffs) and then builds the workbook from the snapshots that transaction just wrote, so a committed batch and its downloaded file are always in agreement. The safety the old split was protecting against — "exported but the download failed" — is handled differently here: every snapshot is durably stored, so `GET /api/billing-handoffs/batches/[id]/xlsx` can always regenerate a byte-identical workbook later from the stored JSON, without touching live `Job` data (which may have since changed). The Export History tab on `/billing` exists specifically to make that re-download reachable.

**UI.** `/billing`'s Awaiting view gained checkboxes and a floating "Export Selected (N)" action; selecting items and exporting opens a small modal for an optional batch-level note, then triggers the export, browser download, and a list refresh in one action. A third tab, Export History, lists every batch with a re-download button. The Cleared view now also shows which user cleared each item and when (`clearedBy`/`clearedByAccountsAt`), already present on `BillingHandoff` from §19.

### §20 addendum — expansion to a full project handover package (9 sheets)

The business escalated the export's scope: every field stored against a project, not a billing-focused subset, restructured into 8 named sheets (Accounts Summary, Project Details, Client Information, Commercial Information, Design & Survey Information, Revision History, Activity Log, Attachments & Documents) plus the existing Notes sheet — 9 total. `AccountsHandoverSnapshot` (`lib/db.ts`) and `buildAccountsHandoverSnapshot()` were restructured to match (separate `client`/`project`/`request`/`commercial`/`design`/`survey`/`revisions`/`audit`/`attachments` sections instead of the original `client`/`project`/`commercial`/`operational`), and `lib/billing-export.ts` was rewritten for the new sheet layout. Re-auditing the schema for this (per the brief's own "audit before implementing" instruction) found several **genuinely real fields that the original six-sheet version had simply missed** — not new data, just previously un-surfaced:

- `Client.notes` — a real column, never included before. Now on the Client Information sheet.
- `Job.requestedDate` — exists in the schema (kept for backwards compatibility after the UI stopped showing/editing it, per §11) but was never read for the export either. Included, clearly caveated that it's unlikely to be populated on jobs created via the current UI.
- `Job.quoteReference` — the original quote number, omitted from the old Commercial section entirely. Now included.
- The **full `StatusHistory` timeline**, not just the three derived summary fields (created by/completed by/last modified by). The brief explicitly asks for "Status Change History" and "Activity Timeline" as their own thing, which a three-field summary doesn't actually provide — the Activity Log sheet now lists every recorded transition per job, in order, with who made it and any note attached.
- Per-revision `notes` and `dateCreated` — each revision is its own `Job` row with its own notes field (e.g. "Revision requested after original issue") and creation timestamp; previously only its completion date and charge were surfaced.
- A genuinely new derivation, not just a missed field: if a job was converted from a Quote (`Job.quoteReference` resolves to a real `Quote` row via the newly-added `quoteDb.findByNumber()`), that quote's free-text `description` is surfaced as **Project Description** — a field this app has no dedicated column for on the Job itself, but which legitimately exists upstream for converted jobs.

**Still not tracked, despite being explicitly requested again** (the same honesty principle as the original section: a `"—"` marker plus an explanation on the Notes sheet, never a fabricated value): Priority, Request Source, Internal References, Purchase Order Number, Cost Centre, Variation Fees / Additional Charges as distinct line items, Payment Terms, Billing Contact (distinct from Contact Name), a Surveyor role and an entire survey workflow distinct from the design workflow (even `itemType = 'SURVEY'` jobs use the same `designer`/status/notes fields as everything else — there's no separate survey-specific data anywhere), and — entirely, as before — file attachments or document storage of any kind. The Design & Survey Information sheet's survey columns are consequently `"—"` for every single row, every time; that's an accurate reflection of what the system tracks, not a bug in the export.

**Verified for real, not just read as correct:** a working `better-sqlite3` binding was available in this session (see §23's note on compiling it from source), so the full flow — trigger export via the real API, download the real `.xlsx`, parse it back with SheetJS, and inspect actual cell values — was run against the live UAT dataset (§ UAT plan elsewhere in this document) rather than only reasoned about. Confirmed directly: all 9 sheets present in the requested order; a job with two revisions produces exactly two correctly-detailed rows on the Revision History sheet, including each revision's own notes; the Activity Log sheet's full timeline shows every real status transition including designer-reassignment events; the "no attachments exist" sheet renders its placeholder rows correctly rather than crashing on an empty lookup.

**Complete field list — every column in the export, sheet by sheet** (✓ = real column/derivation; ✗ = not tracked, exported as `"—"`):

| Sheet | Columns |
|---|---|
| Project Details | Job Number ✓, Drawing Number ✓ (same value as Job Number), Project Name ✓ (Type of Works, or the Other-type description), Project Description ✓ *(only for quote-converted jobs)* / ✗ *(otherwise)*, Site Address ✓, Type of Works ✓, Other Type Description ✓, Priority ✗, Status ✓, Creation Date ✓, Due Date ✓, Completion Date ✓, All Project Notes ✓, Requested By ✓, Company Requesting Works ✓, Request Date ✓ *(legacy column, rarely populated)*, Request Source ✗, Internal References ✗, Purchase Order Number ✗, Cost Centre ✗ |
| Client Information | Client Name ✓, Company Name ✓ (same value), Contact Name ✓, Contact Email ✓, Contact Telephone ✓, Billing Contact ✗, Billing Address ✓, Client Notes ✓ |
| Commercial Information | Agreed Fee ✓, Quoted Fee ✓ (same value), Quote Reference ✓, Variation Fees ✗, Additional Charges ✗, Revision Charges ✓ *(derived: sum of revisions' own quoteValue)*, Commercial Notes ✓, Payment Terms ✗ |
| Design & Survey Information | Assigned Designer ✓, Completed By ✓ *(derived from StatusHistory)*, Design Completion Date ✓, Design Notes ✓, Design Reference ✓ (drawing number), Assigned Surveyor ✗, Survey Date ✗, Survey Notes ✗, Survey References ✗ |
| Revision History | Parent Job Number ✓, Revision Drawing Number ✓, Revision Letter ✓, Status ✓, Requested Date ✓, Completion Date ✓, Revision Description/Notes ✓, Charge ✓ |
| Activity Log | Audit summary: Created By ✓, Created Date ✓, Last Modified By ✓ *(best-effort)*, Last Modified Date ✓, Added To Queue At ✓, Batch Number/Export Date/Exported By ✓. Full timeline: From Status / To Status / Changed By / Changed At / Note ✓ *(one row per real StatusHistory entry)* |
| Attachments & Documents | File Name / File Type / Upload Date / Uploaded By / Document Category — all ✗, structurally, for every row; this application has no file storage |
| Accounts Summary | Job Number, Project Name, Client, Site Address, Job Type, Job Status, Completion Date, Assigned Designer, Agreed Fee — all ✓, drawn from the sheets above |
| Notes | Lists every ✗ item above by name, with a one-line reason each |

**Edge cases considered:** exporting is all-or-nothing across the selected ids — `createExportBatch()` validates every handoff exists and is still uncleared *before* writing anything, so a stale selection (e.g. two browser tabs racing to export the same item) fails the whole batch with a clear error rather than partially committing. A handoff for a job with `quoteValue = NULL` still exports fine — `Agreed Fee`/`Quoted Fee` cells are simply blank, distinct from the `"—"` used for genuinely untracked fields. A job with zero revisions produces zero rows for it on the Revision History sheet (not a row with "0" — there's nothing to list), while `Revision Count` and the revision charges total still appear correctly on the Commercial/Audit-adjacent data carried in the snapshot.

---

## 21. Jobs table column redesign + simplified status system

The jobs table's column order, the four job-status labels, and their colours were redesigned around one goal: the most operationally important information (what is this, where is it, who's it for, is it done) should be readable without horizontal scanning, with completion status as the single most visually dominant thing in each row.

**New column order:** Drawing No. → Address → Type of Works → Client → Requested By → Quotation → Completion Status → Designer, plus the (unlabelled, always-present) quick-actions column at the end. Drawing No. and Address are now sortable headers (previously plain `<th>`s, despite `drawingNumber` already being in the server-side sort whitelist) — `address` was added to that whitelist (`SORT_WHITELIST` in `lib/db.ts`, and the `SortField` union in `lib/types.ts`) since it wasn't sortable at all before.

**Status labels — display text only, not the stored values.** "New Request / In Progress / Requires Checking / Complete" are the new `label`s in `JOB_STATUSES` (`lib/constants.ts`). The underlying stored strings (`NEW_REQUEST`/`IN_DESIGN`/`CHECKING`/`ISSUED`) are unchanged — they're load-bearing throughout the schema (every status filter, `StatusHistory`'s permanent audit rows going back to day one, the `ISSUED`-gated billing-handoff trigger from §19, the deadline-exclusion logic from §11) and renaming them would be a real, risky data migration for what the brief was asking for as a display-language change. Because every other page that shows status (`StatusBadge`, the kanban board's column labels via `/api/jobs/board`, the status-workflow stepper on the job detail page, `InlineStatusSelect`'s dropdown) already reads its label from `JOB_STATUSES` rather than hardcoding its own copy, the label change propagated everywhere with a one-file edit — no page needed individual updates.

**Colours.** Requires Checking and Complete deliberately reuse the existing `wn` (warning/amber) and `ok` (success/green) semantic tokens directly, rather than inventing parallel "status-only" colours that merely resemble them. The previous version of this file argued status colours should stay separate from semantic feedback colours in general — and that's still right for an arbitrary categorical palette — but "needs attention" and "done" are not arbitrary for a status specifically; they carry the same meaning `wn`/`ok` already encode, so borrowing is accurate, not a collision. New Request and In Progress have no existing semantic equivalent, so two new tokens were added to `globals.css`'s `@theme` block: `gy` (grey) and `yl` (yellow). Yellow was deliberately given a more saturated fill (`--color-yl-bg: #FEF9C3`) rather than copying `wn`'s ultra-pale formula (`--color-wn-bg: #FFFBEB`) — at that low a saturation, yellow and amber are too close in hue to tell apart at a glance, which would have defeated the entire point of a 4-colour system.

**Visual dominance.** `StatusBadge` gained a `size="lg"` variant (bigger padding, semibold weight, a filled dot) used only by `InlineStatusSelect` in the jobs table (`size="lg"` passed explicitly); every other call site — the job detail page's status stepper, the kanban board — keeps the original compact size, since "visually dominant" was a jobs-table-specific requirement, not a global one.

**Type of Works is now a badge** (new `TypeOfWorksBadge` component, `components/type-of-works-badge.tsx`) instead of plain text, reusing `WorkItemTypeBadge`'s pill shape but in one neutral tone rather than a colour per category — the controlled list (`WORKS_TYPES`) has eleven entries and counting, so a distinct hue per entry the way item-type's five-way palette works wouldn't stay legible or maintainable. Used on the main jobs table, the kanban board cards, and left as the natural badge style for any future works-type display.

**What happened to the old "Type" (item-type) and "Created"/"Deadline" columns — flagged as a deliberate scope decision, not a silent drop:**
- The brief's 8-column list has no place for item type (Design/Revision/Site Visit/Survey/Inspection — a different concept from Type of Works/`typeOfWorks`). Rather than dropping that signal entirely, a compact `WorkItemTypeBadge` now sits inline next to the drawing number, but *only* for Site Visit/Survey/Inspection — the common case (Design) and Revision (already flagged by the existing branch icon) show nothing extra, keeping the cell quiet for the majority of rows while still surfacing the less common types where it matters.
- Created Date and the deadline badge were full columns before and aren't in the new 8-column list. Created Date is dropped outright — still available via CSV export, via URL-driven sorting, and on the job detail page. Deadline urgency (overdue/due today/due soon) is folded into the Completion Status cell instead, as a small line directly beneath the big status badge, shown *only* when there's an active deadline concern — preserving the one piece of that old column's information that's genuinely time-sensitive, without restoring a 9th column. The deadline filter pills above the table and the dashboard's overdue KPIs are both independent of this and unaffected either way.

**Hold warning** moved from its own narrow accessory column into the Client cell (icon + "On Hold" pill together) — consistent with the brief's exact column list while keeping the warning itself fully intact.

**Quotation** now shows the quote reference (small, monospace, muted) stacked beneath the existing quote value — additive, not a behaviour change to the value display itself.

**Requested By / Designer distinction.** Both are now their own columns (previously Requested By was a secondary line inside the Client cell). Each carries a small icon — `UserCircle2` for Requested By ("who asked"), `PenTool` for Designer ("who's doing the work") — specifically so the two can't be confused scanning down the table, per the brief's explicit ask. Requested By itself needed no new "prioritise the individual over company" logic: `Job.requestedBy` is a single free-text field (not two separate contact/company fields to choose between), and the existing quote-conversion path (§8) already populates it with the contact name when one exists, falling back to the company name only when it doesn't — so the individual is already prioritised by how the field gets written, not by anything the table needs to decide at render time.

**Responsive behaviour.** Drawing No., Address, and Completion Status have no responsive hiding — visible at every width. Type of Works and Client hide below the `sm` breakpoint; Requested By below `md`; Quotation and Designer below `lg`. Because hidden columns are removed from layout entirely (not just visually collapsed), the remaining visible columns naturally re-flow into exactly the brief's stated mobile priority order (Drawing No. → Address → Completion Status → Type of Works → Client) without needing any separate "compact mobile view" — Completion Status sits later in DOM/column order than Type of Works and Client, but since those two are hidden first, it ends up the third visible column at narrow widths regardless. The table's previous hardcoded `minWidth: 720` was removed for the same reason — keeping it would have forced horizontal scroll even after hiding columns, defeating the point of hiding them.

**Files changed:** `components/jobs-table.tsx` (column order, responsive classes, status/works badges, folded-in item-type and deadline indicators, CSV export status column now exports the friendly label via `getJobStatus()` rather than the raw stored value), `components/status-badge.tsx` (colours, `size="lg"`), `components/inline-edit-selects.tsx` (`size` passthrough), `lib/constants.ts` (status labels), `app/globals.css` (`gy`/`yl` tokens), `lib/db.ts` + `lib/types.ts` (`address` added to the sort whitelist/`SortField`), `components/type-of-works-badge.tsx` (new), `app/jobs/board/page.tsx` (badge-ified Type of Works on cards), `app/clients/[id]/page.tsx` (the separate, smaller jobs sub-table on the client detail page reordered to the same Drawing No. → Address → Status → Quote principle), `components/dashboard-stats.tsx` ("Awaiting Checking" section retitled "Requires Checking" to match).

**Usability recommendations surfaced during implementation, not yet acted on:**
- Dropping Created/Deadline as full columns is a real, visible behaviour change even though it matches the brief's exact list — worth a quick confirmation pass with whoever actually triages this table daily before treating it as final, since "the deadline badge I used to scan down" disappearing is the kind of thing that's only obviously fine or not fine to a daily user, not from the spec alone.
- The client-detail jobs sub-table and the kanban board now both echo the main table's *ordering principles* but are still independent pieces of UI with their own column sets (5 and effectively 1-column-card respectively) — if this table's layout changes again in future, those two are easy to forget since nothing enforces consistency between them beyond convention.
- `TypeOfWorksBadge`'s single neutral tone was a deliberate call given eleven-plus controlled-list values, but if accounts/ops ever narrows that list to a handful of frequently-used categories, a small colour-per-category palette (mirroring `WorkItemTypeBadge`'s `tag-*` tokens) would likely earn its complexity at that point and could be revisited.

---

## 22. Controlled Type of Works system

`Job.typeOfWorks` was a free-text field, and had drifted into duplicated/inconsistent values that made filtering and reporting unreliable. It's now a controlled vocabulary — `WORKS_TYPES` in `lib/constants.ts`, 17 approved categories plus `"Other"` — with an `"Other"` escape hatch that requires a free-text `customTypeDescription` alongside it, so a genuinely uncommon job still gets a real description rather than being forced into the wrong category.

**Important note on "discovered legacy values":** this environment has no working database connection (the sandboxed `better-sqlite3` native binding doesn't load — a long-standing, confirmed-harmless limitation noted elsewhere in this document) and, more fundamentally, no access to Oryx's real production data at all. Everything below about "legacy values found" comes from `prisma/seed.ts` — the only real (if synthetic) dataset available here. **Before deploying this, run `npx tsx scripts/preview-works-type-migration.ts <your-values.json>` against your actual database's distinct values** (the script's header comment includes the exact `sqlite3` command to extract them) to get the real mapping/review-flag report for your real data — the migration logic itself is identical, only the input differs.

**Schema:** `Job` gained two columns via the standard `addMissingJobColumns()` pattern — `customTypeDescription` (the free-text description when `typeOfWorks = 'Other'`) and `legacyTypeOfWorks` (the original value, preserved whenever a row's value had to be remapped; `NULL` for anything created after this migration, since there's nothing to preserve). `BillingHandoff` gained a matching `customTypeDescription` snapshot column. A new table, `TypeOfWorksMigrationLog`, is the actual queryable record of every migration decision — one row per remapped job, permanent, never deleted (same audit philosophy as `StatusHistory`/`ExportBatch`/`ClientHold`) — queryable via `GET /api/type-of-works-migration-log` and markable as reviewed via `POST /api/type-of-works-migration-log/[id]/review`.

**Migration strategy.** A startup migration (`migrateTypeOfWorksValues()` in `lib/db.ts`, run alongside the other `addMissing*Columns` migrations) finds every `Job` row where `itemType IN ('DESIGN','REVISION')` and `typeOfWorks` isn't already one of the 18 approved values, classifies each one, and writes both the updated `Job` row and a `TypeOfWorksMigrationLog` entry in one transaction. It's idempotent by construction, not by a separate "have I run" flag: once a row's `typeOfWorks` is an approved value, it's excluded from the candidate query on every subsequent startup, so a second run (or a hundredth) finds nothing left to do. Non-Design/Revision item types (Site Visit, Survey, Inspection) are deliberately excluded from the candidate set — they skip the Type of Works field entirely in the UI (`isNonDrawingType()`), so their typically-empty value reflects "doesn't apply," not a data-quality issue, and flagging every one of them for review would have buried the genuinely useful flags in noise.

**Classification — three tiers, explicit dictionary rather than fuzzy matching.** `lib/works-type-migration.ts`'s `classifyLegacyWorksType()`:
- **EXACT** — already one of the 18 approved values (after trim/case normalisation). Mapped directly, no review.
- **ALIAS** — matches an entry in an explicit `ALIASES` dictionary of known abbreviations and spelling variants. Mapped directly, no review.
- **FLAGGED** — no confident match. Always mapped to `"Other"` with the original text preserved as `customTypeDescription` (never discarded), and `needsReview = true`.

This is deliberately a hand-maintained dictionary, not a string-similarity/fuzzy matcher: a similarity threshold could confidently match "Crash Barrier" to "Crash Deck" and be flatly wrong, and that kind of mistake is exactly what this whole feature exists to prevent. Every mapping decision the migration can make automatically is one a human already reviewed by writing it into the dictionary; everything else gets a human review flag instead of a guess.

**Genuinely ambiguous values get a specific reason, not a generic "no match."** A `KNOWN_AMBIGUOUS` map in the same file gives an explicit explanation for cases that are common enough to name individually:

| Legacy value | Why it's flagged rather than auto-mapped |
|---|---|
| `Façade Scaffold` | Could mean Access Scaffold, Bridged Access, or Freestanding Access depending on the actual structure — not one of the new categories on its own |
| `Gantry & Loading Bay` | The old combined category splits into two separate new ones (Gantry, Loading Bay) — can't tell which applied without checking the job |
| `Tube & Fitting` | A construction method, not a type of works — doesn't correspond to any approved category |
| `System Scaffold` | Same — a construction method, not a type of works |
| `Suspended Scaffold` | Structurally distinct (hung from above) from anything on the approved list; the closest candidate (Access Scaffold) isn't a confident match |

**Confident aliases mapped automatically** (the dictionary covers more than this; these are the ones the brief named explicitly plus the old pre-existing controlled list's values that map cleanly onto the new one):

| Legacy value | Mapped to |
|---|---|
| `Bird Cage`, `Birdcage Scaffold` (old controlled value) | Birdcage (Internal/External) |
| `Temp Roof` | Temporary Roof |
| `Access Scaff` | Access Scaffold |
| `Staircase Tower` (old controlled value) | Staircase / Tower |
| `Propping & Shoring` (old controlled value) | Propping / Shoring |
| `Cantilever Platform` (old controlled value) | Cantilevered Scaffold |

**Records requiring manual review, from the only real data available here** (`prisma/seed.ts`): `Façade Scaffold` (×2 jobs), `Gantry & Loading Bay`, `Tube & Fitting`, `System Scaffold` — 5 of the 8 seeded Design jobs. Run `npx tsx scripts/preview-works-type-migration.ts` to reproduce this table directly, or against a real values list per the note above.

**Validation — enforced server-side, not just in the UI.** Both `POST /api/jobs` and `PATCH /api/jobs/[id]` reject (422) a `typeOfWorks` that isn't one of the 18 approved values, and reject a missing/empty `customTypeDescription` whenever the *effective* post-request `typeOfWorks` is `"Other"` — "effective" meaning the value after merging the request against the existing row, since a PATCH might change one of the two fields without touching the other. Switching `typeOfWorks` away from `"Other"` automatically clears any existing `customTypeDescription` server-side, so stale description text can't linger under a real category. This matters because the job form's new `TypeOfWorksCombobox` only ever offers the approved list — but nothing stops a direct API call from sending arbitrary text, so the UI restriction alone wouldn't have satisfied "no new arbitrary values should be created."

**UI — `TypeOfWorksCombobox`** (`components/type-of-works-combobox.tsx`) is a searchable select, not a free-text-with-suggestions field like `DesignerCombobox`: typing only ever filters the dropdown, and the committed value can only change via clicking one of the 18 entries. Closing without picking anything reverts the visible text to the current value — there's no path from typing to an arbitrary stored value, which is the entire point. When `"Other"` is selected, a required "Specify type of works" field appears immediately below it.

**Two other write paths needed fixing, not just the form.** `POST /api/quotes/[id]/convert` previously copied `quote.description` (free text) straight into `typeOfWorks` — exactly the kind of write that would have reintroduced uncontrolled values immediately. It now sets `typeOfWorks: "Other"` and `customTypeDescription: quote.description` instead. `POST /api/jobs/[id]/revisions` now also copies `customTypeDescription` from the parent alongside `typeOfWorks`, since a revision of an "Other"-type job previously would have inherited the category but silently lost the description that actually explained it.

**Filtering, search, and reporting:**
- A new `typeOfWorks` filter (`WhereClause.typeOfWorks`, `SORT_WHITELIST`/query param wired through `GET /api/jobs`) and a matching dropdown in the jobs table's filter bar — genuinely practical now that the field is a clean controlled vocabulary; it wouldn't have been worth building against free text.
- The full-text search clause now also matches `customTypeDescription`, not just `typeOfWorks` — otherwise every "Other"-type job would only ever be findable by searching the literal word "Other", since that's all that's left in the now-controlled field; the real descriptive text lives in `customTypeDescription`.
- `billingHandoffDb.buildAccountsHandoverSnapshot()` (§20) shows the real custom description instead of the literal word "Other" for the Accounts Handover export's Project Name and Description columns — "Other" on its own told accounts nothing.
- The jobs-table CSV export gained `Custom Type Description` and `Originally Entered As` columns. While fixing this, a **pre-existing, unrelated bug** was found and fixed: the CSV's header row and the actual row values had been offset by one for five columns (the header said "Item Type" over what was actually `address`, etc.) — every export before this fix had correctly-labelled headers over the wrong data for those columns.

**Display:** `TypeOfWorksBadge` and the job detail page now show the real `customTypeDescription` instead of the bare word "Other" wherever `typeOfWorks = "Other"`. The job detail page also shows "Originally entered as: …" whenever `legacyTypeOfWorks` is set, so anyone looking at a migrated record can see exactly what was actually typed before the migration ran, not just what it became.

**Files changed:** `lib/constants.ts` (new `WORKS_TYPES`, `OTHER_WORKS_TYPE`, `isValidWorksType`), new `lib/works-type-migration.ts`, `lib/db.ts` (schema, migration, `typeOfWorksMigrationLogDb`, search/filter clauses, snapshot fixes), `lib/types.ts`, new `components/type-of-works-combobox.tsx`, `components/type-of-works-badge.tsx`, `components/job-form.tsx`, `components/jobs-table.tsx`, `app/jobs/[id]/page.tsx`, `app/jobs/board/page.tsx`, `app/billing/page.tsx`, `app/api/jobs/route.ts`, `app/api/jobs/[id]/route.ts`, `app/api/jobs/[id]/revisions/route.ts`, `app/api/quotes/[id]/convert/route.ts`, `app/api/health/route.ts` (canary row used an invalid placeholder value), new `app/api/type-of-works-migration-log/route.ts` + `[id]/review/route.ts`, new `scripts/preview-works-type-migration.ts`.

**Deliberately not done:** the seed data (`prisma/seed.ts`) still creates jobs with several now-uncontrolled values (`Façade Scaffold`, `Tube & Fitting`, etc.) — left as-is on purpose, so a fresh `npm run db:seed` + first app boot actually exercises the migration end-to-end and populates `TypeOfWorksMigrationLog` with real flagged entries, rather than starting from data that's already compliant and never demonstrating the feature at all.

---

## 23. Backup & restore system

A full-application backup/restore system, admin-only (`/backups`), built around this app's actual scale and architecture rather than infrastructure it doesn't have: no S3, no Redis/queue, no separate worker process — just this Node server and SQLite.

**Storage.** `/backups/<folderName>/` at the project root (`BACKUPS_DIR`, overridable via the `BACKUPS_DIR` env var), never under `public/` so Next.js never serves it as a static file. Each backup folder holds `data.json` (every table, as `{ "TableName": [rows...] }`), `manifest.json` (table list, row counts, total rows, sha256 checksum, size), and `metadata.json` (app version from `package.json`, a manually-bumped `SCHEMA_VERSION` constant, timestamp, trigger type, triggering user). `/backups/` is gitignored.

**Non-blocking, honestly described.** `better-sqlite3` is fully synchronous — there's no async driver to lean on for free. `streamExportData()` (`lib/backup-service.ts`) reads each table via `.iterate()` (a cursor, never `.all()` — doesn't materialize a whole table in memory) and yields back to the event loop via `setImmediate` every 500 rows and between tables, so a large export doesn't monopolize the single Node process for one unbroken stretch. `POST /api/backups` creates the `BackupJob` row and returns immediately (202) without awaiting the export — the actual work runs as a detached `void runBackup(...)` call, which is "asynchronous, non-blocking" in its honest, right-sized form for a single-process app at this scale. If this app's data volume ever grew by orders of magnitude, the next real step would be a Node `worker_thread` with its own SQLite connection for genuine parallelism — a bigger change than four users and a few thousand rows currently justify.

**Reliability.** `BackupJob` rows are permanent — never deleted, even once retention prunes the underlying file (`fileDeletedAt` marks that separately, distinct from the row itself). A startup check (`recoverStuckBackupJobs()` in `lib/db.ts`, alongside the other startup migrations) marks any `BackupJob` still `RUNNING` as `FAILED` — without this, a server crash or restart mid-backup would leave a job stuck "running" forever, since nothing else would ever come back to it on a fire-and-forget single-process design. Retry creates a *new* `BackupJob` (`retryOfId` linking back) rather than mutating the failed one, consistent with this codebase's never-mutate-history convention elsewhere (StatusHistory, ExportBatch, etc.).

**Security.**
- Every admin route goes through `requireRole(["ADMIN"])`.
- **Path traversal / enumeration:** the only client-supplied value that ever influences a filesystem path is a `BackupJob.id`, used purely as a database lookup key — the actual path comes from `folderName`, set server-side at backup time and never accepted from a request. `GET /api/backups/download` additionally re-resolves the path and verifies it's still inside `BACKUPS_DIR` before reading, as a defense-in-depth check that should be structurally unreachable but costs nothing to keep.
- **Signed URLs:** this app has no cloud storage to delegate this to, so `lib/backup-token.ts` implements the equivalent from scratch — an HMAC-SHA256 signature over `backupId:expiryTimestamp` using a server-only secret (`BACKUP_DOWNLOAD_SECRET` env var; falls back to a fixed, loudly-logged dev secret if unset — that fallback must never reach a real deployment). `POST /api/backups/[id]/download-link` (session-gated) issues a 10-minute token; `GET /api/backups/download` (deliberately *not* session-gated — the token itself is the credential) verifies it before serving anything. `timingSafeEqual` is guarded against a length-mismatch throw, since an attacker-controlled token can easily be the wrong length and that must read as "invalid," not crash the request.
- **Audit log.** `BackupAuditLog` is separate from `BackupJob` and records every action — including ones that change nothing, like a rejected restore (wrong confirmation phrase, checksum mismatch) or a download-link issuance — specifically so "who tried to restore and was refused" is still on the record, not just successful actions.

**Restore — the highest-risk operation in this codebase, kept in its own file (`lib/backup-restore-service.ts`) on purpose.** In order:
1. The confirmation phrase must be the exact literal string `"RESTORE"` — checked server-side in the API route, not just by the UI's modal. The UI is a convenience; the route is the actual boundary.
2. The backup must be `COMPLETED` and not yet pruned by retention.
3. The data file's sha256 is recomputed and compared against the checksum recorded at backup time — a corrupted or modified file is refused before anything destructive happens.
4. **A fresh safety backup of current state is taken and must itself complete successfully before the destructive part proceeds.** Unlike ordinary backups, this one is `await`ed directly rather than fire-and-forget — there's no point starting a destructive restore before confirming the safety net actually exists. If the safety backup fails, the restore is aborted entirely and nothing is touched.
5. The actual restore runs with `PRAGMA foreign_keys = OFF` (SQLite can't otherwise tolerate bulk-deleting and reinserting self-referential rows — `Job.parentJobId` pointing at another `Job` — in one pass without a carefully hand-maintained table order, which `Job` alone makes fiddly) inside one `db.transaction()`. **`PRAGMA foreign_key_check` runs *inside* that same transaction**, not after — an earlier draft of this ran the check after `db.transaction()` had already returned, which would have meant the bad data was already durably committed by the time a violation was caught, making "rolled back" a lie. Throwing from inside the transaction callback is what makes better-sqlite3 actually roll back instead of commit; this was caught and fixed during implementation, not left as a latent bug. `foreign_keys` is always re-enabled in a `finally`, so a thrown error can't leave the connection with enforcement permanently off for every later request.
6. **Schema drift is tolerated, not fatal.** If the backup's `data.json` contains a table that no longer exists in the live schema, it's skipped (and reported in the result). If a row contains a column the live table no longer has, that column is silently dropped from the insert; if the live table has a column the backup row doesn't, it's simply left at its default/NULL. A backup taken before a schema migration should still be restorable to the extent the data overlaps, not rejected outright.

All of the above — the full round trip (export → simulated data loss → restore, including a self-referential FK survives correctly), checksum-mismatch rejection, and schema-drift tolerance — were verified for real against actual SQLite (via Python's `sqlite3`, since `better-sqlite3`'s native binding doesn't load in this sandbox) rather than just read as "looks correct." The transaction-timing bug above was caught specifically because of that verification step.

**Scheduling.** `lib/backup-scheduler.ts`, started once via `instrumentation.ts`'s `register()` (Next.js's stable startup hook) — an in-process `setInterval` checking hourly whether a backup has completed yet today, running one (`trigger: "SCHEDULED"`) if not, targeting roughly 02:00 server time. Stated plainly: if the server is down at the scheduled hour, that day's backup is simply missed. An external cron hitting `POST /api/backups` would be more robust against the server being down, but needs its own service-account credential story that wasn't asked for — the in-process scheduler is the zero-infrastructure default appropriate for this app's actual scale.

**Retention.** `runRetentionCleanup()` runs automatically after every successful backup — keeps the most recent 30 `COMPLETED` backups' files, deletes the rest (oldest first), and marks each pruned one's `fileDeletedAt` rather than deleting its `BackupJob` row. The historical record that a backup happened outlives the file.

**UI.** `/backups` — KPI row (last backup status/time, completed/failed counts, retention setting), "Create Backup Now" (refuses to start a second one while one's already in flight), "Download Latest Backup", a history table (status pill, trigger type, triggering user, row count, size, duration, per-row download/retry/restore actions), and the restore flow's confirmation modal — explicit red warning copy, requires typing `RESTORE` exactly, states plainly that current data will still be replaced if the restore succeeds.

**Files:** `lib/backup-service.ts`, `lib/backup-restore-service.ts`, `lib/backup-token.ts`, `lib/backup-scheduler.ts`, `instrumentation.ts`, `app/backups/page.tsx`, `app/api/backups/route.ts` + `[id]/route.ts` + `[id]/download-link/route.ts` + `[id]/retry/route.ts` + `[id]/restore/route.ts` + `download/route.ts` + `audit-log/route.ts`, `lib/db.ts` (`BackupJob`/`BackupAuditLog` schema + `backupJobDb`/`backupAuditDb`), `lib/permissions.ts`, `components/side-nav.tsx`, `.gitignore`.

**A real bug, found only by actually running the full restore sequence end-to-end, not by code review.** This sandbox gained a genuinely working `better-sqlite3` binding partway through this project (rebuilding it from source against the locally-installed Node headers succeeded, after the prebuilt binary had been missing for the entire project up to that point — see the note at the end of this section). With a real server actually running, a full trigger → poll → download → restore sequence was run for real, and the restore step revealed that `BackupJob` and `BackupAuditLog` — being ordinary tables, captured in every backup's `data.json` like everything else — were being wiped and overwritten by the *restored* backup's own snapshot of those tables during a restore. Concretely: restoring an old backup reverted the live `BackupJob` history back to whatever it looked like at that old point in time, silently erasing every backup taken since then from the table — including the safety backup the restore had just taken seconds earlier specifically to protect against itself. The files survived on disk (retention/cleanup never touched them), but the database row needed to find or download them through the UI was gone, directly contradicting the "`BackupJob` rows are permanent" guarantee documented above. Fixed by excluding `BackupJob`/`BackupAuditLog` from both the wipe and the reinsert during restore — they're the backup system's bookkeeping *about itself*, not application data to rewind — and the result now reports `tablesExcludedByDesign` explicitly rather than leaving the exclusion silent. Re-verified after the fix: a full trigger → restore cycle now leaves all three `BackupJob` rows (the pre-existing backup, the one restored from, and the safety backup) correctly present and `COMPLETED` afterward.

**Note on `better-sqlite3` in this sandbox:** every earlier reference in this document to "the native binding doesn't load here" reflected a missing prebuilt binary, not an unfixable environment limit — `cd node_modules/better-sqlite3 && npx node-gyp rebuild --release --nodedir=/usr` (pointing at the system's already-installed Node headers at `/usr/include/node`, since downloading them from nodejs.org is blocked by this sandbox's network allowlist) compiles it successfully. Worth doing early in any future session that needs to genuinely run this app rather than reason about it statically.

**Suggested follow-ups, not built:** a literal multi-file `.zip` of the backup folder instead of one combined JSON (would need a new dependency for marginal benefit at this data volume); an external-cron-friendly trigger path with its own service-account credential, for deployments that need scheduling resilient to the server being down at the scheduled hour; encrypting `data.json` at rest, if backups are ever stored somewhere less trusted than this server's own disk.

---

## 24. Quote PDF template — pixel-precise rebuild

The quote PDF (`POST /api/quotes/[id]/pdf`) was rebuilt from scratch against a real reference quotation template, rather than approximated. Methodology: the reference PDF's own embedded coordinate data was extracted directly with `pdfplumber` (exact x/y/width/height for every text run, rectangle, and line, plus per-character font name and size) — every position in the new route is one of those measured values, not an eyeballed guess. `pdf-lib` was kept (the existing approach was never the problem; the layout code was) — there was no reason to switch to an HTML/Puppeteer pipeline for a layout this capable of being expressed as absolute-positioned text and shapes.

**Logo:** losslessly extracted as a raw JPEG directly from the reference PDF's own embedded image stream (`pikepdf`, reading the `/DCTDecode`-filtered XObject's raw bytes, which *is* a valid JPEG file as-is) — the company's own real logo, reused in the company's own software, not redrawn or approximated. `public/branding/oryx-logo.jpg`.

**Fonts:** the reference uses Arial (the big heading text) and Trebuchet MS (everything else) — neither is licensed for embedding here, and neither ships with this environment. **Liberation Sans** (SIL Open Font License, confirmed via `dpkg -l` — explicitly built by Red Hat as a metrically-identical free substitute for Arial, same glyph widths) was used throughout instead of a generic fallback, and embedded properly via `@pdf-lib/fontkit` (a real dependency added to the project — pdf-lib only lists it as a *dev* dependency of its own test suite, so consuming apps must install it separately for custom font embedding to work at all). `public/fonts/LiberationSans-{Regular,Bold}.ttf`.

**Schema additions — genuinely necessary, not incidental.** The reference's defining structural feature is a multi-line itemised table with a VAT breakdown (Subtotal/Taxable/VAT rate/VAT due/TOTAL) and a "Customer ID" reference code — none of which the existing single-`quoteValue`/single-`description` model could represent. Three additive changes, all backwards compatible by construction:
- `QuoteLineItem` table (optional — zero rows means "render the existing description+quoteValue as one line," so every quote created before this feature existed is completely unaffected).
- `Quote.vatRate` (nullable — `NULL`, the default, means "no VAT breakdown, single total," exactly the old behaviour; a number switches on the breakdown). Important assumption, stated explicitly rather than silently decided: when a rate is set, `quoteValue` (or the line items' sum) is treated as the VAT-*exclusive* subtotal, matching the reference's `Subtotal === Taxable` presentation — this doesn't retroactively change what any existing `quoteValue` *means*, since the breakdown only appears at all when `vatRate` is explicitly set.
- `Client.accountCode` — free text, shown as "Customer ID."

**Real bugs found and fixed by actually rendering the output, not by reading the code:**
1. `PRAGMA`-style measurement transcription error: "TOTAL" and "£" were positioned using the reference's measured *right*-edge coordinates as if they were left-aligned start positions, causing the two to visually merge into "TOTA£L" the first time the PDF was actually rendered and inspected.
2. Terms (left column) and totals (right column) were wrongly coded as competing for the same vertical space — a `totalsY < threshold ? … : …` fallback that, traced through, *always* took the branch that pushed the terms box down regardless of actual content length, overlapping the fixed-position footer. They're side-by-side columns at the same vertical anchor (the table bottom), not sequential; the fix removed the dependency entirely.
3. Line-item descriptions longer than 2 lines were being silently truncated, and the row-count math that was meant to accommodate long items (`lineItems.length * 2`) was itself wrong. Replaced with: each row grows to fit however many lines its description actually needs, and if the whole table genuinely can't fit on one page, it continues onto a second page with the header row repeated and a "Continued on next page…" / "(continued)" marker — real pagination, not a length cap.
4. The CUSTOMER/SITE summary block sits in a fixed-height slot directly above the (fixed-position) table — an unusually long client name, contact name, address, or description here could have pushed into the table header. Fixed by truncating each of those four lines to one line with an ellipsis if it doesn't fit; nothing is lost from the document overall, since the *line-items table itself* still shows the full, properly-wrapped, never-truncated text.

All four were caught and fixed specifically because the PDF was actually generated and visually inspected (rendered to a PNG and compared directly against the reference, plus a deliberate extreme-length stress test) rather than reviewed as TypeScript alone — none would have been obvious from the code in isolation.

**Verified, concretely:** a quote built from the reference's own exact data (REC PM / Nath / 7 Honestone, Bideford / the same two line items / 20% VAT) renders side-by-side near-indistinguishably from the original. A quote with neither line items nor a VAT rate set (the old creation path) renders correctly with a single total and no breakdown — full backward compatibility confirmed, not assumed. A mixed-VAT quote (one line item taxable, one not) produces mathematically correct Subtotal/Taxable/VAT-due/TOTAL figures, with the "X" mark appearing only on the taxable line.

**Files:** `app/api/quotes/[id]/pdf/route.ts` (full rewrite), `lib/db.ts` (`QuoteLineItem` schema + `quoteLineItemDb`, `Quote.vatRate`, `Client.accountCode`), `app/api/quotes/route.ts` + `[id]/route.ts` + new `[id]/line-items/route.ts`, `app/quotes/page.tsx` (VAT rate field + line-items editor on `QuoteForm`), `app/clients/page.tsx` (Customer ID field), `lib/types.ts`, `public/branding/`, `public/fonts/`.

**Not done:** a settings page for editing the terms-and-conditions text or company letterhead details (currently constants in the route file, deliberately — they're company policy/letterhead, not per-quote data, and editing them is a code change, not a runtime one, until there's a real need otherwise).

### §24 addendum — VAT defaults to 20%, and a real server-side bug found via direct API testing

Two changes: new quotes now default to 20% VAT in the create form (`app/quotes/page.tsx`'s `EMPTY_FORM`) rather than blank/off — editing an existing quote still shows whatever that quote actually has stored, untouched. This only changes the form's pre-filled default, not the database column's own default (`Quote.vatRate` is still nullable, still defaults to `NULL` at the schema level — old quotes and any future direct-`quoteDb.create()` caller are unaffected).

**A real bug, found by testing the multi-line-item create/update flow directly against the API rather than only through the form.** `quoteValue` was only being kept in sync with the line items' total on the *frontend* (`QuoteForm`'s submit handler) — calling `POST /api/quotes` or `PATCH /api/quotes/[id]` directly with line items and a deliberately wrong `quoteValue` (e.g. sending `"1"` alongside line items that actually summed to 4500) was accepted as-is; the server trusted whatever total the client claimed rather than computing it. Fixed in both routes: whenever line items are present in the request, the server now computes their sum itself and uses that as `quoteValue`, ignoring whatever value was submitted alongside them — the frontend's own sync logic is now a UX convenience, not the only thing standing between a user and an incorrect quote total. Re-verified directly: a `POST` with `quoteValue: "0"` and four real line items correctly returns `quoteValue: 3880`; a subsequent `PATCH` adding a fifth line item and submitting `quoteValue: "1"` correctly returns `quoteValue: 4500`, with the bogus `"1"` silently discarded rather than accepted.

Confirmed end-to-end against the exact scenario this was built for — one site, several different designs, one tally: a quote for "22 Queens Square, Bristol" with five line items (Access Scaffold, Birdcage Scaffold, Temporary Roof, a Site Visit, and Edge Protection, each its own type of works) renders correctly as five distinct table rows under the one SITE block, summing to a server-verified Subtotal of £4,500.00 and a VAT-inclusive TOTAL of £5,400.00 at the default 20% rate.

### §24 third addendum — two reported issues, both with real root causes found by inspection and testing, not assumed

**Issue 1 — per-job descriptions weren't usable for detailed, multi-line text.** Each line item already had a real `description` column (`QuoteLineItem.description`), so the data model was never the gap — the problem was entirely in the editor UI and the PDF's text handling:
- `QuoteForm`'s per-line description field was a single-line `<Input>`, crammed into one tight flex row alongside the amount and VAT checkbox. Genuinely couldn't be used for a "detailed description," and didn't support typing more than one line at all. Replaced with a proper `<Textarea>` (3 rows), restructured into a clearer per-item card (description on its own row, amount/VAT below it), and the section relabelled from "Itemised lines" to "Individual jobs / work items" with copy describing the actual use case (several jobs at one site).
- Separately, and more subtly: `wrapText()` in the PDF route split the whole description on `/\s+/` — which treats a literal newline exactly like a space. A deliberate paragraph break typed into the new textarea was being silently flattened into one continuous run of text by the time it reached the PDF, with no error and no visual indication anything had been lost. Fixed by splitting on explicit `\n` first (preserving every hard break, including a blank line for a double break) and only word-wrapping *within* each resulting segment.

**Issue 2 — every quote's "Prepared by" line showed whoever was currently logged in, not who actually created it.** Traced precisely, end to end, rather than assumed:
- `quote.createdBy` was already being captured correctly at creation time from the real session (`useUser()` → `createdBy: userName` in `doCreate`) — this part was never broken.
- The actual bug: the "Generate PDF" button (`generatePdf()` in `app/quotes/page.tsx`) sent `{ preparedBy: userName }` on *every* click — the *current* session's name, not the quote's. The PDF route's fallback chain (`body.preparedBy ?? quote.preparedBy ?? quote.createdBy ?? "Oryx Design Ltd"`) always preferred that request-body value when present, so the real creator was never actually reached in practice. Worse, the route then wrote that same wrong value back onto `Quote.preparedBy` on every generation — so the mistake didn't just display wrong once, it got permanently baked into the record, contaminating every future regeneration by anyone, including the original creator. ("System Admin" specifically traces back further still: the standard `prisma/seed.ts` demo data creates zero named `User` rows — it relies entirely on `bootstrapDefaultAdmin()`'s one bootstrap account, literally named "System Admin," as the only identity available until real team members are added via `/users`. That's a real, separate, worth-knowing gap in the demo data, not a code bug — once real named users exist and someone switches to one, the fix below correctly shows their name instead.)
- Fixed by removing the override mechanism entirely rather than trying to special-case it: `generatePdf()` no longer sends any body at all, the PDF route no longer reads or accepts a `preparedBy` field from its request, and "Prepared by" on the PDF is now always exactly `quote.createdBy` — set once, at creation, never touched again. The route also stopped writing `preparedBy` back to the quote record on generation, removing the compounding part of the bug. (The "Prepared by:" *label* itself is left exactly as the reference template has it — only the value source changed, matching "maintain existing PDF styling and layout.")
- Verified directly, not assumed fixed: created a quote as one named user, generated its PDF (showed that user, correctly), then switched to a *different* user and regenerated the same quote's PDF — it still showed the original creator, unchanged. This is the literal bug scenario, reproduced and confirmed resolved.

**A third, unrelated bug found purely by rendering the fix for Issue 1 and looking at the output.** A two-paragraph description on the first line item made that row tall enough that the table, terms box, and the fixed-position footer below it started to overlap — traced to two compounding mistakes in the pagination logic from the original build: the empty-row padding loop (added after the real items, to reach the reference's minimum 8 visual rows) had no awareness of the same "would this run off the page" check the real items get, so it could keep padding straight past the safe zone; and the real-item check itself was guarded by `rowsDrawnOnThisPage > 0`, added on a mistaken assumption that checking unconditionally could loop forever — it can't, since this is a bounded `for...of` over the line items array, not a retry loop — and that guard's only actual effect was exempting an oversized *first* item of any page from ever triggering a page break at all. Confirmed fixed with a deliberately pathological test (a single ~20-line description as the only line item): it now correctly continues onto a second page, headed "(continued)," with totals/terms/footer landing cleanly below it — and a normal two-item quote, and the original reference-matching "golden" comparison, both re-verified to still render exactly as before on a single page with no regression.

**Files modified this session:** `app/quotes/page.tsx` (line-item textarea + card layout, removed the `preparedBy` override from `generatePdf`), `app/api/quotes/[id]/pdf/route.ts` (`wrapText` newline handling, `preparedBy` resolution simplified to `quote.createdBy` only, pagination check fixes, removed the now-pointless request body entirely). No database migration needed — every field involved (`QuoteLineItem.description`, `Quote.createdBy`) already existed; this was a UI/logic fix, not a schema gap.

---

## 25. Billing-handoff reversal bug — Complete jobs reverted to an earlier status stayed in the Billing queue forever

**Root cause, confirmed by reading the actual code, not assumed.** `jobDb.update()`'s status-change branch only ever ran `_recordBillingHandoffIfIssued()` when the *new* status was `ISSUED` — there was no corresponding branch for the reverse direction. A job moved from Complete back to New Request, In Progress, or Requires Checking simply had nothing happen to its existing `BillingHandoff` row at all; it stayed in the table, uncleared, exactly as if the job were still Complete. The Billing tab and the dashboard's "awaiting accounts" total both query that table directly with no caching layer, so they faithfully displayed the stale handoff — the bug was entirely in *when a handoff gets removed*, not in how it's displayed.

**The fix — `jobDb.update()` (`lib/db.ts`).** When a status change moves a job *away* from `ISSUED`, a new step (`_retractBillingHandoffOnRevert()`) runs before the status-history row is written:
- If the job's current handoff is still **uncleared** (accounts hasn't actioned it), it's **deleted outright** — nothing irreversible has happened to it, so removing it is both safe and exactly what "must not appear in the Billing tab" requires.
- If the job's most recent handoff has **already been cleared** (linked into a real, permanent `BillingExportBatch` snapshot), it is **never touched** — consistent with this codebase's standing rule that audit trails (`StatusHistory`, `ExportBatch`, `ClientHold`, and now this) are never deleted. Instead, the status-history row being written for this exact transition gets an explicit note: *"this job had already been cleared for accounts (batch X) before being reverted from Complete. That historical billing record was not deleted."* — visible, not silently lost.

**A real, necessary schema change — not optional polish.** `BillingHandoff` originally had a blanket `UNIQUE(sourceJobId)` table constraint (one handoff per job, ever). That's wrong once reversal is a supported flow: a job legitimately billed, cleared, reverted, reworked, and completed again needs a *second* handoff for that second completion — the first is now closed history. Replaced with a **partial unique index**, `CREATE UNIQUE INDEX idx_handoff_active_unique ON BillingHandoff(sourceJobId) WHERE clearedByAccountsAt IS NULL` — enforcing "at most one *active* handoff per job" while allowing any number of historical cleared ones to accumulate over a job's lifetime. SQLite can't `ALTER TABLE` to drop an inline constraint, so this uses the same probe-and-rebuild pattern already established for the `Job` table earlier in this file: a transaction attempts to insert two rows with the same `sourceJobId` (one cleared, one not) and rolls back the probe regardless of outcome; if it fails, the table is rebuilt without the old constraint (data copied across, nothing lost) before the partial index is created. Verified directly against a simulated pre-migration database carrying real rows: the rebuild triggered correctly, the constraint was gone afterward, and all existing rows survived intact.

`billingHandoffDb.findBySourceJobId()` — previously documented as "at most one row, since sourceJobId is UNIQUE" — was updated to explicitly filter to the active (uncleared) row, since that assumption no longer holds; a new `findHistoryBySourceJobId()` returns the full lifetime list when that's what's actually needed.

**Verified for real**, against a running server, not just reasoned about:
- Complete → In Progress / → Requires Checking / → New Request: handoff deleted, job vanishes from the awaiting list, active-handoff lookup returns null — all three reversal scenarios confirmed.
- New Request / In Progress / Requires Checking on their own: never appear in the awaiting list (already true before this fix; re-confirmed, no regression).
- Complete → In Progress → Complete again: exactly one active handoff exists afterward, never two — re-using the same job across a full revert-and-redo cycle.
- The data-integrity-sensitive case — Complete → cleared by a real export batch → reverted → re-completed: the original cleared handoff was left completely untouched (still linked to its real batch id), the status-history note appeared exactly as designed, and re-completing created a genuine *second*, fresh, active handoff rather than silently failing — ending with exactly 2 total rows for that job (1 historical + 1 active), and the job correctly back in the awaiting billing list.
- Concurrency: not separately tested with a live race, since it doesn't need to be — the entire fix runs inside the same single `db.transaction()` `update()` already wraps every status change in, and SQLite's single-writer model serializes concurrent transactions at the engine level regardless of which logic runs inside them. There's no new concurrency surface this fix introduces.

**Files:** `lib/db.ts` (`BillingHandoff` schema comment + migration, `jobDb.update()`, new `jobDb._retractBillingHandoffOnRevert()`, `billingHandoffDb.findBySourceJobId()` / new `findHistoryBySourceJobId()`). No frontend changes were needed — the Billing page and dashboard already query the table fresh on every load.

---

## 26. Board and Commercial removed

Dependency analysis was done before deleting anything, specifically because "commercial" in particular is also an ordinary English word used throughout the codebase for things that aren't the Commercial *page* — `Job.commercialNotes`, the Accounts Handover export's "Commercial Information" sheet, and `canViewCommercialValues()`'s redaction logic all needed to survive untouched.

**Removed:** `app/jobs/board/`, `app/api/jobs/board/`, `app/commercial/`, `app/api/commercial/`; `jobDb.findForBoard()` (its only caller was the deleted route); `commercialDb.jobsByValue()` / `quotedInMonth()` / `issuedInMonth()` / `awaitingAccountsValue()` (confirmed via grep that each had exactly one caller — the deleted `/api/commercial` route — `awaitingAccountsValue()` in particular is *not* what powers the Billing/Dashboard "awaiting accounts" figure, which comes from `billingHandoffDb.stats()`, a different function entirely; easy to assume otherwise from the name alone); the `CommercialReport` type; the `board`/`commercial` entries in `lib/permissions.ts`'s `MODULES`, in `side-nav.tsx`'s icon map and `ACTIVE_PREFIX`, and the two `href="/commercial"` dashboard shortcuts (the stats themselves stay — `GlanceStat`'s `href` was made optional so they render as plain, non-clickable figures instead of removing the figures entirely).

**Confirmed kept, untouched:** `commercialDb.totalQuotedValue()` / `totalIssuedValue()` / `avgJobValue()` (still used by `/api/stats` — i.e. the Dashboard — confirmed via the same grep pass), `Job.commercialNotes` and every Job-form/job-detail-page usage of it, `canViewCommercialValues()`, the Accounts Handover export's Commercial Information sheet, and every other module listed in the brief (Jobs, Quotes, Billing, Customers, Reports stats, Users, Authentication).

**Mobile navigation:** there isn't a separate mobile nav component to update — `side-nav.tsx` is the one navigation surface for every viewport in this app, so removing the two entries there was the complete fix; noted here rather than silently treated as already-done.

**Verified:** `tsc` and `next build` both clean, every route in the build output accounted for with neither `/jobs/board` nor `/commercial` present, and a project-wide grep for every removed route path, type, and function found zero remaining references anywhere outside this file's own removal comments. The lint baseline dropped from 30 to 20 problems as a direct, expected consequence of deleting files that carried some of those pre-existing issues with them — not a sign of anything new being wrong.

---

## 27. Access control — switching was never actually restricted, only the displayed identity changed

**Root cause, confirmed by reading the code, not assumed.** `POST /api/auth/switch` set the session cookie to *any* requested user id with zero verification, and critically, it made no distinction between "nobody has picked an identity for this browser session yet" and "someone is already signed in and wants to become someone else entirely." Any signed-in Engineer could call it with an Admin's id and instantly become that Admin — the sidebar's dropdown offered exactly this, unfiltered, to everyone. The single existing cookie (`oryx_uid`) had no separate concept of "who's really authenticated" versus "who the app is currently acting as," so there was nothing for an authorization check to even compare against. This wasn't a bug in the sense of broken logic — it was, accurately, "a user selector," exactly as the brief suspected, with the permission *checks* (`requireRole`, role redaction) being real and correctly enforced, but resting on an identity that anyone could set to anything.

**The fix — two cookies with two different meanings (`lib/auth.ts`):**
- `oryx_uid` (existing name, kept) — the *active* identity. Unchanged in meaning: every existing attribution field (`createdBy`, `changedBy`, …) and every existing `requireRole()` check still reads this, exactly as before.
- `oryx_real_uid` (new) — the *genuinely authenticated* identity for this browser session. Only ever set by a from-scratch identity pick or a real logout; never altered by impersonation.

A new `getRealUser()` reads the second cookie and is used for exactly one thing: deciding whether a switch is authorized. `getCurrentUser()` (unchanged signature, used everywhere else) keeps reading the first. This split is what makes "acting as a non-admin" genuinely restrict what's accessible for the duration — confirmed directly: an admin impersonating an Engineer gets a real 403 from an Admin-only route, not silently-retained Admin power. It's also what stops impersonation from being a privilege-escalation chain: authorization for *every* switch is checked against the real identity, never the currently-active one, so an admin impersonating an Engineer can't use that session to impersonate a third person — only logging out and back in as the real admin can.

**`POST /api/auth/switch` rewritten** to branch on the real identity's state:
1. No real identity yet (cold start) → proceeds exactly as before, becomes both the real and active identity. There's no credential to check this against — see the explicit limitation below.
2. Real identity re-selecting itself → harmless no-op (or a clean return from impersonation, logged only if one was actually in progress).
3. Real identity switching to someone *else* → impersonation. Allowed only if the real identity's role is `ADMIN`; rejected with a 403 otherwise. Every outcome — started, rejected, ended — is permanently logged.

**New `IdentitySwitchLog` table** (permanent, append-only, same philosophy as `StatusHistory`/`ExportBatch`/`ClientHold` elsewhere in this schema) — records every `SESSION_STARTED`, `IMPERSONATION_STARTED`, `IMPERSONATION_ENDED`, `IMPERSONATION_REJECTED`, and `LOGOUT` event, with both the real and target user's id/name. New `POST /api/auth/exit-impersonation` (a dedicated action, clearer than overloading `switch` with "target equals self" semantics) and `/api/auth/logout` now clears both cookies and logs the event.

**UI (`components/side-nav.tsx`, `components/user-context.tsx`):** the switcher dropdown is now shown in exactly two cases — cold start (anyone, since there's nothing to check yet) and an admin who isn't currently impersonating anyone. A non-admin who's already signed in sees their own identity with no switch option at all and a note explaining why ("only administrators can switch accounts — log out to sign in as someone else"), rather than a dropdown full of options the backend would reject anyway. An active impersonation shows a persistent banner — "Acting as X · Signed in as Y (admin)" — with a one-click exit. `switchUser()` now throws the server's real rejection message on failure instead of silently doing nothing, so the caller can show it.

**Additional requirement — quote PDF creator name.** Already fixed in §24/§24-third-addendum (the `generatePdf()` override removed, the PDF route reading `quote.createdBy` directly) and re-verified here under the new model specifically: a quote created *while an admin is impersonating an Engineer* correctly shows that Engineer's name as both `createdBy` on the record and "Prepared by" on the generated PDF — confirming attribution tracks the active/acting identity precisely as intended, not the real admin underneath it, and not any separately-selectable value.

**An honest, explicitly documented limitation, not silently left unfixed.** There is still no password or credential of any kind. Closing the gap above (switching while already signed in) does not close this one: anyone can still log out and pick a *different* identity from scratch, including an Admin's, because there is nothing to verify that pick against. This is a structural consequence of having no credentials at all, not something `/api/auth/switch` can fix in isolation — genuinely closing it requires adding a real credential (even a lightweight one, like a per-user passcode) that a from-scratch identity pick would need to satisfy. That's a materially different, larger piece of work than was asked for here, and wasn't built unprompted; it's flagged here as the clear next step if this needs to be airtight rather than admin-switching-specifically-hardened.

**Verified for real**, against a running server with two real users (an Admin and an Engineer), not reasoned about in the abstract:
1. Cold-start sign-in as the Engineer — succeeds, logged as `SESSION_STARTED`.
2. That same, already-signed-in Engineer attempts to switch to the Admin — **403**, session unchanged afterward, logged as `IMPERSONATION_REJECTED`.
3. Cold-start sign-in as the Admin, then switching to the Engineer — **200**, session reports `isImpersonating: true` with the real Admin's identity attached, logged as `IMPERSONATION_STARTED`.
4. While impersonating the Engineer, `GET /api/users` (Admin-only) — **403**, proving the restriction is genuinely live, not cosmetic.
5. A quote created in that same impersonated state — `createdBy` is the Engineer's name, confirmed both in the API response and on the actual generated PDF.
6. Exiting impersonation — returns to the real Admin identity; the same Admin-only route now returns **200** again.
7. Logging out — both cookies cleared, `/api/auth/session` reports `user: null`.
8. The full `IdentitySwitchLog` table, read back directly: six rows, in exact chronological order, matching every one of the above events precisely.

**Files:** `lib/auth.ts` (rewritten), `lib/db.ts` (`IdentitySwitchLog` schema + `identitySwitchLogDb`), `app/api/auth/switch/route.ts` (rewritten), `app/api/auth/exit-impersonation/route.ts` (new), `app/api/auth/logout/route.ts`, `app/api/auth/session/route.ts`, `components/user-context.tsx`, `components/side-nav.tsx`. No changes were needed to any individual feature route — every existing `requireRole()` call site automatically inherits the corrected behaviour since it was always reading the same `getCurrentUser()` function, which didn't change its own signature, only what backs it.

---

## 28. v3 design system — Apple-inspired refresh (tokens, primitives, shell)

A real headless browser (Playwright, pointed at an existing Chrome binary already present in this environment rather than one Playwright would normally download) made this rollout verifiable rather than aspirational — every claim below is backed by an actual screenshot, a queried computed style, or a measured bounding box, not just "should work."

**Token changes (`app/globals.css`):** radius roughly doubled across the three-tier scale (control 6→8px, card 8→14px, modal 12→20px), shadows softened and enlarged (lower opacity, bigger blur — depth from diffusion rather than a hard edge), default border lightened (`#E7E5E4` → `#EDEBE9`, since shadow now does more of the separation work). Colours and the accent (`#4640DE`) are unchanged — never the actual gap.

**Two real bugs found during this rollout, not just the planned changes:**
1. **`next/font/google` doesn't work in network-restricted environments.** Confirmed via an actual failed build (403 from `fonts.googleapis.com`). Switched to `@fontsource/inter` + `@fontsource/jetbrains-mono` — real font files via npm, zero CDN dependency anywhere, in any environment, including this one and the user's own deployment if it's ever similarly restricted.
2. **`rem`-based tokens silently scale wrong in this app specifically**, because `html` is set to `font-size: 14px` (not the browser's 16px default) elsewhere in this same stylesheet. `0.875rem` intended as "14px" actually computed to `12.25px` — caught only by querying `getComputedStyle()` directly rather than trusting a screenshot, which wouldn't have shown the ~2px difference clearly. Fixed by specifying every new radius token in raw `px`. Worth knowing: the *original* v1/v2 tokens already had this exact ambiguity at a smaller, easy-to-miss margin (`0.5rem` documented as "8px" actually rendered as 7px) — not introduced here, just finally surfaced and fixed here.

**Also fixed in passing:** `dialog.tsx` had a literal class string `rounded-md-xl` — not a real Tailwind class at all — so every modal in the app had *zero* border radius from it before this fix, independent of any v3 value.

**Primitives updated** (`components/ui/`): button, dialog, input, textarea, select, dropdown-menu, toast — each duplicates Tailwind classes with hardcoded inline `style` objects (a deliberate, pre-existing pattern in this codebase, "guaranteed to render regardless of Tailwind output"), so each needed *both* the class and the inline value updated consistently; updating the theme tokens alone would have had zero visible effect on these specific files. `badge.tsx` and `label.tsx` needed no changes — pills aren't affected by a radius scale, and labels have no radius/border/shadow concerns at all.

**Audited and found already clean, needing zero code changes:** `dashboard-stats.tsx`, `jobs-table.tsx`, `status-badge.tsx`, `work-item-type-badge.tsx`, `type-of-works-badge.tsx`, and the Billing/Clients/Users/Hold-List pages — all reference theme tokens via plain Tailwind classes with no inline overrides, so they inherited the v3 values automatically once the tokens themselves were correct. This was checked file-by-file (grepping for `style={{` and hardcoded hex values) rather than assumed from the primitives' pattern — not every screen has the same override problem, and assuming otherwise would have meant either skipping real work or doing unnecessary work.

**Sidebar:** background `#18181B` → `#1C1C1E` (Apple's literal iOS "system gray 6 dark" rather than Tailwind's zinc-900 — same intent, the real value), active user name and active nav item set to Semibold (600) per the explicit brief, inactive nav items stay Medium (500) for a deliberate hierarchy.

**A real regression found and fixed via this same verification process — not a token issue, a layout one.** The Quotes table's action cell can show up to four buttons depending on a quote's status (PDF download, Edit, Sent/Accept/Reject, and — for an Accepted-but-not-yet-converted quote — "Create Job From Quote"). The button size increase (part of this same v3 pass) was enough to tip that densest combination from "just fits" to "doesn't." Tracing it took several wrong turns worth recording honestly rather than glossing over:
- First assumed it was the fixed-width `<th>` (`w-56`) — widened it, no visible change, because table auto-layout doesn't work the way that assumption implied.
- Then assumed the outer card's `overflow-hidden` was clipping it outright — added an inner `overflow-x-auto` wrapper. `getBoundingClientRect()` reported the button as unclipped (right edge well inside the viewport), yet the screenshot still showed it cut off — because a bounding rect describes *layout* position, not whether an ancestor's `overflow-hidden` is hiding the *rendering* of it, and the outer wrapper still had `overflow-hidden` regardless of what the inner div allowed.
- Simplified to one wrapper with independent per-axis overflow (`overflow-x-auto overflow-y-hidden`) — still visually identical, because the actual constraint turned out to be one level further up: the whole page body is wrapped in `max-w-5xl`, which — same rem-at-14px-root quirk as the token bug above — resolves to 896px, not Tailwind's nominal 1024px. The table's wrapper can never be wider than that, so there was never anywhere for the "overflow" to scroll *to* by default; the button was technically reachable by scrolling right, but landed exactly back at "looks broken" on first paint.
- The actual fix was the cell's content, not the container: shortened the button's label from "Create Job From Quote" to "Create Job" (the row's own context — an Accepted quote, no `jobId` yet — already makes the longer phrasing redundant). Confirmed by direct measurement (button's right edge now at 1068px, comfortably inside the viewport) and a 3×-zoomed pixel crop showing the full button, properly rounded, with "Edit" now visible alongside it too. The widened `<th>` and the `overflow-x-auto` safety net were left in place as a reasonable backstop for any future case that genuinely doesn't fit, even though neither was the actual fix here.

**Verified for real, end to end:** Dashboard, Jobs (list, filter bar, status badges, and the New Job modal — visible rounded corners and a blurred backdrop where there was previously a sharp, radius-less panel), Quotes (empty state, populated list, and the action-button regression above), Billing, Clients, Hold List, and Users — all screenshotted via the real running app, not mocked or assumed.

**Where this leaves off:** tokens, primitives, and the shell are done; every screen audited above is confirmed either already-correct or fixed. Not yet touched: the Clients detail page, Job detail page, and the Backups/Health admin pages — next in line if this continues screen-by-screen as planned.
