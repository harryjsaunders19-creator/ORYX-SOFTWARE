/**
 * Client holds entry — routes to Supabase-only or SQLite (local/CI).
 * Dual-write hybrid was removed; see docs/sqlite-sunset.md.
 */
import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

const require = createRequire(import.meta.url)

export const holdService = isSupabaseOnly()
  ? (require("./hold-service-supabase") as typeof import("./hold-service-supabase")).holdService
  : (require("./hold-service-sqlite") as typeof import("./hold-service-sqlite")).holdService
