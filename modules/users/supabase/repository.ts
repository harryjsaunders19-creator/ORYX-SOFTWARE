import { createAdminClient } from "@/shared/supabase/admin"
import type { UserRow } from "../types/user-types"
import { toSupabaseAppUserRow, toUserRow } from "./mapper"

function table() {
  return createAdminClient().from("app_users")
}

function isMissingModuleAccessColumn(error: unknown): boolean {
  const msg = JSON.stringify(error ?? {}).toLowerCase()
  return msg.includes("module_access_json") && (
    msg.includes("does not exist")
    || msg.includes("could not find")
    || msg.includes("schema cache")
    || msg.includes("pgrst204")
  )
}

export const supabaseUserRepo = {
  async findMany(opts: { activeOnly?: boolean } = {}): Promise<UserRow[]> {
    let q = table().select("*").order("name")
    if (opts.activeOnly) q = q.eq("active", true)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map(toUserRow)
  },

  /** Job-list / form designer picker — names only (no password hashes). */
  async findActiveNames(): Promise<string[]> {
    const { data, error } = await table()
      .select("name")
      .eq("active", true)
      .order("name")
    if (error) throw error
    return (data ?? [])
      .map(r => String(r.name ?? "").trim().replace(/\s+/g, " "))
      .filter(Boolean)
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
    const row = toSupabaseAppUserRow(user)
    const { error } = await table().upsert(row, { onConflict: "id" })
    if (!error) return

    // Production may lag code if migration 038 has not been applied yet.
    if (isMissingModuleAccessColumn(error)) {
      const { module_access_json: _omit, ...legacy } = row
      const retry = await table().upsert(legacy, { onConflict: "id" })
      if (retry.error) throw retry.error
      return
    }

    throw error
  },

  async delete(id: string): Promise<boolean> {
    const { error, count } = await table().delete({ count: "exact" }).eq("id", id)
    if (error) throw error
    return (count ?? 0) > 0
  },
}
