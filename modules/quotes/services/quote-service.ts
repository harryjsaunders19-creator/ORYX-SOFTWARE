/**
 * Quote service entry — routes to Supabase-only or hybrid (SQLite dual-write).
 * Uses createRequire so the hybrid module is never evaluated when isSupabaseOnly().
 */
import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/lib/supabase/feature-flags"

const require = createRequire(import.meta.url)

export const quoteService = isSupabaseOnly()
  ? (require("./quote-service-supabase") as typeof import("./quote-service-supabase")).quoteService
  : (require("./quote-service-hybrid") as typeof import("./quote-service-hybrid")).quoteService
