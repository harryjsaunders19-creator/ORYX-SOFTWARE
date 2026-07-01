/**
 * Dashboard module — public API.
 * Aggregates summaries from other modules; owns no domain business logic.
 * @see modules/dashboard/README.md
 */
export { statsService } from "./services/stats-service"

export type { StatsData } from "./types/stats-types"

export { DashboardStats } from "./components/dashboard-stats"

export { default as DashboardPage } from "./components/dashboard-page"
