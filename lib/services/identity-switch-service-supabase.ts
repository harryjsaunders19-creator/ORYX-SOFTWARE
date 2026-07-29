/**
 * Identity switch audit log — Supabase-only path (Vercel / isSupabaseOnly).
 */
import { createId as nanoid } from "@paralleldrive/cuid2"
import type {
  CreateIdentitySwitchLogData,
  IdentitySwitchLogRow,
} from "@/lib/db/identity-switch-types"
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
    const row = buildRow(data)
    await supabaseIdentitySwitchRepo.upsert(row)
    return row
  },

  async findMany(opts: { take?: number } = {}): Promise<IdentitySwitchLogRow[]> {
    return supabaseIdentitySwitchRepo.findMany(opts)
  },

  async findForUser(userId: string, opts: { take?: number } = {}): Promise<IdentitySwitchLogRow[]> {
    return supabaseIdentitySwitchRepo.findForUser(userId, opts)
  },
}
