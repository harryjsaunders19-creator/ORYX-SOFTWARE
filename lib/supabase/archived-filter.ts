/**
 * Soft-delete columns (archived_at) were added in 011_soft_delete.sql.
 * When that migration was skipped, PostgREST queries filtering on archived_at
 * fail and break /api/stats. We detect once and skip the filter thereafter.
 */

export function isMissingColumnError(
  error: { code?: string; message?: string } | null | undefined,
  column: string,
): boolean {
  if (!error?.message) return false
  const msg = error.message.toLowerCase()
  const col = column.toLowerCase()
  if (error.code === "PGRST204" && msg.includes(col)) return true
  return msg.includes(col) && (msg.includes("column") || msg.includes("schema cache"))
}

/** false = column confirmed missing; undefined = not yet probed */
let jobsArchivedAtSupported: boolean | undefined
let quotesArchivedAtSupported: boolean | undefined

export function jobsArchivedFilterEnabled(): boolean {
  return jobsArchivedAtSupported !== false
}

export function quotesArchivedFilterEnabled(): boolean {
  return quotesArchivedAtSupported !== false
}

export function disableJobsArchivedFilter(): void {
  jobsArchivedAtSupported = false
}

export function disableQuotesArchivedFilter(): void {
  quotesArchivedAtSupported = false
}

export function noteJobsArchivedFromError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (isMissingColumnError(error, "archived_at")) {
    disableJobsArchivedFilter()
    return true
  }
  return false
}

export function noteQuotesArchivedFromError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (isMissingColumnError(error, "archived_at")) {
    disableQuotesArchivedFilter()
    return true
  }
  return false
}
