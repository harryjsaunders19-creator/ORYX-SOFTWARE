import { resetAllData } from "@/lib/db/stores"
import { isSupabaseAdminConfigured } from "@/lib/supabase/config"
import { resetSupabaseOperationalData } from "@/lib/supabase/reset-all-data"

/**
 * Wipes all operational data in SQLite and, when linked, Supabase.
 * User accounts are preserved in both stores.
 */
export async function resetSystemData(): Promise<{
  jobCount: number
  clientCount: number
  quoteCount: number
}> {
  if (isSupabaseAdminConfigured()) {
    const counts = await resetSupabaseOperationalData()
    resetAllData()
    return counts
  }
  return resetAllData()
}
