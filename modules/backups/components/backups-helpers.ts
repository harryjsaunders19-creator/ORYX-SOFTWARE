export interface BackupJob {
  id: string; status: string; trigger: string
  triggeredByName: string; folderName: string
  startedAt: string; completedAt: string | null
  durationMs: number | null; sizeBytes: number | null
  checksum: string | null; rowCountsJson: string | null
  errorMessage: string | null; fileDeletedAt: string | null
}

export interface AuditEntry {
  id: string; action: string; backupId: string | null
  userName: string; detail: string | null; createdAt: string
}

export interface SheetResult { created: number; updated: number; skipped: number; errors: string[] }
export interface ImportResult {
  clients: SheetResult
  jobs: SheetResult
  quotes: SheetResult
  users?: SheetResult
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return "—"
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function statusLabel(s: string): string {
  switch (s) {
    case "COMPLETED": return "Completed"
    case "FAILED":    return "Failed"
    case "RUNNING":   return "Running"
    case "PENDING":   return "Pending"
    default:          return s
  }
}

export function triggerLabel(t: string): string {
  switch (t) {
    case "MANUAL":    return "Manual"
    case "SCHEDULED": return "Scheduled"
    case "PRE_RESTORE_SAFETY": return "Pre-restore"
    case "RETRY":     return "Retry"
    default:          return t
  }
}

export function sheetTotal(r: SheetResult): number {
  return r.created + r.updated
}
