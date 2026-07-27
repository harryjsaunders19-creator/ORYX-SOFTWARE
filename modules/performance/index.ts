/**
 * Employee performance module — Admin-only designer KPIs and leaderboard.
 */
export type {
  PerformancePeriod,
  PerformanceOverview,
  PerformanceEmployeeRow,
  PerformancePayload,
} from "./types"

export {
  buildPerformancePayload,
  resolvePerformancePeriod,
  aggregatePerformance,
  normalizeKey,
} from "./services/performance-service"
