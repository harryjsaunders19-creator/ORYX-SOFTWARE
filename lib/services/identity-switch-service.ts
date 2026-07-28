/**
 * Identity switch audit log.
 *
 * Supabase path (Vercel / when SUPABASE_IDENTITY_LOG is on): write only to
 * identity_switch_logs — never touch SQLite (no IdentitySwitchLog table on
 * ephemeral /tmp DBs).
 *
 * Local hybrid: SQLite first, optional Supabase mirror.
 */
import { createId as nanoid } from "@paralleldrive/cuid2"
import type {
  CreateIdentitySwitchLogData,
  IdentitySwitchLogRow,
} from "@/lib/db/identity-switch-types"
import { useSupabaseIdentityLog } from "@/shared/supabase/feature-flags"
import { supabaseIdentitySwitchRepo } from "@/modules/users/supabase/identity-switch-repository"

function buildRow(data: CreateIdentitySwitchLogData): IdentitySwitchLogRow {
  return {
    id: nanoid(),
    action: data.action,
    realUserId: data.realUserId ?? null,
    realUserName: data.realUserName ?? null,
    targetUserId: data.targetUserId ?? null,
    targetUserName: data.targetUserName ?? null,
    detail: data.detail ?? null,
    createdAt: new Date().toISOString(),
  }
}

export const identitySwitchLogService = {
  async log(data: CreateIdentitySwitchLogData): Promise<IdentitySwitchLogRow> {
    if (useSupabaseIdentityLog()) {
      const row = buildRow(data)
      await supabaseIdentitySwitchRepo.upsert(row)
      return row
    }
    // Local SQLite-only / hybrid without identity-log flag
    const { identitySwitchLogDb } = await import("@/lib/db/stores/identity-switch-log")
    return identitySwitchLogDb.log(data)
  },

  async findMany(opts: { take?: number } = {}): Promise<IdentitySwitchLogRow[]> {
    if (useSupabaseIdentityLog()) {
      return supabaseIdentitySwitchRepo.findMany(opts)
    }
    const { identitySwitchLogDb } = await import("@/lib/db/stores/identity-switch-log")
    return identitySwitchLogDb.findMany(opts)
  },

  async findForUser(userId: string, opts: { take?: number } = {}): Promise<IdentitySwitchLogRow[]> {
    if (useSupabaseIdentityLog()) {
      return supabaseIdentitySwitchRepo.findForUser(userId, opts)
    }
    const { identitySwitchLogDb } = await import("@/lib/db/stores/identity-switch-log")
    return identitySwitchLogDb.findForUser(userId, opts)
  },
}
