/**
 * Leave service entry — routes to Supabase-only or SQLite (local/CI).
 * Uses createRequire so the SQLite module is never evaluated when isSupabaseOnly().
 * Dual-write hybrid was removed; see docs/sqlite-sunset.md.
 */
import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

const require = createRequire(import.meta.url)

export const leaveService = isSupabaseOnly()
  ? (require("./leave-service-supabase") as typeof import("./leave-service-supabase")).leaveService
  : (require("./leave-service-sqlite") as typeof import("./leave-service-sqlite")).leaveService
