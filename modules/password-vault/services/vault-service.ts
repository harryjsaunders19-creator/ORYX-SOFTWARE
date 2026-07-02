import { createId } from "@paralleldrive/cuid2"
import { passwordVaultDb, type VaultSortOrder } from "@/lib/db/stores/vault"
import type { PasswordVaultEntryRow } from "@/lib/db/vault-types"
import { decryptVaultSecret, encryptVaultSecret } from "../crypto/vault-crypto"
import type {
  CreatePasswordVaultInput,
  PasswordVaultEntry,
  UpdatePasswordVaultInput,
} from "../types"

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
  findMany(opts: { search?: string; sort?: VaultSortOrder } = {}): PasswordVaultEntry[] {
    return passwordVaultDb.findMany(opts).map(toPublic)
  },

  findUnique(id: string): PasswordVaultEntry | null {
    const row = passwordVaultDb.findUnique(id)
    return row ? toPublic(row) : null
  },

  create(input: CreatePasswordVaultInput): PasswordVaultEntry {
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

  update(id: string, input: UpdatePasswordVaultInput): PasswordVaultEntry | null {
    const row = passwordVaultDb.update(id, {
      ...(input.serviceName !== undefined && { serviceName: input.serviceName }),
      ...(input.loginUrl !== undefined && { loginUrl: input.loginUrl }),
      ...(input.username !== undefined && { username: input.username }),
      ...(input.password !== undefined && { passwordEnc: encryptVaultSecret(input.password) }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.notes !== undefined && { notes: input.notes }),
    })
    return row ? toPublic(row) : null
  },

  delete(id: string): boolean {
    return passwordVaultDb.delete(id)
  },
}
