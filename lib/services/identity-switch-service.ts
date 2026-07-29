/**
 * Identity switch audit log — routes to Supabase-only or SQLite (local/CI).
 * Dual-path hybrid was removed; see docs/sqlite-sunset.md.
 */
import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

const require = createRequire(import.meta.url)

export const identitySwitchLogService = isSupabaseOnly()
  ? (require("./identity-switch-service-supabase") as typeof import("./identity-switch-service-supabase")).identitySwitchLogService
  : (require("./identity-switch-service-sqlite") as typeof import("./identity-switch-service-sqlite")).identitySwitchLogService
