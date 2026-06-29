/**
 * lib/supabase/repositories/clients.ts
 *
 * Supabase-backed client CRUD. Used when SUPABASE_CLIENTS=true.
 * Uses the admin (service-role) client — same security model as SQLite API routes.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { toClientRow, toSupabaseInsert, toSupabaseUpdate } from "@/lib/supabase/mappers/client"
import type { ClientRow, CreateClientData, UpdateClientData } from "@/lib/db/client-types"

function table() {
  return createAdminClient().from("clients")
}

export const supabaseClientRepo = {
  async findMany(opts: { search?: string; activeOnly?: boolean; skip?: number; take?: number } = {}): Promise<ClientRow[]> {
    let q = table().select("*").order("name", { ascending: true })
    if (opts.activeOnly) q = q.eq("active", true)
    if (opts.search) {
      const term = opts.search.trim()
      q = q.or(`name_lower.ilike.%${term}%,contact_name.ilike.%${term}%,email.ilike.%${term}%`)
    }
    if (opts.skip != null && opts.take != null) {
      q = q.range(opts.skip, opts.skip + opts.take - 1)
    } else if (opts.take != null) {
      q = q.limit(opts.take)
    }
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map(toClientRow)
  },

  async count(opts: { search?: string; activeOnly?: boolean } = {}): Promise<number> {
    let q = table().select("*", { count: "exact", head: true })
    if (opts.activeOnly) q = q.eq("active", true)
    if (opts.search) {
      const term = opts.search.trim()
      q = q.or(`name_lower.ilike.%${term}%,contact_name.ilike.%${term}%,email.ilike.%${term}%`)
    }
    const { count, error } = await q
    if (error) throw error
    return count ?? 0
  },

  async findUnique(id: string): Promise<ClientRow | null> {
    const { data, error } = await table().select("*").eq("id", id).maybeSingle()
    if (error) throw error
    return data ? toClientRow(data) : null
  },

  async findManyByIds(ids: string[]): Promise<ClientRow[]> {
    if (!ids.length) return []
    const { data, error } = await table().select("*").in("id", ids)
    if (error) throw error
    return (data ?? []).map(toClientRow)
  },

  async findByName(name: string): Promise<ClientRow | null> {
    const { data, error } = await table().select("*").eq("name_lower", name.trim().toLowerCase()).maybeSingle()
    if (error) throw error
    return data ? toClientRow(data) : null
  },

  async search(q: string, limit = 10): Promise<ClientRow[]> {
    const lower = q.trim().toLowerCase()
    if (!lower) return this.findMany({ activeOnly: true, take: limit })
    const { data, error } = await table()
      .select("*")
      .eq("active", true)
      .ilike("name_lower", `%${lower}%`)
      .order("name", { ascending: true })
      .limit(limit)
    if (error) throw error
    return (data ?? []).map(toClientRow)
  },

  async create(data: CreateClientData, now: string): Promise<ClientRow> {
    const row = toSupabaseInsert(data, now)
    const { data: inserted, error } = await table().insert(row).select("*").single()
    if (error) throw error
    return toClientRow(inserted)
  },

  async update(id: string, data: UpdateClientData, existing: ClientRow, now: string): Promise<ClientRow | null> {
    const patch = toSupabaseUpdate(data, existing, now)
    if (Object.keys(patch).length <= 1) return existing
    const { data: updated, error } = await table().update(patch).eq("id", id).select("*").maybeSingle()
    if (error) throw error
    return updated ? toClientRow(updated) : null
  },

  async delete(id: string): Promise<boolean> {
    const { error, count } = await table().delete({ count: "exact" }).eq("id", id)
    if (error) throw error
    return (count ?? 0) > 0
  },

  async findArchived(): Promise<ClientRow[]> {
    const { data, error } = await table()
      .select("*")
      .eq("active", false)
      .order("archived_at", { ascending: false, nullsFirst: false })
    if (error) throw error
    return (data ?? []).map(toClientRow)
  },
}
