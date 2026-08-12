/**
 * Supabase-only password vault (Vercel / isSupabaseOnly).
 * Never imports SQLite passwordVaultDb.
 *
 * List responses omit decrypted passwords; findUnique / create / update decrypt once.
 */
import { createId } from "@paralleldrive/cuid2"
import { nowIso } from "@/lib/db/helpers"
import type { PasswordVaultEntryRow } from "@/lib/db/vault-types"
import type { VaultSortOrder } from "@/lib/db/stores/vault"
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

function serviceNameLower(name: string): string {
  return name.trim().toLowerCase()
}

export const passwordVaultService = {
  async findMany(opts: {
    search?: string
    sort?: VaultSortOrder
    /** When true, decrypt passwords (admin export only). Default: omit. */
    revealPasswords?: boolean
  } = {}): Promise<PasswordVaultEntry[]> {
    const rows = await supabasePasswordVaultRepo.findMany({
      search: opts.search,
      sort: opts.sort,
      includePasswordEnc: opts.revealPasswords,
    })
    return rows.map(opts.revealPasswords ? toPublic : toListPublic)
  },

  async findUnique(id: string): Promise<PasswordVaultEntry | null> {
    const row = await supabasePasswordVaultRepo.findUnique(id)
    return row ? toPublic(row) : null
  },

  async create(input: CreatePasswordVaultInput): Promise<PasswordVaultEntry> {
    const now = nowIso()
    const name = input.serviceName.trim()
    const row: PasswordVaultEntryRow = {
      id: createId(),
      serviceName: name,
      serviceNameLower: serviceNameLower(name),
      loginUrl: input.loginUrl ?? null,
      username: input.username ?? null,
      passwordEnc: encryptVaultSecret(input.password ?? ""),
      category: input.category ?? null,
      notes: input.notes ?? null,
      extraJson: null,
      createdAt: now,
      updatedAt: now,
    }
    await supabasePasswordVaultRepo.upsert(row)
    return toListPublic(row)
  },

  async update(id: string, input: UpdatePasswordVaultInput): Promise<PasswordVaultEntry | null> {
    const existing = await supabasePasswordVaultRepo.findUnique(id)
    if (!existing) return null
    const name = input.serviceName !== undefined ? input.serviceName.trim() : existing.serviceName
    const row: PasswordVaultEntryRow = {
      ...existing,
      serviceName: name,
      serviceNameLower: serviceNameLower(name),
      loginUrl: input.loginUrl !== undefined ? input.loginUrl : existing.loginUrl,
      username: input.username !== undefined ? input.username : existing.username,
      passwordEnc:
        input.password !== undefined
          ? encryptVaultSecret(input.password)
          : existing.passwordEnc,
      category: input.category !== undefined ? input.category : existing.category,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      updatedAt: nowIso(),
    }
    await supabasePasswordVaultRepo.upsert(row)
    return toListPublic(row)
  },

  async delete(id: string): Promise<boolean> {
    const existing = await supabasePasswordVaultRepo.findUnique(id)
    if (!existing) return false
    await supabasePasswordVaultRepo.delete(id)
    return true
  },
}
