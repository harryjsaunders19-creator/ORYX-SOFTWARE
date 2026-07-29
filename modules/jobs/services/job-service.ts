/**
 * Job service entry — routes to Supabase-only or SQLite (local/CI).
 * Uses createRequire so the SQLite module is never evaluated when isSupabaseOnly().
 * Dual-write hybrid was removed; see docs/sqlite-sunset.md.
 */
import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

const require = createRequire(import.meta.url)

export const jobService = isSupabaseOnly()
  ? (require("./job-service-supabase") as typeof import("./job-service-supabase")).jobService
  : (require("./job-service-sqlite") as typeof import("./job-service-sqlite")).jobService

export const ensureJobInSqliteForBilling = isSupabaseOnly()
  ? (require("./job-service-supabase") as typeof import("./job-service-supabase")).ensureJobInSqliteForBilling
  : (require("./job-service-sqlite") as typeof import("./job-service-sqlite")).ensureJobInSqliteForBilling
