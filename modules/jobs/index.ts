/**
 * Jobs module — public API.
 * Import from `@/modules/jobs` only; do not reach into subfolders.
 */
export {
  jobService,
  ensureJobInSqliteForBilling,
} from "./services/job-service"

export { historyService } from "./services/history-service"

export { parentJobService, workItemService } from "./services/parent-work-item-service"
export { mixedWorkloadService } from "./services/mixed-workload-service"
export type { MixedWorkloadRow } from "./services/mixed-workload-service"

export type {
  JobRow,
  CreateJobData,
  UpdateJobData,
  StatusHistoryRow,
} from "./types"

export type { ParentJobRow } from "./types/parent-job-types"
export type { DesignWorkItemRow } from "./types/design-work-item-types"
export type {
  ActiveWorkItemListRow,
  ParentJobDashboard,
} from "./types/parent-dashboard-types"

export { supabaseJobRepo } from "./supabase/repository"
export { supabaseStatusHistoryRepo } from "./supabase/status-history-repository"

export {
  compareJobsForList,
  sortJobsForList,
  isDrawingNumberListSort,
  jobListSortBase,
  type JobListSortRow,
} from "./job-list-sort"

export {
  parseSpreadsheet,
  markInternalDuplicates,
  dedupKey,
  IMPORT_FIELDS,
  type ImportField,
  type ParsedImportRow,
} from "./import/import-jobs"

export { JobsTable } from "./components/jobs-table"
export { ActiveWorkItemsTable } from "./components/active-work-items-table"
export { JobForm } from "./components/job-form"

export { default as JobsListPage } from "./components/jobs-list-page"
export { default as JobDetailPage } from "./components/job-detail-page"
export { default as ParentJobDashboardPage } from "./components/parent-job-dashboard"
export { default as JobImportPage } from "./components/job-import-page"
export { default as JobCheckingPage } from "./components/job-checking-page"
