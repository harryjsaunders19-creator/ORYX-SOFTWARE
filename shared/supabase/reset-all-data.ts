/**
 * Wipes operational Supabase tables (jobs, clients, quotes, billing, etc.).
 * Preserves app_users and seeded event_categories.
 */
import { createAdminClient } from "@/shared/supabase/admin"
import { isSupabaseAdminConfigured } from "@/shared/supabase/config"

function isMissingTableError(error: { code?: string; message?: string }): boolean {
  if (error.code === "42P01") return true
  const msg = error.message?.toLowerCase() ?? ""
  return msg.includes("does not exist") || msg.includes("could not find the table")
}

async function countTable(table: string): Promise<number> {
  const { count, error } = await createAdminClient()
    .from(table)
    .select("*", { count: "exact", head: true })
  if (error) {
    if (isMissingTableError(error)) return 0
    throw error
  }
  return count ?? 0
}

/** Delete all rows — PostgREST requires a filter; tables with text `id` PK. */
async function deleteAllById(table: string): Promise<void> {
  const { error } = await createAdminClient().from(table).delete().neq("id", "")
  if (error && !isMissingTableError(error)) throw error
}

async function deleteAllSessions(): Promise<void> {
  const { error } = await createAdminClient()
    .from("session_revocations")
    .delete()
    .neq("token_sig", "")
  if (error && !isMissingTableError(error)) throw error
}

/** FK-safe order: children before parents. Users and event_categories are kept. */
const WIPE_TABLES = [
  "leave_calendar_links",
  "leave_requests",
  "password_vault_entries",
  "employee_activity",
  "employee_notes",
  "employee_documents",
  "employee_skills",
  "employee_profiles",
  "backup_audit_logs",
  "backup_jobs",
  "identity_switch_logs",
  "billing_export_snapshots",
  "billing_handoffs",
  "billing_export_batches",
  "calendar_assignments",
  "calendar_events",
  "status_history",
  "quote_line_items",
  "quotes",
  "job_documents",
  "work_items",
  "parent_jobs",
  "jobs",
  "client_holds",
  "client_contacts",
  "archive_log",
  "site_visit_calculations",
  "clients",
] as const

export async function resetSupabaseOperationalData(): Promise<{
  jobCount: number
  clientCount: number
  quoteCount: number
}> {
  if (!isSupabaseAdminConfigured()) {
    return { jobCount: 0, clientCount: 0, quoteCount: 0 }
  }

  const [jobCount, clientCount, quoteCount] = await Promise.all([
    countTable("jobs"),
    countTable("clients"),
    countTable("quotes"),
  ])

  for (const table of WIPE_TABLES) {
    await deleteAllById(table)
  }
  await deleteAllSessions()

  return { jobCount, clientCount, quoteCount }
}
