/**
 * Append-only audit log for archive and restore actions across all entities.
 * Mirrors to Supabase when admin credentials are configured (required on Vercel).
 */
import { createId as nanoid } from "@paralleldrive/cuid2"
import type { ArchiveLogRow } from "../types/archive-types"
import { archiveLogDb } from "@/lib/db/stores"
import { nowIso } from "@/lib/db/helpers"
import { isSupabaseAdminConfigured } from "@/shared/supabase/config"
import { supabaseArchiveLogRepo } from "../supabase/repository"

export interface LogArchiveOpts {
  entityType:      "job" | "quote" | "client"
  entityId:        string
  entityLabel:     string
  action:          "archive" | "restore"
  performedBy:     string
  performedByName: string
  reason?:         string
}

function mirrorToSupabase(row: ArchiveLogRow): void {
  if (!isSupabaseAdminConfigured()) return
  void supabaseArchiveLogRepo.insert(row).catch(err => {
    console.error("[archiveLogService] Supabase mirror failed:", err)
  })
}

export const archiveLogService = {
  log(opts: LogArchiveOpts): void {
    const row: ArchiveLogRow = {
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
    archiveLogDb.insert(row)
    mirrorToSupabase(row)
  },

  async findMany(limit = 200): Promise<ArchiveLogRow[]> {
    if (isSupabaseAdminConfigured()) {
      try {
        return await supabaseArchiveLogRepo.findMany(limit)
      } catch (err) {
        console.error("[archiveLogService] Supabase findMany failed:", err)
      }
    }
    return archiveLogDb.findMany(limit)
  },

  async findForEntity(entityType: string, entityId: string): Promise<ArchiveLogRow[]> {
    if (isSupabaseAdminConfigured()) {
      try {
        return await supabaseArchiveLogRepo.findForEntity(entityType, entityId)
      } catch (err) {
        console.error("[archiveLogService] Supabase findForEntity failed:", err)
      }
    }
    return archiveLogDb.findForEntity(entityType, entityId)
  },

  async findLatestArchiveForJobs(jobIds: string[]): Promise<Map<string, ArchiveLogRow>> {
    if (isSupabaseAdminConfigured()) {
      try {
        return await supabaseArchiveLogRepo.findLatestArchiveForEntities("job", jobIds)
      } catch (err) {
        console.error("[archiveLogService] Supabase findLatestArchiveForJobs failed:", err)
      }
    }
    return archiveLogDb.findLatestArchiveForEntities("job", jobIds)
  },
}
