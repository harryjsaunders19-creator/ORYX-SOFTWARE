/**
 * Site service entry — routes to Supabase-only or SQLite (local/CI).
 */
import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

const require = createRequire(import.meta.url)

export const siteService = isSupabaseOnly()
  ? (require("./site-service-supabase") as typeof import("./site-service-supabase")).siteService
  : (require("./site-service-sqlite") as typeof import("./site-service-sqlite")).siteService
