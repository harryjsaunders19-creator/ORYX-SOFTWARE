/**
 * Password vault service entry — routes to Supabase-only or SQLite (local/CI).
 * Uses createRequire so the SQLite module is never evaluated when isSupabaseOnly().
 * Dual-write hybrid was removed; see docs/sqlite-sunset.md.
 */
import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

const require = createRequire(import.meta.url)

export const passwordVaultService = isSupabaseOnly()
  ? (require("./vault-service-supabase") as typeof import("./vault-service-supabase")).passwordVaultService
  : (require("./vault-service-sqlite") as typeof import("./vault-service-sqlite")).passwordVaultService
