/**
 * Saved site-visit calculations entry — Supabase-only or SQLite (local/CI).
 * Dual-write was removed; see docs/sqlite-sunset.md.
 */
import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

const require = createRequire(import.meta.url)

export const savedCalculationService = isSupabaseOnly()
  ? (require("./saved-service-supabase") as typeof import("./saved-service-supabase")).savedCalculationService
  : (require("./saved-service-sqlite") as typeof import("./saved-service-sqlite")).savedCalculationService
