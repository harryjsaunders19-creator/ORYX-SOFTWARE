/**
 * Account password vault — shared business credentials.
 *
 * When SUPABASE_PASSWORD_VAULT=true:
 *   - Reads come from Supabase
 *   - Writes go to SQLite first, then mirror to Supabase (encrypted password_enc)
 *
 * Passwords are encrypted at rest (AES-256-GCM) before storage in either database.
 * List responses omit decrypted passwords; findUnique / create / update decrypt once.
 */
import { createId } from "@paralleldrive/cuid2"
import { passwordVaultDb, type VaultSortOrder } from "@/lib/db/stores/vault"
import type { PasswordVaultEntryRow } from "@/lib/db/vault-types"
import { useSupabasePasswordVault } from "@/shared/supabase/feature-flags"
import { supabasePasswordVaultRepo } from "../supabase/repository"
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

async function mirrorEntry(row: PasswordVaultEntryRow | null): Promise<void> {
  if (row && useSupabasePasswordVault()) await supabasePasswordVaultRepo.upsert(row)
}

async function deleteMirror(id: string): Promise<void> {
  if (useSupabasePasswordVault()) await supabasePasswordVaultRepo.delete(id)
}

async function fetchMany(opts: {
  search?: string
  sort?: VaultSortOrder
}): Promise<PasswordVaultEntryRow[]> {
  if (useSupabasePasswordVault()) return supabasePasswordVaultRepo.findMany(opts)
  return passwordVaultDb.findMany(opts)
}

async function fetchUnique(id: string): Promise<PasswordVaultEntryRow | null> {
  if (useSupabasePasswordVault()) return supabasePasswordVaultRepo.findUnique(id)
  return passwordVaultDb.findUnique(id)
}

export const passwordVaultService = {
  async findMany(opts: {
    search?: string
    sort?: VaultSortOrder
    /** When true, decrypt passwords (admin export only). Default: omit. */
    revealPasswords?: boolean
  } = {}): Promise<PasswordVaultEntry[]> {
    const rows = await fetchMany(opts)
    return rows.map(opts.revealPasswords ? toPublic : toListPublic)
  },

  async findUnique(id: string): Promise<PasswordVaultEntry | null> {
    const row = await fetchUnique(id)
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
    await mirrorEntry(row)
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
    await mirrorEntry(row)
    return toPublic(row)
  },

  async delete(id: string): Promise<boolean> {
    const ok = passwordVaultDb.delete(id)
    if (!ok) return false
    await deleteMirror(id)
    return true
  },
}
