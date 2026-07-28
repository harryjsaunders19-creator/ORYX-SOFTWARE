/**
 * Client service entry — routes to Supabase-only or hybrid (SQLite dual-write).
 * Uses createRequire so the hybrid module is never evaluated when isSupabaseOnly().
 */
import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

const require = createRequire(import.meta.url)

export const clientService = isSupabaseOnly()
  ? (require("./client-service-supabase") as typeof import("./client-service-supabase")).clientService
  : (require("./client-service-hybrid") as typeof import("./client-service-hybrid")).clientService

export const ensureClientInSqlite = isSupabaseOnly()
  ? (require("./client-service-supabase") as typeof import("./client-service-supabase")).ensureClientInSqlite
  : (require("./client-service-hybrid") as typeof import("./client-service-hybrid")).ensureClientInSqlite
