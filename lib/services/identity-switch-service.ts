/**
 * Identity switch audit log during Supabase migration.
 *
 * When SUPABASE_IDENTITY_LOG=true:
 *   - Reads come from Supabase
 *   - Writes SQLite first (append-only), then mirror
 */
import type {
  CreateIdentitySwitchLogData,
  IdentitySwitchLogRow,
} from "@/lib/db/identity-switch-types"
import { identitySwitchLogDb } from "@/lib/db/stores"
import { useSupabaseIdentityLog } from "@/lib/supabase/feature-flags"
import { supabaseIdentitySwitchRepo } from "@/lib/supabase/repositories/identity-switch"

export const identitySwitchLogService = {
  async log(data: CreateIdentitySwitchLogData): Promise<IdentitySwitchLogRow> {
    const row = identitySwitchLogDb.log(data)
    if (useSupabaseIdentityLog()) await supabaseIdentitySwitchRepo.upsert(row)
    return row
  },

  async findMany(opts: { take?: number } = {}): Promise<IdentitySwitchLogRow[]> {
    if (!useSupabaseIdentityLog()) return identitySwitchLogDb.findMany(opts)
    return supabaseIdentitySwitchRepo.findMany(opts)
  },

  async findForUser(userId: string, opts: { take?: number } = {}): Promise<IdentitySwitchLogRow[]> {
    if (!useSupabaseIdentityLog()) return identitySwitchLogDb.findForUser(userId, opts)
    return supabaseIdentitySwitchRepo.findForUser(userId, opts)
  },
}
