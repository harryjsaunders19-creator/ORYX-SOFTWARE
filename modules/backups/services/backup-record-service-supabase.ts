/**
 * Backup job + audit metadata — Supabase-only path (Vercel / isSupabaseOnly).
 * Backup file bytes stay on disk; this service only tracks metadata.
 */
import { createId as nanoid } from "@paralleldrive/cuid2"
import { nowIso } from "@/lib/db/helpers"
import type {
  BackupAuditLogRow,
  BackupJobRow,
  CreateBackupAuditLogData,
  CreateBackupJobData,
} from "../types/backup-types"
import { supabaseBackupRepo } from "../supabase/repository"

async function patchJob(id: string, patch: Partial<BackupJobRow>): Promise<void> {
  const existing = await supabaseBackupRepo.findJobUnique(id)
  if (!existing) return
  await supabaseBackupRepo.upsertJob({ ...existing, ...patch, updatedAt: nowIso() })
}

export const backupRecordService = {
  async findUnique(id: string): Promise<BackupJobRow | null> {
    return supabaseBackupRepo.findJobUnique(id)
  },

  async findMany(opts: { take?: number } = {}): Promise<BackupJobRow[]> {
    return supabaseBackupRepo.findJobs(opts)
  },

  async findLatestCompleted(): Promise<BackupJobRow | null> {
    return supabaseBackupRepo.findLatestCompleted()
  },

  async findBeyondRetention(keepCount: number): Promise<BackupJobRow[]> {
    return supabaseBackupRepo.findBeyondRetention(keepCount)
  },

  async create(data: CreateBackupJobData): Promise<BackupJobRow> {
    const now = nowIso()
    const job: BackupJobRow = {
      id: data.id,
      status: "PENDING",
      trigger: data.trigger,
      triggeredBy: data.triggeredBy,
      triggeredByName: data.triggeredByName,
      folderName: data.folderName,
      startedAt: now,
      completedAt: null,
      durationMs: null,
      sizeBytes: null,
      checksum: null,
      rowCountsJson: null,
      errorMessage: null,
      fileDeletedAt: null,
      retryOfId: data.retryOfId ?? null,
      createdAt: now,
      updatedAt: now,
    }
    await supabaseBackupRepo.upsertJob(job)
    return job
  },

  async markRunning(id: string): Promise<void> {
    await patchJob(id, { status: "RUNNING" })
  },

  async markCompleted(
    id: string,
    data: { durationMs: number; sizeBytes: number; checksum: string; rowCounts: Record<string, number> },
  ): Promise<void> {
    const now = nowIso()
    await patchJob(id, {
      status: "COMPLETED",
      completedAt: now,
      durationMs: data.durationMs,
      sizeBytes: data.sizeBytes,
      checksum: data.checksum,
      rowCountsJson: JSON.stringify(data.rowCounts),
    })
  },

  async markFailed(id: string, errorMessage: string): Promise<void> {
    const now = nowIso()
    await patchJob(id, {
      status: "FAILED",
      errorMessage,
      completedAt: now,
    })
  },

  async markFileDeleted(id: string): Promise<void> {
    await patchJob(id, { fileDeletedAt: nowIso() })
  },

  async logAudit(data: CreateBackupAuditLogData): Promise<BackupAuditLogRow> {
    const row: BackupAuditLogRow = {
      id: nanoid(),
      action: data.action,
      backupId: data.backupId ?? null,
      userId: data.userId,
      userName: data.userName,
      detail: data.detail ?? null,
      createdAt: nowIso(),
    }
    await supabaseBackupRepo.upsertAudit(row)
    return row
  },

  async findAuditMany(opts: { take?: number } = {}): Promise<BackupAuditLogRow[]> {
    return supabaseBackupRepo.findAuditMany(opts)
  },

  async findAuditForBackup(backupId: string): Promise<BackupAuditLogRow[]> {
    return supabaseBackupRepo.findAuditForBackup(backupId)
  },
}
