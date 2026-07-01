/**
 * Backups module — public API.
 */
export { backupRecordService } from "./services/backup-record-service"

export type {
  BackupJobRow,
  BackupAuditLogRow,
  CreateBackupJobData,
  CreateBackupAuditLogData,
  BackupStatus,
  BackupTrigger,
} from "./types"

export { supabaseBackupRepo } from "./supabase/repository"

export {
  BACKUPS_DIR,
  SCHEMA_VERSION,
  DEFAULT_RETENTION_COUNT,
  runBackup,
  startBackup,
  backupFolderPath,
  backupDataFilePath,
  runRetentionCleanup,
} from "./backup-service"

export {
  RestoreError,
  restoreFromBackup,
  type RestoreResult,
} from "./backup-restore-service"

export { startBackupScheduler } from "./backup-scheduler"

export {
  generateDownloadToken,
  verifyDownloadToken,
  type DownloadToken,
} from "./backup-token"

export { default as BackupsPage } from "./components/backups-page"
