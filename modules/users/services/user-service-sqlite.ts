/**
 * User directory — SQLite path for local/CI when Supabase admin is not configured.
 *
 * Dual-write / self-healing mirror to Supabase was removed: when admin
 * credentials are present the entry router loads user-service-supabase.ts
 * instead (isSupabaseOnly()). Login remains custom bcrypt + oryx_uid cookies.
 */
import type { CreateUserData, UpdateUserData, UserRow } from "../types/user-types"
import { userDb } from "@/lib/db/stores"

export const userService = {
  async findMany(opts: { activeOnly?: boolean } = {}): Promise<UserRow[]> {
    return userDb.findMany(opts)
  },

  async findUnique(id: string): Promise<UserRow | null> {
    return userDb.findUnique(id)
  },

  async findManyByIds(ids: string[]): Promise<UserRow[]> {
    const unique = [...new Set(ids.filter(Boolean))]
    if (!unique.length) return []
    return userDb.findManyByIds(unique)
  },

  async findByEmail(email: string): Promise<UserRow | null> {
    return userDb.findByEmail(email)
  },

  async count(opts: { activeOnly?: boolean } = {}): Promise<number> {
    return userDb.count(opts)
  },

  async activeAdminCount(): Promise<number> {
    return userDb.activeAdminCount()
  },

  async create(data: CreateUserData): Promise<UserRow> {
    return userDb.create(data)
  },

  async update(id: string, data: UpdateUserData): Promise<UserRow | null> {
    return userDb.update(id, data)
  },

  async delete(id: string): Promise<boolean> {
    return userDb.delete(id)
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

/** No-op on SQLite-only — users already live in SQLite. */
export async function ensureUsersInSqlite(_userIds: string[]): Promise<void> {
  return
}
