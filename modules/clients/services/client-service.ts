/**
 * Client service entry — routes to Supabase-only or SQLite (local/CI).
 * Uses createRequire so the SQLite module is never evaluated when isSupabaseOnly().
 * Dual-write hybrid was removed; see docs/sqlite-sunset.md.
 */
import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

const require = createRequire(import.meta.url)

export const clientService = isSupabaseOnly()
  ? (require("./client-service-supabase") as typeof import("./client-service-supabase")).clientService
  : (require("./client-service-sqlite") as typeof import("./client-service-sqlite")).clientService

export const ensureClientInSqlite = isSupabaseOnly()
  ? (require("./client-service-supabase") as typeof import("./client-service-supabase")).ensureClientInSqlite
  : (require("./client-service-sqlite") as typeof import("./client-service-sqlite")).ensureClientInSqlite
