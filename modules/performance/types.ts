/** Employee performance dashboard DTOs. */

export type PerformanceRole = "ADMIN" | "ENGINEER"

export interface PerformancePeriod {
  from: string
  to: string
}

export interface PerformanceOverview {
  completedInPeriod: number
  inProgress: number
  avgCompletedPerWeek: number
  activeDesigners: number
  awaitingChecking: number
  overdue: number
  /** How many Users-tab people are on the leaderboard. */
  totalUsers: number
  adminUsers: number
  engineerUsers: number
}

export interface PerformanceEmployeeRow {
  userId: string
  name: string
  /** Users-tab role — Admins and Engineers both design jobs. */
  role: PerformanceRole
  /** False when the row is a free-text job designer not in Users. */
  fromDirectory: boolean
  completedInPeriod: number
  completedAllTime: number
  avgPerWeek: number
  inProgress: number
  awaitingChecking: number
  overdue: number
  lastCompletedAt: string | null
}

export interface PerformancePayload {
  period: PerformancePeriod
  overview: PerformanceOverview
  employees: PerformanceEmployeeRow[]
}
