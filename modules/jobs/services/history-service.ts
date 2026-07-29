/**
 * Status history entry — routes to Supabase-only or SQLite (local/CI).
 * Dual-write hybrid was removed; see docs/sqlite-sunset.md.
 */
import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

const require = createRequire(import.meta.url)

export const historyService = isSupabaseOnly()
  ? (require("./history-service-supabase") as typeof import("./history-service-supabase")).historyService
  : (require("./history-service-sqlite") as typeof import("./history-service-sqlite")).historyService
