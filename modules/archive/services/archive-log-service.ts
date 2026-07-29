/**
 * Append-only audit log for archive and restore actions.
 * Supabase-only when admin is configured; SQLite otherwise (lazy import).
 */
import { createRequire } from "node:module"
import { createId as nanoid } from "@paralleldrive/cuid2"
import type { ArchiveLogRow } from "../types/archive-types"
import { nowIso } from "@/lib/db/helpers"
import { isSupabaseAdminConfigured } from "@/shared/supabase/config"
import { supabaseArchiveLogRepo } from "../supabase/repository"

const require = createRequire(import.meta.url)

export interface LogArchiveOpts {
  entityType:      "job" | "quote" | "client"
  entityId:        string
  entityLabel:     string
  action:          "archive" | "restore"
  performedBy:     string
  performedByName: string
  reason?:         string
}

function buildRow(opts: LogArchiveOpts): ArchiveLogRow {
  return {
    id: nanoid(),
    entityType: opts.entityType,
    entityId: opts.entityId,
    entityLabel: opts.entityLabel,
    action: opts.action,
    performedBy: opts.performedBy,
    performedByName: opts.performedByName,
    performedAt: nowIso(),
    reason: opts.reason ?? null,
  }
}

function sqliteArchiveLogDb() {
  return (require("@/lib/db/stores") as typeof import("@/lib/db/stores")).archiveLogDb
}

export const archiveLogService = {
  log(opts: LogArchiveOpts): void {
    const row = buildRow(opts)
    if (isSupabaseAdminConfigured()) {
      void supabaseArchiveLogRepo.insert(row).catch(err => {
        console.error("[archiveLogService] Supabase insert failed:", err)
      })
      return
    }
    sqliteArchiveLogDb().insert(row)
  },

  async findMany(limit = 200): Promise<ArchiveLogRow[]> {
    if (isSupabaseAdminConfigured()) {
      return supabaseArchiveLogRepo.findMany(limit)
    }
    return sqliteArchiveLogDb().findMany(limit)
  },

  async findForEntity(entityType: string, entityId: string): Promise<ArchiveLogRow[]> {
    if (isSupabaseAdminConfigured()) {
      return supabaseArchiveLogRepo.findForEntity(entityType, entityId)
    }
    return sqliteArchiveLogDb().findForEntity(entityType, entityId)
  },

  async findLatestArchiveForJobs(jobIds: string[]): Promise<Map<string, ArchiveLogRow>> {
    if (isSupabaseAdminConfigured()) {
      return supabaseArchiveLogRepo.findLatestArchiveForEntities("job", jobIds)
    }
    return sqliteArchiveLogDb().findLatestArchiveForEntities("job", jobIds)
  },
}
