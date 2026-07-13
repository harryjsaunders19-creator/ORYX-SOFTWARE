/**
 * Password vault service entry — routes to Supabase-only or hybrid (SQLite dual-write).
 * Uses createRequire so the hybrid module is never evaluated when isSupabaseOnly().
 */
import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/lib/supabase/feature-flags"

const require = createRequire(import.meta.url)

export const passwordVaultService = isSupabaseOnly()
  ? (require("./vault-service-supabase") as typeof import("./vault-service-supabase")).passwordVaultService
  : (require("./vault-service-hybrid") as typeof import("./vault-service-hybrid")).passwordVaultService
