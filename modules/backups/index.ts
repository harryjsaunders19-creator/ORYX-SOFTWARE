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
  LOCAL_BACKUPS_EPHEMERAL_ON_VERCEL,
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

export {
  buildLogicalBackupPack,
  logicalBackupFilename,
  LOGICAL_BACKUP_VERSION,
  type LogicalBackupPack,
} from "./services/logical-export"

export {
  importLogicalBackupPack,
  type LogicalImportResult,
  type LogicalSheetResult,
} from "./services/logical-import"

export { default as BackupsPage } from "./components/backups-page"
