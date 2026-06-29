import type { ArchiveLogRow } from "@/lib/db/archive-types"

export interface SupabaseArchiveLogRow {
  id: string
  entity_type: string
  entity_id: string
  entity_label: string
  action: string
  performed_by: string
  performed_by_name: string
  performed_at: string
  reason: string | null
}

export function toArchiveLogRow(row: SupabaseArchiveLogRow): ArchiveLogRow {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityLabel: row.entity_label,
    action: row.action,
    performedBy: row.performed_by,
    performedByName: row.performed_by_name,
    performedAt: row.performed_at,
    reason: row.reason,
  }
}

export function toSupabaseArchiveLogRow(row: ArchiveLogRow): SupabaseArchiveLogRow {
  return {
    id: row.id,
    entity_type: row.entityType,
    entity_id: row.entityId,
    entity_label: row.entityLabel,
    action: row.action,
    performed_by: row.performedBy,
    performed_by_name: row.performedByName,
    performed_at: row.performedAt,
    reason: row.reason,
  }
}
