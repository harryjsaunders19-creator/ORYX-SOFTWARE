/** Identity switch audit log types shared across SQLite and Supabase. */

export type IdentitySwitchAction =
  | "SESSION_STARTED"
  | "IMPERSONATION_STARTED"
  | "IMPERSONATION_ENDED"
  | "IMPERSONATION_REJECTED"
  | "LOGOUT"
  | "FIRST_ADMIN_PROVISIONED"

export interface IdentitySwitchLogRow {
  id: string
  action: IdentitySwitchAction
  realUserId: string | null
  realUserName: string | null
  targetUserId: string | null
  targetUserName: string | null
  detail: string | null
  createdAt: string
}

export interface CreateIdentitySwitchLogData {
  action: IdentitySwitchAction
  realUserId?: string | null
  realUserName?: string | null
  targetUserId?: string | null
  targetUserName?: string | null
  detail?: string | null
}
