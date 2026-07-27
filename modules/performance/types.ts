/** Employee performance dashboard DTOs. */

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
}

export interface PerformanceEmployeeRow {
  userId: string
  name: string
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
