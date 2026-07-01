# Client Hold List

Sub-domain of the clients module — active holds, per-client hold CRUD, hold list page.

**Routes:** `/clients/hold-list`, `/api/hold-list`, `/api/clients/[id]/hold`

**Migration status:** **Migrated (Phase 5)** — lives under `modules/clients/hold/`.

**Public API:** `holdService`, `ClientHoldRow`, `ClientHoldWithClientRow`, `HoldListPage` — re-exported from `@/modules/clients`.
