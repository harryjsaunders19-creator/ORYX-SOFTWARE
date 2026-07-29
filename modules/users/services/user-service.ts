/**
 * User service entry — routes to Supabase-only or SQLite (local/CI).
 * Uses createRequire so the SQLite module is never evaluated when isSupabaseOnly().
 * Dual-write hybrid was removed; see docs/sqlite-sunset.md.
 */
import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

const require = createRequire(import.meta.url)

export const userService = isSupabaseOnly()
  ? (require("./user-service-supabase") as typeof import("./user-service-supabase")).userService
  : (require("./user-service-sqlite") as typeof import("./user-service-sqlite")).userService

export const ensureUsersInSqlite = isSupabaseOnly()
  ? (require("./user-service-supabase") as typeof import("./user-service-supabase")).ensureUsersInSqlite
  : (require("./user-service-sqlite") as typeof import("./user-service-sqlite")).ensureUsersInSqlite
