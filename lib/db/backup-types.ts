/** Backup metadata types shared across SQLite and Supabase. */

export type BackupStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED"
export type BackupTrigger = "MANUAL" | "SCHEDULED" | "PRE_RESTORE_SAFETY" | "RETRY"

export interface BackupJobRow {
  id: string
  status: BackupStatus
  trigger: BackupTrigger
  triggeredBy: string
  triggeredByName: string
  folderName: string
  startedAt: string
  completedAt: string | null
  durationMs: number | null
  sizeBytes: number | null
  checksum: string | null
  rowCountsJson: string | null
  errorMessage: string | null
  retryOfId: string | null
  fileDeletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateBackupJobData {
  id: string
  folderName: string
  trigger: BackupTrigger
  triggeredBy: string
  triggeredByName: string
  retryOfId?: string | null
}

export interface BackupAuditLogRow {
  id: string
  action: string
  backupId: string | null
  userId: string
  userName: string
  detail: string | null
  createdAt: string
}

export interface CreateBackupAuditLogData {
  action: string
  backupId?: string | null
  userId: string
  userName: string
  detail?: string | null
}
