import { createAdminClient } from "@/lib/supabase/admin"
import type { PasswordVaultEntryRow } from "@/lib/db/vault-types"
import type { VaultSortOrder } from "@/lib/db/stores/vault"
import {
  toPasswordVaultEntryRow,
  toSupabasePasswordVaultEntryRow,
} from "./mapper"

function table() {
  return createAdminClient().from("password_vault_entries")
}

export const supabasePasswordVaultRepo = {
  async findMany(opts: {
    search?: string
    sort?: VaultSortOrder
  } = {}): Promise<PasswordVaultEntryRow[]> {
    let q = table().select("*")
    if (opts.search?.trim()) {
      const term = opts.search.trim().toLowerCase()
      q = q.or(
        `service_name_lower.ilike.%${term}%,category_lower.ilike.%${term}%,username_lower.ilike.%${term}%`,
      )
    }
    q = q.order("service_name_lower", { ascending: opts.sort !== "desc" })
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map(toPasswordVaultEntryRow)
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
