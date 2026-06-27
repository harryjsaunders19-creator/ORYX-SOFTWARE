/**
 * lib/supabase/feature-flags.ts
 *
 * Opt-in flags for incremental SQLite → Supabase migration.
 * Each module stays on SQLite until its flag is "true".
 */
import { isSupabaseAdminConfigured } from "./config"

function flag(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === "true"
}

/** When true, client CRUD reads/writes Supabase (and mirrors writes to SQLite). */
export function useSupabaseClients(): boolean {
  return flag("SUPABASE_CLIENTS") && isSupabaseAdminConfigured()
}

/** When true, job list/detail CRUD reads Supabase (writes SQLite-first, then mirror). */
export function useSupabaseJobs(): boolean {
  return flag("SUPABASE_JOBS") && isSupabaseAdminConfigured()
}

/** When true, quote CRUD reads Supabase (writes SQLite-first, then mirror). */
export function useSupabaseQuotes(): boolean {
  return flag("SUPABASE_QUOTES") && isSupabaseAdminConfigured()
}

/** When true, job status history reads Supabase (writes SQLite-first, then mirror). */
export function useSupabaseStatusHistory(): boolean {
  return flag("SUPABASE_STATUS_HISTORY") && isSupabaseAdminConfigured()
}

/** When true, client holds read Supabase (writes SQLite-first, then mirror). */
export function useSupabaseHolds(): boolean {
  return flag("SUPABASE_HOLDS") && isSupabaseAdminConfigured()
}

/** When true, billing handoffs + export batches read Supabase (writes SQLite-first). */
export function useSupabaseBilling(): boolean {
  return flag("SUPABASE_BILLING") && isSupabaseAdminConfigured()
}

/** When true, calendar events read Supabase (writes SQLite-first, then mirror). */
export function useSupabaseCalendar(): boolean {
  return flag("SUPABASE_CALENDAR") && isSupabaseAdminConfigured()
}

/** When true, user directory reads Supabase (writes SQLite-first; bcrypt login unchanged). */
export function useSupabaseUsers(): boolean {
  return flag("SUPABASE_USERS") && isSupabaseAdminConfigured()
}

/** When true, identity switch audit log reads Supabase (writes SQLite-first). */
export function useSupabaseIdentityLog(): boolean {
  return flag("SUPABASE_IDENTITY_LOG") && isSupabaseAdminConfigured()
}

/** When true, backup job metadata reads Supabase (writes SQLite-first). */
export function useSupabaseBackups(): boolean {
  return flag("SUPABASE_BACKUPS") && isSupabaseAdminConfigured()
}
