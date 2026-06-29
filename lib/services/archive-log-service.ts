/**
 * lib/services/archive-log-service.ts
 *
 * Append-only audit log for archive and restore actions across all entities.
 */
import type { ArchiveLogRow } from "@/lib/db/archive-types"
import { archiveLogDb } from "@/lib/db/stores"
import { nowIso } from "@/lib/db/helpers"

export interface LogArchiveOpts {
  entityType:      "job" | "quote" | "client"
  entityId:        string
  entityLabel:     string
  action:          "archive" | "restore"
  performedBy:     string
  performedByName: string
  reason?:         string
}

export const archiveLogService = {
  log(opts: LogArchiveOpts): void {
    archiveLogDb.log({
      ...opts,
      performedAt: nowIso(),
      reason: opts.reason ?? null,
    })
  },

  findMany(limit = 200): ArchiveLogRow[] {
    return archiveLogDb.findMany(limit)
  },

  findForEntity(entityType: string, entityId: string): ArchiveLogRow[] {
    return archiveLogDb.findForEntity(entityType, entityId)
  },

  findLatestArchiveForJobs(jobIds: string[]): Map<string, ArchiveLogRow> {
    return archiveLogDb.findLatestArchiveForEntities("job", jobIds)
  },
}
