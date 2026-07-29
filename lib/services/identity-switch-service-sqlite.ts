/**
 * Identity switch audit log — SQLite path for local/CI.
 */
import type {
  CreateIdentitySwitchLogData,
  IdentitySwitchLogRow,
} from "@/lib/db/identity-switch-types"
import { identitySwitchLogDb } from "@/lib/db/stores/identity-switch-log"

export const identitySwitchLogService = {
  async log(data: CreateIdentitySwitchLogData): Promise<IdentitySwitchLogRow> {
    return identitySwitchLogDb.log(data)
  },

  async findMany(opts: { take?: number } = {}): Promise<IdentitySwitchLogRow[]> {
    return identitySwitchLogDb.findMany(opts)
  },

  async findForUser(userId: string, opts: { take?: number } = {}): Promise<IdentitySwitchLogRow[]> {
    return identitySwitchLogDb.findForUser(userId, opts)
  },
}
