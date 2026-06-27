/**
 * User directory during Supabase migration.
 *
 * When SUPABASE_USERS=true:
 *   - Reads come from Supabase (including password_hash for login verification)
 *   - Writes SQLite first, then mirror to Supabase
 *
 * Login remains custom bcrypt + oryx_uid cookies — not Supabase Auth.
 */
import type { CreateUserData, UpdateUserData, UserRow } from "@/lib/db/user-types"
import { userDb } from "@/lib/db/stores"
import { useSupabaseUsers } from "@/lib/supabase/feature-flags"
import { supabaseUserRepo } from "@/lib/supabase/repositories/users"

async function mirror(user: UserRow | null) {
  if (user && useSupabaseUsers()) await supabaseUserRepo.upsert(user)
}

export const userService = {
  async findMany(opts: { activeOnly?: boolean } = {}): Promise<UserRow[]> {
    if (!useSupabaseUsers()) return userDb.findMany(opts)
    return supabaseUserRepo.findMany(opts)
  },

  async findUnique(id: string): Promise<UserRow | null> {
    if (!useSupabaseUsers()) return userDb.findUnique(id)
    return supabaseUserRepo.findUnique(id)
  },

  async findByEmail(email: string): Promise<UserRow | null> {
    if (!useSupabaseUsers()) return userDb.findByEmail(email)
    return supabaseUserRepo.findByEmail(email)
  },

  async count(opts: { activeOnly?: boolean } = {}): Promise<number> {
    if (!useSupabaseUsers()) return userDb.count(opts)
    return supabaseUserRepo.count(opts)
  },

  async activeAdminCount(): Promise<number> {
    if (!useSupabaseUsers()) return userDb.activeAdminCount()
    return supabaseUserRepo.activeAdminCount()
  },

  async create(data: CreateUserData): Promise<UserRow> {
    const user = userDb.create(data)
    await mirror(user)
    return user
  },

  async update(id: string, data: UpdateUserData): Promise<UserRow | null> {
    const user = userDb.update(id, data)
    await mirror(user)
    return user
  },

  async delete(id: string): Promise<boolean> {
    const ok = userDb.delete(id)
    if (ok && useSupabaseUsers()) await supabaseUserRepo.delete(id)
    return ok
  },

  /** Keep only ids that resolve to an existing user. */
  async filterExistingIds(ids: string[]): Promise<string[]> {
    const kept: string[] = []
    for (const id of ids) {
      if (typeof id !== "string" || !id.trim()) continue
      const user = await this.findUnique(id)
      if (user) kept.push(id)
    }
    return kept
  },
}
