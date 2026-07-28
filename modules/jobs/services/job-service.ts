/**
 * Job service entry — routes to Supabase-only or hybrid (SQLite dual-write).
 * Uses createRequire so the hybrid module is never evaluated when isSupabaseOnly().
 */
import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

const require = createRequire(import.meta.url)

export const jobService = isSupabaseOnly()
  ? (require("./job-service-supabase") as typeof import("./job-service-supabase")).jobService
  : (require("./job-service-hybrid") as typeof import("./job-service-hybrid")).jobService

export const ensureJobInSqliteForBilling = isSupabaseOnly()
  ? (require("./job-service-supabase") as typeof import("./job-service-supabase")).ensureJobInSqliteForBilling
  : (require("./job-service-hybrid") as typeof import("./job-service-hybrid")).ensureJobInSqliteForBilling
