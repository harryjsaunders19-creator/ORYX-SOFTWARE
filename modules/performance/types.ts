/** Performance & Analytics DTOs. */

export type PerformanceRole = "ADMIN" | "ENGINEER"
export type TrendDirection = "up" | "down" | "flat"

export interface PerformancePeriod {
  from: string
  to: string
}

export interface PerformanceFilters {
  from: string
  to: string
  engineer: string
  clientId: string
  jobType: string
  tag: string
  status: string
}

export interface KpiMetric {
  key: string
  label: string
  value: number
  previousValue: number
  delta: number
  deltaPct: number | null
  trend: TrendDirection
}

export interface ChartPoint {
  key: string
  label: string
  value: number
  valueB?: number
}

export interface StatusBreakdownRow {
  status: string
  label: string
  count: number
}

export interface PerformanceJobRow {
  id: string
  drawingNumber: string
  clientId: string | null
  clientCompany: string
  designer: string
  status: string
  itemType: string
  tags: string[]
  createdDate: string
  completedDate: string | null
  requiredByDate: string | null
  requestedDate: string | null
  parentJobId: string | null
}

export interface PerformanceEngineerRow {
  userId: string
  name: string
  role: PerformanceRole
  fromDirectory: boolean
  jobsCompleted: number
  jobsAssigned: number
  avgTurnaroundDays: number
  avgRevisionsPerJob: number
  siteVisitsCompleted: number
  awaitingChecking: number
  avgJobsPerWeek: number
  completionTrend: TrendDirection
}

export interface PerformanceClientRow {
  clientId: string
  clientName: string
  totalJobs: number
  jobsInPeriod: number
  monthlyPoints: ChartPoint[]
  lastJobDate: string | null
  isNewThisMonth: boolean
}

export interface RevisionAnalytics {
  totalRevisions: number
  averageRevisionsPerJob: number
  jobsRequiringMultipleRevisions: number
  mostCommonRevisionCount: number
  revisionTrendByMonth: ChartPoint[]
}

export interface WorkloadAnalytics {
  jobsCreated: number
  jobsCompleted: number
  currentWorkload: number
  outstandingJobs: number
  averageAgeOfActiveJobs: number
  overdueJobs: number
  dueThisWeek: number
  dueNextWeek: number
}

export interface TimeAnalytics {
  averageDesignTurnaroundDays: number
  medianTurnaroundDays: number
  fastestCompletionDays: number
  longestCompletionDays: number
  averageDaysWaitingForClientInformation: number
}

export interface FilterOptions {
  engineers: { id: string; name: string }[]
  clients: { id: string; name: string }[]
  statuses: { value: string; label: string }[]
  jobTypes: { value: string; label: string }[]
  tags: string[]
}

export interface PerformancePayload {
  period: PerformancePeriod
  filters: PerformanceFilters
  filterOptions: FilterOptions
  kpis: KpiMetric[]
  jobsByMonth: ChartPoint[]
  jobsByWeek: ChartPoint[]
  jobsByDay: ChartPoint[]
  jobsByStatus: StatusBreakdownRow[]
  engineerRows: PerformanceEngineerRow[]
  engineerComparison: ChartPoint[]
  topClients: PerformanceClientRow[]
  inactiveClients: PerformanceClientRow[]
  newClientsInPeriod: number
  revisionAnalytics: RevisionAnalytics
  workloadAnalytics: WorkloadAnalytics
  timeAnalytics: TimeAnalytics
  jobs: PerformanceJobRow[]
}

// Legacy aliases kept for unit-test compatibility.
export type PerformanceOverview = {
  completedInPeriod: number
  inProgress: number
  avgCompletedPerWeek: number
  activeDesigners: number
  awaitingChecking: number
  overdue: number
  totalUsers: number
  adminUsers: number
  engineerUsers: number
}

export type PerformanceEmployeeRow = {
  userId: string
  name: string
  role: PerformanceRole
  fromDirectory: boolean
  completedInPeriod: number
  completedAllTime: number
  avgPerWeek: number
  inProgress: number
  awaitingChecking: number
  overdue: number
  lastCompletedAt: string | null
}
