/**
 * Backup job + audit metadata — SQLite path for local/CI.
 * Dual-write was removed; see docs/sqlite-sunset.md.
 */
import type {
  BackupAuditLogRow,
  BackupJobRow,
  CreateBackupAuditLogData,
  CreateBackupJobData,
} from "../types/backup-types"
import { backupAuditDb, backupJobDb } from "@/lib/db/stores"

export const backupRecordService = {
  async findUnique(id: string): Promise<BackupJobRow | null> {
    return backupJobDb.findUnique(id)
  },

  async findMany(opts: { take?: number } = {}): Promise<BackupJobRow[]> {
    return backupJobDb.findMany(opts)
  },

  async findLatestCompleted(): Promise<BackupJobRow | null> {
    return backupJobDb.findLatestCompleted()
  },

  async findBeyondRetention(keepCount: number): Promise<BackupJobRow[]> {
    return backupJobDb.findBeyondRetention(keepCount)
  },

  async create(data: CreateBackupJobData): Promise<BackupJobRow> {
    return backupJobDb.create(data)
  },

  async markRunning(id: string): Promise<void> {
    backupJobDb.markRunning(id)
  },

  async markCompleted(
    id: string,
    data: { durationMs: number; sizeBytes: number; checksum: string; rowCounts: Record<string, number> },
  ): Promise<void> {
    backupJobDb.markCompleted(id, data)
  },

  async markFailed(id: string, errorMessage: string): Promise<void> {
    backupJobDb.markFailed(id, errorMessage)
  },

  async markFileDeleted(id: string): Promise<void> {
    backupJobDb.markFileDeleted(id)
  },

  async logAudit(data: CreateBackupAuditLogData): Promise<BackupAuditLogRow> {
    return backupAuditDb.log(data)
  },

  async findAuditMany(opts: { take?: number } = {}): Promise<BackupAuditLogRow[]> {
    return backupAuditDb.findMany(opts)
  },

  async findAuditForBackup(backupId: string): Promise<BackupAuditLogRow[]> {
    return backupAuditDb.findForBackup(backupId)
  },
}
