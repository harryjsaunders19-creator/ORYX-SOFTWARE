/**
 * User directory during Supabase migration.
 *
 * When SUPABASE_USERS=true:
 *   - Reads come from Supabase (including password_hash for login verification)
 *   - Writes SQLite first, then mirror to Supabase
 *   - findByEmail / findUnique fall back to SQLite when Supabase returns null
 *     and automatically mirror the user so future reads succeed from Supabase.
 *     This makes the first login on a fresh deployment self-healing — the
 *     SQLite bootstrap accounts (admin@test.com etc.) become reachable even
 *     before they have been explicitly synced to Supabase.
 *
 * Login remains custom bcrypt + oryx_uid cookies — not Supabase Auth.
 */
import type { CreateUserData, UpdateUserData, UserRow } from "../types/user-types"
import { userDb } from "@/lib/db/stores"
import { useSupabaseUsers } from "@/shared/supabase/feature-flags"
import { supabaseUserRepo } from "../supabase/repository"

async function mirror(user: UserRow | null) {
  if (user && useSupabaseUsers()) await supabaseUserRepo.upsert(user)
}

/** Try SQLite as a fallback and best-effort mirror to Supabase. */
async function sqliteFallback(user: UserRow | null): Promise<UserRow | null> {
  if (!user) return null
  try { await supabaseUserRepo.upsert(user) } catch { /* best-effort */ }
  return user
}

export const userService = {
  async findMany(opts: { activeOnly?: boolean } = {}): Promise<UserRow[]> {
    if (!useSupabaseUsers()) return userDb.findMany(opts)
    const rows = await supabaseUserRepo.findMany(opts)
    // When Supabase is empty (e.g. fresh deploy before first login), fall back to
    // SQLite so the admin page still shows bootstrap accounts.
    if (rows.length === 0) return userDb.findMany(opts)
    return rows
  },

  async findUnique(id: string): Promise<UserRow | null> {
    if (!useSupabaseUsers()) return userDb.findUnique(id)
    const user = await supabaseUserRepo.findUnique(id)
    if (user) return user
    return sqliteFallback(userDb.findUnique(id))
  },

  async findManyByIds(ids: string[]): Promise<UserRow[]> {
    const unique = [...new Set(ids.filter(Boolean))]
    if (!unique.length) return []
    if (!useSupabaseUsers()) return userDb.findManyByIds(unique)
    const rows = await supabaseUserRepo.findManyByIds(unique)
    if (rows.length >= unique.length) return rows
    const found = new Set(rows.map(r => r.id))
    const missing = unique.filter(id => !found.has(id))
    const fromSqlite = userDb.findManyByIds(missing)
    return [...rows, ...fromSqlite]
  },

  async findByEmail(email: string): Promise<UserRow | null> {
    if (!useSupabaseUsers()) return userDb.findByEmail(email)
    try {
      const user = await supabaseUserRepo.findByEmail(email)
      if (user) return user
    } catch (err) {
      // On Vercel, SQLite is empty — surface the Supabase failure to the login
      // route instead of silently returning "invalid password".
      if (process.env.VERCEL === "1" || process.env.FORCE_SUPABASE_ONLY === "true") {
        throw err
      }
      console.warn("[users.findByEmail] Supabase lookup failed; trying SQLite.", err)
    }
    // Not in Supabase yet — try SQLite (bootstrap accounts / pre-migration state)
    // and mirror into Supabase so the next login goes directly through Supabase.
    return sqliteFallback(userDb.findByEmail(email))
  },

  async count(opts: { activeOnly?: boolean } = {}): Promise<number> {
    if (!useSupabaseUsers()) return userDb.count(opts)
    const n = await supabaseUserRepo.count(opts)
    if (n === 0) return userDb.count(opts)
    return n
  },

  async activeAdminCount(): Promise<number> {
    if (!useSupabaseUsers()) return userDb.activeAdminCount()
    const n = await supabaseUserRepo.activeAdminCount()
    if (n === 0) return userDb.activeAdminCount()
    return n
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

/**
 * Ensures a list of users exist in the local SQLite DB, fetching any missing
 * ones from Supabase. Used by calendar-service before creating assignments —
 * CalendarAssignment.userId NOT NULL REFERENCES User(id).
 */
export async function ensureUsersInSqlite(userIds: string[]): Promise<void> {
  if (!useSupabaseUsers()) return
  const missing = userIds.filter(id => !userDb.findUnique(id))
  if (!missing.length) return
  try {
    for (const id of missing) {
      const user = await supabaseUserRepo.findUnique(id)
      if (user) userDb.rawInsertOrIgnore(user)
    }
  } catch {
    // Non-fatal
  }
}
