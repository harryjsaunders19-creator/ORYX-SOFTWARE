/**
 * lib/supabase/feature-flags.ts
 *
 * When Supabase admin credentials are set (URL + anon + service-role keys),
 * modules read from Supabase by default. Disable a module with
 * SUPABASE_<MODULE>=false. Force SQLite-only by omitting SUPABASE_SERVICE_ROLE_KEY.
 *
 * On Vercel, SQLite is ephemeral (/tmp) — Supabase must be the data store.
 * When process.env.VERCEL === "1" or FORCE_SUPABASE_ONLY=true, flag() always
 * returns true if admin is configured (ignores SUPABASE_*=false overrides).
 */
import { isSupabaseAdminConfigured } from "./config"

function flag(name: string): boolean {
  if (!isSupabaseAdminConfigured()) return false

  // Vercel / forced Supabase-only: never allow per-module SQLite fallback.
  if (process.env.VERCEL === "1" || process.env.FORCE_SUPABASE_ONLY === "true") {
    return true
  }

  const explicit = process.env[name]?.trim().toLowerCase()
  if (explicit === "false") return false
  if (explicit === "true") return true

  // Linked Supabase project — use it unless a module is explicitly disabled.
  return true
}

/** Snapshot of runtime module routing (for /api/supabase/status diagnostics). */
export function supabaseModuleFlags() {
  return {
    clients:        useSupabaseClients(),
    jobs:           useSupabaseJobs(),
    quotes:         useSupabaseQuotes(),
    statusHistory:  useSupabaseStatusHistory(),
    holds:          useSupabaseHolds(),
    billing:        useSupabaseBilling(),
    calendar:       useSupabaseCalendar(),
    users:          useSupabaseUsers(),
    identityLog:    useSupabaseIdentityLog(),
    backups:        useSupabaseBackups(),
    employees:      useSupabaseEmployees(),
    leave:          useSupabaseLeave(),
    passwordVault:  useSupabasePasswordVault(),
    siteVisitCalculations: useSupabaseSiteVisitCalculations(),
    workItems:          isWorkItemsModelEnabled(),
  }
}

export function useSupabaseClients(): boolean {
  return flag("SUPABASE_CLIENTS")
}

export function useSupabaseJobs(): boolean {
  return flag("SUPABASE_JOBS")
}

export function useSupabaseQuotes(): boolean {
  return flag("SUPABASE_QUOTES")
}

export function useSupabaseStatusHistory(): boolean {
  return flag("SUPABASE_STATUS_HISTORY")
}

export function useSupabaseHolds(): boolean {
  return flag("SUPABASE_HOLDS")
}

export function useSupabaseBilling(): boolean {
  return flag("SUPABASE_BILLING")
}

export function useSupabaseCalendar(): boolean {
  return flag("SUPABASE_CALENDAR")
}

export function useSupabaseUsers(): boolean {
  return flag("SUPABASE_USERS")
}

export function useSupabaseIdentityLog(): boolean {
  return flag("SUPABASE_IDENTITY_LOG")
}

export function useSupabaseBackups(): boolean {
  return flag("SUPABASE_BACKUPS")
}

export function useSupabaseEmployees(): boolean {
  return flag("SUPABASE_EMPLOYEES")
}

export function useSupabaseLeave(): boolean {
  return flag("SUPABASE_LEAVE")
}

export function useSupabasePasswordVault(): boolean {
  return flag("SUPABASE_PASSWORD_VAULT")
}

export function useSupabaseSiteVisitCalculations(): boolean {
  return flag("SUPABASE_SITE_VISIT_CALCULATIONS")
}

/**
 * Production / Vercel mode: Supabase is the sole data store.
 * SQLite is only used when the service-role key is absent (local dev).
 */
export function isSupabaseOnly(): boolean {
  return isSupabaseAdminConfigured()
}

/**
 * Phase 2+ — read/write design projects via parent_jobs + work_items.
 * Phase 1 only creates schema and backfills; app keeps using jobs table until enabled.
 *
 * Prefer this over `useWorkItemsModel` in server/route code — the `use*` name
 * triggers react-hooks/rules-of-hooks when called from async handlers.
 */
export function isWorkItemsModelEnabled(): boolean {
  return process.env.WORK_ITEMS_MODEL?.trim().toLowerCase() === "true"
}

/** @deprecated Use `isWorkItemsModelEnabled` — kept for client call sites only. */
export function useWorkItemsModel(): boolean {
  return isWorkItemsModelEnabled()
}
