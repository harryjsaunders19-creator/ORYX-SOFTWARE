/** Public vault entry returned to authenticated clients. */
export interface PasswordVaultEntry {
  id: string
  serviceName: string
  loginUrl: string | null
  username: string | null
  /** Empty on list responses; decrypted only for findUnique / create / update. */
  password: string
  /** Present on list responses — password was intentionally not decrypted. */
  passwordRevealed?: false
  category: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface CreatePasswordVaultInput {
  serviceName: string
  loginUrl?: string | null
  username?: string | null
  password?: string
  category?: string | null
  notes?: string | null
}

export interface UpdatePasswordVaultInput {
  serviceName?: string
  loginUrl?: string | null
  username?: string | null
  password?: string
  category?: string | null
  notes?: string | null
}
