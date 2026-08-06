import { createAdminClient } from "@/shared/supabase/admin"
import type { PasswordVaultEntryRow } from "@/lib/db/vault-types"
import type { VaultSortOrder } from "@/lib/db/stores/vault"
import { postgrestOrIlike } from "@/shared/supabase/postgrest-filter"
import {
  toPasswordVaultEntryRow,
  toSupabasePasswordVaultEntryRow,
} from "./mapper"

function table() {
  return createAdminClient().from("password_vault_entries")
}

/** List UI blanks passwords — do not transfer ciphertext for every row. */
const VAULT_LIST_SELECT =
  "id, service_name, service_name_lower, login_url, username, username_lower, category, category_lower, notes, extra_json, created_at, updated_at"

export const supabasePasswordVaultRepo = {
  async findMany(opts: {
    search?: string
    sort?: VaultSortOrder
    /** When true, include ciphertext (export / reveal). Default list omits it. */
    includePasswordEnc?: boolean
  } = {}): Promise<PasswordVaultEntryRow[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = table().select(opts.includePasswordEnc ? "*" : VAULT_LIST_SELECT)
    if (opts.search?.trim()) {
      const orFilter = postgrestOrIlike(
        ["service_name_lower", "category_lower", "username_lower"],
        opts.search.trim().toLowerCase(),
      )
      if (orFilter) q = q.or(orFilter)
    }
    q = q.order("service_name_lower", { ascending: opts.sort !== "desc" })
    const { data, error } = await q
    if (error) throw error
    const rows = (data ?? []) as Record<string, unknown>[]
    if (opts.includePasswordEnc) {
      return rows.map(row => toPasswordVaultEntryRow(row as unknown as import("./mapper").SupabasePasswordVaultEntryRow))
    }
    return rows.map(row =>
      toPasswordVaultEntryRow({
        ...(row as unknown as Omit<import("./mapper").SupabasePasswordVaultEntryRow, "password_enc">),
        password_enc: "",
      }),
    )
  },

  async findUnique(id: string): Promise<PasswordVaultEntryRow | null> {
    const { data, error } = await table().select("*").eq("id", id).maybeSingle()
    if (error) throw error
    return data ? toPasswordVaultEntryRow(data) : null
  },

  async upsert(row: PasswordVaultEntryRow): Promise<void> {
    const { error } = await table().upsert(toSupabasePasswordVaultEntryRow(row), { onConflict: "id" })
    if (error) throw error
  },

  async delete(id: string): Promise<void> {
    const { error } = await table().delete().eq("id", id)
    if (error) throw error
  },
}
