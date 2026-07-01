/**
 * Soft-delete columns (archived_at) were added in 011_soft_delete.sql.
 * When that migration was skipped, PostgREST queries filtering on archived_at
 * fail. We probe once per request on archive routes and cache the result for
 * the lifetime of the serverless instance.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { isSupabaseAdminConfigured } from "@/lib/supabase/config"

export function isMissingColumnError(
  error: { code?: string; message?: string } | null | undefined,
  column: string,
): boolean {
  if (!error?.message) return false
  const msg = error.message.toLowerCase()
  const col = column.toLowerCase()
  if (error.code === "42703" && msg.includes(col)) return true
  if (error.code === "PGRST204" && msg.includes(col)) return true
  return msg.includes(col) && (
    msg.includes("column")
    || msg.includes("schema cache")
    || msg.includes("does not exist")
  )
}

/** false = column confirmed missing; undefined = not yet probed; true = present */
let jobsArchivedAtSupported: boolean | undefined
let quotesArchivedAtSupported: boolean | undefined

export function jobsArchivedFilterEnabled(): boolean {
  return jobsArchivedAtSupported !== false
}

export function quotesArchivedFilterEnabled(): boolean {
  return quotesArchivedAtSupported !== false
}

export function jobsArchivedAtAvailable(): boolean {
  return jobsArchivedAtSupported === true
}

export function quotesArchivedAtAvailable(): boolean {
  return quotesArchivedAtSupported === true
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

/** Re-detect archived_at on jobs/quotes — call before archive reads/writes on Vercel. */
export async function probeArchivedColumns(): Promise<void> {
  if (!isSupabaseAdminConfigured()) return
  const sb = createAdminClient()
  const [{ error: jobErr }, { error: quoteErr }] = await Promise.all([
    sb.from("jobs").select("archived_at").limit(1),
    sb.from("quotes").select("archived_at").limit(1),
  ])
  jobsArchivedAtSupported = !jobErr || !isMissingColumnError(jobErr, "archived_at")
  quotesArchivedAtSupported = !quoteErr || !isMissingColumnError(quoteErr, "archived_at")
}
