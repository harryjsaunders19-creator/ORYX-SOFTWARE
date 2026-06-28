import { createAdminClient } from "@/lib/supabase/admin"
import type { UserRow } from "@/lib/db/user-types"
import { toSupabaseAppUserRow, toUserRow } from "@/lib/supabase/mappers/user"

function table() {
  return createAdminClient().from("app_users")
}

export const supabaseUserRepo = {
  async findMany(opts: { activeOnly?: boolean } = {}): Promise<UserRow[]> {
    let q = table().select("*").order("name")
    if (opts.activeOnly) q = q.eq("active", true)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map(toUserRow)
  },

  async findUnique(id: string): Promise<UserRow | null> {
    const { data, error } = await table().select("*").eq("id", id).maybeSingle()
    if (error) throw error
    return data ? toUserRow(data) : null
  },

  async findManyByIds(ids: string[]): Promise<UserRow[]> {
    if (!ids.length) return []
    const { data, error } = await table().select("*").in("id", ids)
    if (error) throw error
    return (data ?? []).map(toUserRow)
  },

  async findByEmail(email: string): Promise<UserRow | null> {
    const lower = email.trim().toLowerCase()
    if (!lower) return null
    const { data, error } = await table().select("*").eq("email_lower", lower).maybeSingle()
    if (error) throw error
    return data ? toUserRow(data) : null
  },

  async count(opts: { activeOnly?: boolean } = {}): Promise<number> {
    let q = table().select("*", { count: "exact", head: true })
    if (opts.activeOnly) q = q.eq("active", true)
    const { count, error } = await q
    if (error) throw error
    return count ?? 0
  },

  async activeAdminCount(): Promise<number> {
    const { count, error } = await table()
      .select("*", { count: "exact", head: true })
      .eq("role", "ADMIN")
      .eq("active", true)
    if (error) throw error
    return count ?? 0
  },

  async upsert(user: UserRow): Promise<void> {
    const { error } = await table().upsert(toSupabaseAppUserRow(user), { onConflict: "id" })
    if (error) throw error
  },

  async delete(id: string): Promise<boolean> {
    const { error, count } = await table().delete({ count: "exact" }).eq("id", id)
    if (error) throw error
    return (count ?? 0) > 0
  },
}
