import type { UserRow } from "../types/user-types"

export interface SupabaseAppUserRow {
  id: string
  name: string
  email: string | null
  email_lower: string | null
  role: string
  active: boolean
  module_access_json: unknown | null
  password_hash: string | null
  must_change_password: boolean
  created_at: string
  updated_at: string
}

export function toUserRow(row: SupabaseAppUserRow): UserRow {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailLower: row.email_lower,
    role: row.role as UserRow["role"],
    active: row.active ? 1 : 0,
    moduleAccessJson: typeof row.module_access_json === "string" ? row.module_access_json : row.module_access_json == null ? null : JSON.stringify(row.module_access_json),
    passwordHash: row.password_hash,
    mustChangePassword: row.must_change_password ? 1 : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toSupabaseAppUserRow(row: UserRow): SupabaseAppUserRow {
  let moduleAccessJson: unknown | null = null
  if (row.moduleAccessJson) {
    try {
      moduleAccessJson = JSON.parse(row.moduleAccessJson)
    } catch {
      moduleAccessJson = null
    }
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    email_lower: row.emailLower,
    role: row.role,
    active: row.active === 1,
    module_access_json: moduleAccessJson,
    password_hash: row.passwordHash,
    must_change_password: row.mustChangePassword === 1,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}
