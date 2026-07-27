/**
 * Employee performance module — Admin-only designer KPIs and leaderboard.
 */
export type {
  PerformancePeriod,
  PerformanceOverview,
  PerformanceEmployeeRow,
  PerformancePayload,
  PerformanceRole,
} from "./types"

export {
  buildPerformancePayload,
  resolvePerformancePeriod,
  aggregatePerformance,
  normalizeKey,
  normalizeRole,
} from "./services/performance-service"
