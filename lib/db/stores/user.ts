/** User directory table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"

export type { Role, UserRow, CreateUserData, UpdateUserData, PublicUserRow } from "../user-types"
export { withoutPassword } from "../user-types"
import type { CreateUserData, UpdateUserData, UserRow } from "../user-types"

export const userDb = {
  findMany(opts: { activeOnly?: boolean } = {}): UserRow[] {
    const where = opts.activeOnly ? "WHERE active = 1" : ""
    return db.prepare(`SELECT * FROM User ${where} ORDER BY name ASC`).all() as UserRow[]
  },

  findUnique(id: string): UserRow | null {
    return (db.prepare("SELECT * FROM User WHERE id = ?").get(id) as UserRow) ?? null
  },

  findManyByIds(ids: string[]): UserRow[] {
    if (!ids.length) return []
    const placeholders = ids.map(() => "?").join(",")
    return db.prepare(`SELECT * FROM User WHERE id IN (${placeholders})`).all(...ids) as UserRow[]
  },

  findByEmail(email: string): UserRow | null {
    const lower = email.trim().toLowerCase()
    if (!lower) return null
    return (db.prepare("SELECT * FROM User WHERE emailLower = ?").get(lower) as UserRow) ?? null
  },

  count(opts: { activeOnly?: boolean } = {}): number {
    const where = opts.activeOnly ? "WHERE active = 1" : ""
    return (db.prepare(`SELECT COUNT(*) as n FROM User ${where}`).get() as { n: number }).n
  },

  /** Count active users with the ADMIN role — used to stop the last admin being demoted/disabled */
  activeAdminCount(): number {
    return (db.prepare("SELECT COUNT(*) as n FROM User WHERE role = 'ADMIN' AND active = 1").get() as { n: number }).n
  },

  create(data: CreateUserData): UserRow {
    const now   = nowIso()
    const email = data.email?.trim() || null
    db.prepare(`
      INSERT INTO User (id,name,email,emailLower,role,active,moduleAccessJson,passwordHash,mustChangePassword,createdAt,updatedAt)
      VALUES (?,?,?,?,?,1,?,?,?,?,?)
    `).run(
      data.id, data.name.trim(), email, email?.toLowerCase() ?? null,
      data.role ?? "ENGINEER", data.moduleAccessJson ?? null, data.passwordHash ?? null, data.mustChangePassword ?? 0,
      now, now,
    )
    return this.findUnique(data.id)!
  },

  update(id: string, data: UpdateUserData): UserRow | null {
    const existing = this.findUnique(id)
    if (!existing) return null
    const fields: string[] = []
    const params: unknown[] = []
    if (data.name !== undefined) { fields.push('"name" = ?'); params.push(data.name.trim()) }
    if (data.email !== undefined) {
      const email = data.email?.trim() || null
      fields.push('"email" = ?', '"emailLower" = ?')
      params.push(email, email?.toLowerCase() ?? null)
    }
    if (data.role               !== undefined) { fields.push('"role" = ?');               params.push(data.role) }
    if (data.active             !== undefined) { fields.push('"active" = ?');             params.push(data.active) }
    if (data.moduleAccessJson   !== undefined) { fields.push('"moduleAccessJson" = ?');   params.push(data.moduleAccessJson) }
    if (data.passwordHash       !== undefined) { fields.push('"passwordHash" = ?');       params.push(data.passwordHash) }
    if (data.mustChangePassword !== undefined) { fields.push('"mustChangePassword" = ?'); params.push(data.mustChangePassword) }
    if (!fields.length) return existing
    fields.push('"updatedAt" = ?'); params.push(nowIso(), id)
    db.prepare(`UPDATE User SET ${fields.join(", ")} WHERE id = ?`).run(...params)
    return this.findUnique(id)
  },

  delete(id: string): boolean {
    return db.prepare("DELETE FROM User WHERE id = ?").run(id).changes > 0
  },

  /** Insert a user row from an external source (e.g. Supabase) without triggering side-effects.
   *  Uses INSERT OR IGNORE so it is safe to call even when the row already exists. */
  rawInsertOrIgnore(user: import("@/modules/users/types").UserRow): void {
    const email = user.email?.trim() || null
    db.prepare(`
      INSERT OR IGNORE INTO User (id,name,email,emailLower,role,active,moduleAccessJson,passwordHash,mustChangePassword,createdAt,updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      user.id, user.name, email, email?.toLowerCase() ?? null,
      user.role ?? "ENGINEER", user.active ?? 1,
      user.moduleAccessJson ?? null, user.passwordHash ?? null, user.mustChangePassword ?? 0,
      user.createdAt, user.updatedAt,
    )
  },
}
