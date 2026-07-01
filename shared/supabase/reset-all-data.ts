/**
 * Wipes operational Supabase tables (jobs, clients, quotes, billing, etc.).
 * Preserves app_users and seeded event_categories.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { isSupabaseAdminConfigured } from "@/lib/supabase/config"

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

/** Delete all rows — PostgREST requires a filter; every table uses text `id` PK. */
async function deleteAll(table: string): Promise<void> {
  const { error } = await createAdminClient().from(table).delete().neq("id", "")
  if (error && !isMissingTableError(error)) throw error
}

/** FK-safe order: children before parents. Users and event_categories are kept. */
const WIPE_TABLES = [
  "billing_export_snapshots",
  "billing_handoffs",
  "billing_export_batches",
  "calendar_assignments",
  "calendar_events",
  "status_history",
  "quote_line_items",
  "quotes",
  "jobs",
  "client_holds",
  "archive_log",
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
    await deleteAll(table)
  }

  return { jobCount, clientCount, quoteCount }
}
