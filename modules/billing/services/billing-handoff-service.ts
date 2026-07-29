/**
 * Billing handoff service entry — routes to Supabase-only or SQLite (local/CI).
 * Uses createRequire so the SQLite module is never evaluated when isSupabaseOnly().
 * Dual-write hybrid was removed; see docs/sqlite-sunset.md.
 */
import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

const require = createRequire(import.meta.url)

export const billingHandoffService = isSupabaseOnly()
  ? (require("./billing-handoff-service-supabase") as typeof import("./billing-handoff-service-supabase")).billingHandoffService
  : (require("./billing-handoff-service-sqlite") as typeof import("./billing-handoff-service-sqlite")).billingHandoffService
