/** SQLite row for shared company credential vault entries. */
export interface PasswordVaultEntryRow {
  id: string
  serviceName: string
  serviceNameLower: string
  loginUrl: string | null
  username: string | null
  passwordEnc: string
  category: string | null
  notes: string | null
  extraJson: string | null
  createdAt: string
  updatedAt: string
}

export interface CreatePasswordVaultEntryData {
  id: string
  serviceName: string
  loginUrl?: string | null
  username?: string | null
  passwordEnc: string
  category?: string | null
  notes?: string | null
  extraJson?: string | null
}

export interface UpdatePasswordVaultEntryData {
  serviceName?: string
  loginUrl?: string | null
  username?: string | null
  passwordEnc?: string
  category?: string | null
  notes?: string | null
  extraJson?: string | null
}
