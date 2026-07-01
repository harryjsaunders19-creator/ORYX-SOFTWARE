/**
 * Archive module — public API.
 */
export { archiveLogService } from "./services/archive-log-service"
export type { LogArchiveOpts } from "./services/archive-log-service"

export type { ArchiveLogRow } from "./types"

export { supabaseArchiveLogRepo } from "./supabase/repository"

export { attachCancelRecords, cancelRecordForJob } from "./cancel-record"

export { default as ArchivedPage } from "./components/archived-page"
