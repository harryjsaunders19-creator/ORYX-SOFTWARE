# Import / Export

Bulk Excel import and multi-sheet system export.

**Routes:** `/api/import/excel`, `/api/export/all`

Client/job CSV import APIs remain in their respective modules (`/api/clients/import`, `/api/jobs/import`).

**Migration status:** Migrated (Phase 12).

**Public API:** `globalExportToBuffer`, `buildGlobalExportWorkbook`, `importFromExcelBuffer`, bulk import helpers, `formatImportError`.

**Cross-module deps (via shims):** `jobService`, `clientService`, `quoteService`, `calendarService`, `billingHandoffService`, `userService`; Supabase repos for bulk upsert.
