/**
 * Job documents entry — routes to Supabase-only or SQLite (local/CI).
 * Dual-path hybrid was removed; see docs/sqlite-sunset.md.
 */
import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

const require = createRequire(import.meta.url)

export const jobDocumentService = isSupabaseOnly()
  ? (require("./document-service-supabase") as typeof import("./document-service-supabase")).jobDocumentService
  : (require("./document-service-sqlite") as typeof import("./document-service-sqlite")).jobDocumentService
