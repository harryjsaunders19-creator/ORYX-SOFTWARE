import type { ClientHoldRow } from "@/lib/db/hold-types"

export interface SupabaseClientHoldRow {
  id: string
  client_id: string
  status: string
  reason: string
  notes: string | null
  added_by: string
  added_at: string
  removed_by: string | null
  removed_at: string | null
  removed_reason: string | null
}

export function toClientHoldRow(row: SupabaseClientHoldRow): ClientHoldRow {
  return {
    id: row.id,
    clientId: row.client_id,
    status: row.status,
    reason: row.reason,
    notes: row.notes,
    addedBy: row.added_by,
    addedAt: row.added_at,
    removedBy: row.removed_by,
    removedAt: row.removed_at,
    removedReason: row.removed_reason,
  }
}

export function toSupabaseClientHoldRow(row: ClientHoldRow): SupabaseClientHoldRow {
  return {
    id: row.id,
    client_id: row.clientId,
    status: row.status,
    reason: row.reason,
    notes: row.notes,
    added_by: row.addedBy,
    added_at: row.addedAt,
    removed_by: row.removedBy,
    removed_at: row.removedAt,
    removed_reason: row.removedReason,
  }
}
