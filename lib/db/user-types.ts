/** User directory types shared across SQLite and Supabase. */

export type Role = "ADMIN" | "ENGINEER"

export interface UserRow {
  id: string
  name: string
  email: string | null
  emailLower: string | null
  role: Role
  active: number
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
  passwordHash?: string | null
  mustChangePassword?: number
}

export interface UpdateUserData {
  name?: string
  email?: string | null
  role?: Role
  active?: number
  passwordHash?: string | null
  mustChangePassword?: number
}

export type PublicUserRow = Omit<UserRow, "passwordHash">

export function withoutPassword(user: UserRow): PublicUserRow {
  const { passwordHash: _ignored, ...rest } = user
  return rest
}
