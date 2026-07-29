/**
 * Password vault — SQLite path for local/CI when Supabase admin is not configured.
 *
 * Dual-write to Supabase was removed: when admin credentials are present the
 * entry router loads vault-service-supabase.ts instead (isSupabaseOnly()).
 * Passwords are encrypted at rest (AES-256-GCM) before storage.
 */
import { createId } from "@paralleldrive/cuid2"
import { passwordVaultDb, type VaultSortOrder } from "@/lib/db/stores/vault"
import type { PasswordVaultEntryRow } from "@/lib/db/vault-types"
import { decryptVaultSecret, encryptVaultSecret } from "../crypto/vault-crypto"
import type {
  CreatePasswordVaultInput,
  PasswordVaultEntry,
  UpdatePasswordVaultInput,
} from "../types"

function toListPublic(row: PasswordVaultEntryRow): PasswordVaultEntry {
  return {
    id: row.id,
    serviceName: row.serviceName,
    loginUrl: row.loginUrl,
    username: row.username,
    password: "",
    passwordRevealed: false,
    category: row.category,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toPublic(row: PasswordVaultEntryRow): PasswordVaultEntry {
  return {
    id: row.id,
    serviceName: row.serviceName,
    loginUrl: row.loginUrl,
    username: row.username,
    password: decryptVaultSecret(row.passwordEnc),
    category: row.category,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export const passwordVaultService = {
  async findMany(opts: {
    search?: string
    sort?: VaultSortOrder
    /** When true, decrypt passwords (admin export only). Default: omit. */
    revealPasswords?: boolean
  } = {}): Promise<PasswordVaultEntry[]> {
    const rows = passwordVaultDb.findMany(opts)
    return rows.map(opts.revealPasswords ? toPublic : toListPublic)
  },

  async findUnique(id: string): Promise<PasswordVaultEntry | null> {
    const row = passwordVaultDb.findUnique(id)
    return row ? toPublic(row) : null
  },

  async create(input: CreatePasswordVaultInput): Promise<PasswordVaultEntry> {
    const row = passwordVaultDb.create({
      id: createId(),
      serviceName: input.serviceName,
      loginUrl: input.loginUrl,
      username: input.username,
      passwordEnc: encryptVaultSecret(input.password ?? ""),
      category: input.category,
      notes: input.notes,
    })
    return toPublic(row)
  },

  async update(id: string, input: UpdatePasswordVaultInput): Promise<PasswordVaultEntry | null> {
    const row = passwordVaultDb.update(id, {
      ...(input.serviceName !== undefined && { serviceName: input.serviceName }),
      ...(input.loginUrl !== undefined && { loginUrl: input.loginUrl }),
      ...(input.username !== undefined && { username: input.username }),
      ...(input.password !== undefined && { passwordEnc: encryptVaultSecret(input.password) }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.notes !== undefined && { notes: input.notes }),
    })
    if (!row) return null
    return toPublic(row)
  },

  async delete(id: string): Promise<boolean> {
    return passwordVaultDb.delete(id)
  },
}
