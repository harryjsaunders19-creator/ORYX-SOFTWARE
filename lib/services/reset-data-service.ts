import { isSupabaseAdminConfigured } from "@/shared/supabase/config"
import { resetSupabaseOperationalData } from "@/shared/supabase/reset-all-data"

/**
 * Wipes operational data.
 * - Supabase admin configured: wipe Supabase only (no SQLite import).
 * - Otherwise: wipe local SQLite.
 */
export async function resetSystemData(): Promise<{
  jobCount: number
  clientCount: number
  quoteCount: number
}> {
  if (isSupabaseAdminConfigured()) {
    return resetSupabaseOperationalData()
  }
  const { resetAllData } = await import("@/lib/db/stores")
  return resetAllData()
}
