import type { UserRow } from "../types/user-types"

export interface SupabaseAppUserRow {
  id: string
  name: string
  email: string | null
  email_lower: string | null
  role: string
  active: boolean
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
    passwordHash: row.password_hash,
    mustChangePassword: row.must_change_password ? 1 : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toSupabaseAppUserRow(row: UserRow): SupabaseAppUserRow {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    email_lower: row.emailLower,
    role: row.role,
    active: row.active === 1,
    password_hash: row.passwordHash,
    must_change_password: row.mustChangePassword === 1,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}
