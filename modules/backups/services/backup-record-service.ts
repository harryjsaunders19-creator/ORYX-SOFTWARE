/**
 * Backup job + audit metadata — routes to Supabase-only or SQLite (local/CI).
 * Dual-write hybrid was removed; see docs/sqlite-sunset.md.
 */
import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

const require = createRequire(import.meta.url)

export const backupRecordService = isSupabaseOnly()
  ? (require("./backup-record-service-supabase") as typeof import("./backup-record-service-supabase")).backupRecordService
  : (require("./backup-record-service-sqlite") as typeof import("./backup-record-service-sqlite")).backupRecordService
