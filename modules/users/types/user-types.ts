/** User directory types shared across SQLite and Supabase. */
import type { User } from "@/lib/types"
import { parseModuleAccessJson } from "@/shared/auth/permissions"
import type { Role } from "@/shared/types/role"

export type { Role }

export interface UserRow {
  id: string
  name: string
  email: string | null
  emailLower: string | null
  role: Role
  active: number
  moduleAccessJson: string | null
  passwordHash: string | null
  mustChangePassword: number
  createdAt: string
  updatedAt: string
}

export interface CreateUserData {
  id: string
  name: string
  email?: string | null
  role?: Role
  moduleAccessJson?: string | null
  passwordHash?: string | null
  mustChangePassword?: number
}

export interface UpdateUserData {
  name?: string
  email?: string | null
  role?: Role
  active?: number
  moduleAccessJson?: string | null
  passwordHash?: string | null
  mustChangePassword?: number
}

export type PublicUserRow = Omit<UserRow, "passwordHash">

export function withoutPassword(user: UserRow): PublicUserRow {
  const { passwordHash: _ignored, ...rest } = user
  return rest
}

export function toPublicUser(user: UserRow): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    moduleAccess: parseModuleAccessJson(user.moduleAccessJson),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}
