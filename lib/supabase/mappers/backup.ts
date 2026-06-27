import type { BackupAuditLogRow, BackupJobRow } from "@/lib/db/backup-types"

export interface SupabaseBackupJobRow {
  id: string
  status: string
  trigger: string
  triggered_by: string
  triggered_by_name: string
  folder_name: string
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  size_bytes: number | null
  checksum: string | null
  row_counts_json: string | null
  error_message: string | null
  retry_of_id: string | null
  file_deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface SupabaseBackupAuditLogRow {
  id: string
  action: string
  backup_id: string | null
  user_id: string
  user_name: string
  detail: string | null
  created_at: string
}

export function toBackupJobRow(row: SupabaseBackupJobRow): BackupJobRow {
  return {
    id: row.id,
    status: row.status as BackupJobRow["status"],
    trigger: row.trigger as BackupJobRow["trigger"],
    triggeredBy: row.triggered_by,
    triggeredByName: row.triggered_by_name,
    folderName: row.folder_name,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    sizeBytes: row.size_bytes != null ? Number(row.size_bytes) : null,
    checksum: row.checksum,
    rowCountsJson: row.row_counts_json,
    errorMessage: row.error_message,
    retryOfId: row.retry_of_id,
    fileDeletedAt: row.file_deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toSupabaseBackupJobRow(row: BackupJobRow): SupabaseBackupJobRow {
  return {
    id: row.id,
    status: row.status,
    trigger: row.trigger,
    triggered_by: row.triggeredBy,
    triggered_by_name: row.triggeredByName,
    folder_name: row.folderName,
    started_at: row.startedAt,
    completed_at: row.completedAt,
    duration_ms: row.durationMs,
    size_bytes: row.sizeBytes,
    checksum: row.checksum,
    row_counts_json: row.rowCountsJson,
    error_message: row.errorMessage,
    retry_of_id: row.retryOfId,
    file_deleted_at: row.fileDeletedAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}

export function toBackupAuditLogRow(row: SupabaseBackupAuditLogRow): BackupAuditLogRow {
  return {
    id: row.id,
    action: row.action,
    backupId: row.backup_id,
    userId: row.user_id,
    userName: row.user_name,
    detail: row.detail,
    createdAt: row.created_at,
  }
}

export function toSupabaseBackupAuditLogRow(row: BackupAuditLogRow): SupabaseBackupAuditLogRow {
  return {
    id: row.id,
    action: row.action,
    backup_id: row.backupId,
    user_id: row.userId,
    user_name: row.userName,
    detail: row.detail,
    created_at: row.createdAt,
  }
}
