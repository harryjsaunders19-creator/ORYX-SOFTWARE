/** Shared archive-log types — used by SQLite store and API layer. */

export interface ArchiveLogRow {
  id:              string
  entityType:      string   // 'job' | 'quote' | 'client'
  entityId:        string
  entityLabel:     string   // human-readable (drawing number, quote number, client name)
  action:          string   // 'archive' | 'restore'
  performedBy:     string   // userId
  performedByName: string
  performedAt:     string
  reason:          string | null
}
