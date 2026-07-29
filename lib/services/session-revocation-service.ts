/**
 * Session revocation — routes to Supabase-only or SQLite (local/CI).
 * Dual-path hybrid was removed; see docs/sqlite-sunset.md.
 */
import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

const require = createRequire(import.meta.url)

export const sessionRevocationService = isSupabaseOnly()
  ? (require("./session-revocation-service-supabase") as typeof import("./session-revocation-service-supabase")).sessionRevocationService
  : (require("./session-revocation-service-sqlite") as typeof import("./session-revocation-service-sqlite")).sessionRevocationService
