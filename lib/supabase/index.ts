/**
 * lib/supabase — Supabase integration (migration in progress).
 *
 * The app still reads/writes SQLite via lib/db until each module is migrated.
 * Import from here when adding new Supabase-backed code.
 */
export {
  getSupabaseUrl,
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  isSupabaseConfigured,
  isSupabaseAdminConfigured,
} from "./config"

export { createAdminClient } from "./admin"
export { useSupabaseClients, useSupabaseJobs, useSupabaseQuotes, useSupabaseStatusHistory, useSupabaseHolds, useSupabaseBilling } from "./feature-flags"
