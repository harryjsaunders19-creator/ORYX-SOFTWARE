/**
 * Backup job + audit metadata during Supabase migration.
 *
 * When SUPABASE_BACKUPS=true:
 *   - Reads come from Supabase
 *   - Writes SQLite first, then mirror (backup files stay on disk)
 */
import type {
  BackupAuditLogRow,
  BackupJobRow,
  CreateBackupAuditLogData,
  CreateBackupJobData,
} from "@/lib/db/backup-types"
import { backupAuditDb, backupJobDb } from "@/lib/db/stores"
import { useSupabaseBackups } from "@/lib/supabase/feature-flags"
import { supabaseBackupRepo } from "@/lib/supabase/repositories/backup"

async function mirrorJob(id: string): Promise<void> {
  if (!useSupabaseBackups()) return
  const row = backupJobDb.findUnique(id)
  if (row) await supabaseBackupRepo.upsertJob(row)
}

export const backupRecordService = {
  async findUnique(id: string): Promise<BackupJobRow | null> {
    if (!useSupabaseBackups()) return backupJobDb.findUnique(id)
    return supabaseBackupRepo.findJobUnique(id)
  },

  async findMany(opts: { take?: number } = {}): Promise<BackupJobRow[]> {
    if (!useSupabaseBackups()) return backupJobDb.findMany(opts)
    return supabaseBackupRepo.findJobs(opts)
  },

  async findLatestCompleted(): Promise<BackupJobRow | null> {
    if (!useSupabaseBackups()) return backupJobDb.findLatestCompleted()
    return supabaseBackupRepo.findLatestCompleted()
  },

  async findBeyondRetention(keepCount: number): Promise<BackupJobRow[]> {
    if (!useSupabaseBackups()) return backupJobDb.findBeyondRetention(keepCount)
    return supabaseBackupRepo.findBeyondRetention(keepCount)
  },

  async create(data: CreateBackupJobData): Promise<BackupJobRow> {
    const job = backupJobDb.create(data)
    await mirrorJob(job.id)
    return job
  },

  async markRunning(id: string): Promise<void> {
    backupJobDb.markRunning(id)
    await mirrorJob(id)
  },

  async markCompleted(
    id: string,
    data: { durationMs: number; sizeBytes: number; checksum: string; rowCounts: Record<string, number> },
  ): Promise<void> {
    backupJobDb.markCompleted(id, data)
    await mirrorJob(id)
  },

  async markFailed(id: string, errorMessage: string): Promise<void> {
    backupJobDb.markFailed(id, errorMessage)
    await mirrorJob(id)
  },

  async markFileDeleted(id: string): Promise<void> {
    backupJobDb.markFileDeleted(id)
    await mirrorJob(id)
  },

  async logAudit(data: CreateBackupAuditLogData): Promise<BackupAuditLogRow> {
    const row = backupAuditDb.log(data)
    if (useSupabaseBackups()) await supabaseBackupRepo.upsertAudit(row)
    return row
  },

  async findAuditMany(opts: { take?: number } = {}): Promise<BackupAuditLogRow[]> {
    if (!useSupabaseBackups()) return backupAuditDb.findMany(opts)
    return supabaseBackupRepo.findAuditMany(opts)
  },

  async findAuditForBackup(backupId: string): Promise<BackupAuditLogRow[]> {
    if (!useSupabaseBackups()) return backupAuditDb.findForBackup(backupId)
    return supabaseBackupRepo.findAuditForBackup(backupId)
  },
}
