/**
 * Supabase-only user directory (Vercel / isSupabaseOnly).
 * Never imports SQLite userDb or connection.
 */
import { nowIso } from "@/lib/db/helpers"
import type { CreateUserData, UpdateUserData, UserRow } from "../types/user-types"
import { supabaseUserRepo } from "../supabase/repository"

function buildUser(data: CreateUserData): UserRow {
  const now = nowIso()
  const email = data.email?.trim() || null
  return {
    id: data.id,
    name: data.name.trim(),
    email,
    emailLower: email?.toLowerCase() ?? null,
    role: data.role ?? "ENGINEER",
    active: 1,
    moduleAccessJson: data.moduleAccessJson ?? null,
    passwordHash: data.passwordHash ?? null,
    mustChangePassword: data.mustChangePassword ?? 0,
    createdAt: now,
    updatedAt: now,
  }
}

export const userService = {
  async findMany(opts: { activeOnly?: boolean } = {}): Promise<UserRow[]> {
    return supabaseUserRepo.findMany(opts)
  },

  async findUnique(id: string): Promise<UserRow | null> {
    return supabaseUserRepo.findUnique(id)
  },

  async findManyByIds(ids: string[]): Promise<UserRow[]> {
    const unique = [...new Set(ids.filter(Boolean))]
    if (!unique.length) return []
    return supabaseUserRepo.findManyByIds(unique)
  },

  async findByEmail(email: string): Promise<UserRow | null> {
    return supabaseUserRepo.findByEmail(email)
  },

  async count(opts: { activeOnly?: boolean } = {}): Promise<number> {
    return supabaseUserRepo.count(opts)
  },

  async activeAdminCount(): Promise<number> {
    return supabaseUserRepo.activeAdminCount()
  },

  async create(data: CreateUserData): Promise<UserRow> {
    const user = buildUser(data)
    await supabaseUserRepo.upsert(user)
    return user
  },

  async update(id: string, data: UpdateUserData): Promise<UserRow | null> {
    const existing = await supabaseUserRepo.findUnique(id)
    if (!existing) return null
    const email =
      data.email !== undefined ? (data.email?.trim() || null) : existing.email
    const updated: UserRow = {
      ...existing,
      name: data.name !== undefined ? data.name.trim() : existing.name,
      email,
      emailLower: email?.toLowerCase() ?? null,
      role: data.role ?? existing.role,
      active: data.active ?? existing.active,
      moduleAccessJson: data.moduleAccessJson !== undefined ? data.moduleAccessJson : existing.moduleAccessJson,
      passwordHash: data.passwordHash !== undefined ? data.passwordHash : existing.passwordHash,
      mustChangePassword:
        data.mustChangePassword !== undefined
          ? data.mustChangePassword
          : existing.mustChangePassword,
      updatedAt: nowIso(),
    }
    await supabaseUserRepo.upsert(updated)
    return updated
  },

  async delete(id: string): Promise<boolean> {
    return supabaseUserRepo.delete(id)
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

/** No-op on Supabase-only — there is no local SQLite to sync into. */
export async function ensureUsersInSqlite(_userIds: string[]): Promise<void> {
  return
}
