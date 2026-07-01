import type { IdentitySwitchLogRow } from "@/lib/db/identity-switch-types"

export interface SupabaseIdentitySwitchLogRow {
  id: string
  action: string
  real_user_id: string | null
  real_user_name: string | null
  target_user_id: string | null
  target_user_name: string | null
  detail: string | null
  created_at: string
}

export function toIdentitySwitchLogRow(row: SupabaseIdentitySwitchLogRow): IdentitySwitchLogRow {
  return {
    id: row.id,
    action: row.action as IdentitySwitchLogRow["action"],
    realUserId: row.real_user_id,
    realUserName: row.real_user_name,
    targetUserId: row.target_user_id,
    targetUserName: row.target_user_name,
    detail: row.detail,
    createdAt: row.created_at,
  }
}

export function toSupabaseIdentitySwitchLogRow(row: IdentitySwitchLogRow): SupabaseIdentitySwitchLogRow {
  return {
    id: row.id,
    action: row.action,
    real_user_id: row.realUserId,
    real_user_name: row.realUserName,
    target_user_id: row.targetUserId,
    target_user_name: row.targetUserName,
    detail: row.detail,
    created_at: row.createdAt,
  }
}
