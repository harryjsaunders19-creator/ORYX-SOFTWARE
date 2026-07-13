/**
 * Billing handoff service entry — routes to Supabase-only or hybrid (SQLite dual-write).
 * Uses createRequire so the hybrid module is never evaluated when isSupabaseOnly().
 */
import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/lib/supabase/feature-flags"

const require = createRequire(import.meta.url)

export const billingHandoffService = isSupabaseOnly()
  ? (require("./billing-handoff-service-supabase") as typeof import("./billing-handoff-service-supabase")).billingHandoffService
  : (require("./billing-handoff-service-hybrid") as typeof import("./billing-handoff-service-hybrid")).billingHandoffService
