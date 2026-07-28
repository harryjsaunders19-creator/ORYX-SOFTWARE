/**
 * Calendar service entry — routes to Supabase-only or hybrid (SQLite dual-write).
 * Uses createRequire so the hybrid module is never evaluated when isSupabaseOnly().
 */
import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

const require = createRequire(import.meta.url)

export const calendarService = isSupabaseOnly()
  ? (require("./calendar-service-supabase") as typeof import("./calendar-service-supabase")).calendarService
  : (require("./calendar-service-hybrid") as typeof import("./calendar-service-hybrid")).calendarService
