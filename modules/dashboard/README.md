# Dashboard

Read-only aggregation of KPIs and summaries from other modules.

**Routes:** `/`, `/dashboard` (redirect), `/api/stats`

**Migration status:** Migrated (Phase 11).

**Public API:** `statsService`, `StatsData`, `DashboardStats`, `DashboardPage`.

**Cross-module deps (via shims):** `jobService`, `quoteService`, `holdService`, `billingHandoffService`.
