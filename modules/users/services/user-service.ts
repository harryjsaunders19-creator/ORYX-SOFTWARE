/**
 * User service entry — routes to Supabase-only or hybrid (SQLite dual-write).
 * Uses createRequire so the hybrid module is never evaluated when isSupabaseOnly().
 */
import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/lib/supabase/feature-flags"

const require = createRequire(import.meta.url)

export const userService = isSupabaseOnly()
  ? (require("./user-service-supabase") as typeof import("./user-service-supabase")).userService
  : (require("./user-service-hybrid") as typeof import("./user-service-hybrid")).userService

export const ensureUsersInSqlite = isSupabaseOnly()
  ? (require("./user-service-supabase") as typeof import("./user-service-supabase")).ensureUsersInSqlite
  : (require("./user-service-hybrid") as typeof import("./user-service-hybrid")).ensureUsersInSqlite
