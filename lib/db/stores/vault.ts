/** Company password vault table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import type {
  CreatePasswordVaultEntryData,
  PasswordVaultEntryRow,
  UpdatePasswordVaultEntryData,
} from "../vault-types"

export type {
  PasswordVaultEntryRow,
  CreatePasswordVaultEntryData,
  UpdatePasswordVaultEntryData,
} from "../vault-types"

export type VaultSortOrder = "asc" | "desc"

export const passwordVaultDb = {
  findMany(opts: {
    search?: string
    sort?: VaultSortOrder
  } = {}): PasswordVaultEntryRow[] {
    const clauses: string[] = []
    const params: unknown[] = []
    if (opts.search?.trim()) {
      clauses.push("(serviceNameLower LIKE ? OR categoryLower LIKE ? OR usernameLower LIKE ?)")
      const q = `%${opts.search.trim().toLowerCase()}%`
      params.push(q, q, q)
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    const order = opts.sort === "desc" ? "DESC" : "ASC"
    return db.prepare(
      `SELECT * FROM PasswordVaultEntry ${where} ORDER BY serviceNameLower ${order}`,
    ).all(...params) as PasswordVaultEntryRow[]
  },

  findUnique(id: string): PasswordVaultEntryRow | null {
    return (db.prepare("SELECT * FROM PasswordVaultEntry WHERE id = ?").get(id) as PasswordVaultEntryRow) ?? null
  },

  create(data: CreatePasswordVaultEntryData): PasswordVaultEntryRow {
    const now = nowIso()
    const serviceName = data.serviceName.trim()
    const loginUrl = data.loginUrl?.trim() || null
    const username = data.username?.trim() || null
    const category = data.category?.trim() || null
    db.prepare(`
      INSERT INTO PasswordVaultEntry (
        id, serviceName, serviceNameLower, loginUrl, username, usernameLower,
        passwordEnc, category, categoryLower, notes, extraJson, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id,
      serviceName,
      serviceName.toLowerCase(),
      loginUrl,
      username,
      username?.toLowerCase() ?? null,
      data.passwordEnc,
      category,
      category?.toLowerCase() ?? null,
      data.notes?.trim() || null,
      data.extraJson ?? null,
      now,
      now,
    )
    return this.findUnique(data.id)!
  },

  update(id: string, data: UpdatePasswordVaultEntryData): PasswordVaultEntryRow | null {
    const existing = this.findUnique(id)
    if (!existing) return null
    const fields: string[] = []
    const params: unknown[] = []

    if (data.serviceName !== undefined) {
      const serviceName = data.serviceName.trim()
      fields.push("serviceName = ?", "serviceNameLower = ?")
      params.push(serviceName, serviceName.toLowerCase())
    }
    if (data.loginUrl !== undefined) {
      fields.push("loginUrl = ?")
      params.push(data.loginUrl?.trim() || null)
    }
    if (data.username !== undefined) {
      const username = data.username?.trim() || null
      fields.push("username = ?", "usernameLower = ?")
      params.push(username, username?.toLowerCase() ?? null)
    }
    if (data.passwordEnc !== undefined) {
      fields.push("passwordEnc = ?")
      params.push(data.passwordEnc)
    }
    if (data.category !== undefined) {
      const category = data.category?.trim() || null
      fields.push("category = ?", "categoryLower = ?")
      params.push(category, category?.toLowerCase() ?? null)
    }
    if (data.notes !== undefined) {
      fields.push("notes = ?")
      params.push(data.notes?.trim() || null)
    }
    if (data.extraJson !== undefined) {
      fields.push("extraJson = ?")
      params.push(data.extraJson)
    }
    if (!fields.length) return existing

    fields.push("updatedAt = ?")
    params.push(nowIso(), id)
    db.prepare(`UPDATE PasswordVaultEntry SET ${fields.join(", ")} WHERE id = ?`).run(...params)
    return this.findUnique(id)
  },

  delete(id: string): boolean {
    return db.prepare("DELETE FROM PasswordVaultEntry WHERE id = ?").run(id).changes > 0
  },
}
