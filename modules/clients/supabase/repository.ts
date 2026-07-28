/**
 * lib/supabase/repositories/clients.ts
 *
 * Supabase-backed client CRUD. Used when SUPABASE_CLIENTS=true.
 * Uses the admin (service-role) client — same security model as SQLite API routes.
 */
import { createAdminClient } from "@/shared/supabase/admin"
import { isMissingColumnError } from "@/shared/supabase/archived-filter"
import { postgrestOrIlike, escapePostgrestFilterValue } from "@/shared/supabase/postgrest-filter"
import { toClientRow, toSupabaseInsert, toSupabaseRow, toSupabaseUpdate, type SupabaseClientRow } from "./mapper"
import type { ClientRow, CreateClientData, UpdateClientData } from "../types/client-types"

function table() {
  return createAdminClient().from("clients")
}

/** Perf: list payloads don't need every column — same ClientRow via toClientRow. */
const CLIENT_LIST_SELECT = [
  "id", "name", "name_lower", "contact_name", "email", "phone",
  "billing_address", "notes", "account_code", "active",
  "archived_at", "archived_by", "created_at", "updated_at",
].join(",")

export const supabaseClientRepo = {
  async findMany(opts: { search?: string; activeOnly?: boolean; skip?: number; take?: number } = {}): Promise<ClientRow[]> {
    let q = table().select(CLIENT_LIST_SELECT).order("name", { ascending: true })
    if (opts.activeOnly) q = q.eq("active", true)
    if (opts.search) {
      const orFilter = postgrestOrIlike(
        ["name_lower", "contact_name", "email", "phone", "account_code"],
        opts.search,
      )
      if (orFilter) q = q.or(orFilter)
    }
    if (opts.skip != null && opts.take != null) {
      q = q.range(opts.skip, opts.skip + opts.take - 1)
    } else if (opts.take != null) {
      q = q.limit(opts.take)
    }
    const { data, error } = await q
    if (error) throw error
    return ((data ?? []) as unknown as SupabaseClientRow[]).map(toClientRow)
  },

  async count(opts: { search?: string; activeOnly?: boolean } = {}): Promise<number> {
    let q = table().select("*", { count: "exact", head: true })
    if (opts.activeOnly) q = q.eq("active", true)
    if (opts.search) {
      const orFilter = postgrestOrIlike(
        ["name_lower", "contact_name", "email", "phone", "account_code"],
        opts.search,
      )
      if (orFilter) q = q.or(orFilter)
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
    const safe = escapePostgrestFilterValue(lower)
    if (!safe) return this.findMany({ activeOnly: true, take: limit })
    const { data, error } = await table()
      .select("*")
      .eq("active", true)
      .ilike("name_lower", `%${safe}%`)
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

  /** Bulk import — upsert by name_lower so retries merge instead of failing. */
  async upsertMany(clients: ClientRow[]): Promise<void> {
    if (!clients.length) return
    const rows = clients.map(toSupabaseRow)
    let { error } = await table().upsert(rows, { onConflict: "name_lower" })
    if (error && isMissingColumnError(error, "archived_at")) {
      const slim = rows.map(({ archived_at: _a, archived_by: _b, ...rest }) => rest)
      ;({ error } = await table().upsert(slim, { onConflict: "name_lower" }))
    }
    if (error) throw error
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

  async archive(id: string, archivedBy: string, archivedAt: string): Promise<ClientRow | null> {
    let { data, error } = await table()
      .update({
        active: false,
        archived_at: archivedAt,
        archived_by: archivedBy,
        updated_at: archivedAt,
      })
      .eq("id", id)
      .select("*")
      .maybeSingle()
    if (error && (isMissingColumnError(error, "archived_at") || isMissingColumnError(error, "archived_by"))) {
      ;({ data, error } = await table()
        .update({ active: false, updated_at: archivedAt })
        .eq("id", id)
        .select("*")
        .maybeSingle())
    }
    if (error) throw error
    return data ? toClientRow(data) : null
  },

  async restore(id: string, restoredAt: string): Promise<ClientRow | null> {
    let { data, error } = await table()
      .update({
        active: true,
        archived_at: null,
        archived_by: null,
        updated_at: restoredAt,
      })
      .eq("id", id)
      .select("*")
      .maybeSingle()
    if (error && isMissingColumnError(error, "archived_at")) {
      ;({ data, error } = await table()
        .update({ active: true, updated_at: restoredAt })
        .eq("id", id)
        .select("*")
        .maybeSingle())
    }
    if (error) throw error
    return data ? toClientRow(data) : null
  },

  async findArchived(): Promise<ClientRow[]> {
    const run = () =>
      table()
        .select("*")
        .or("active.eq.false,archived_at.not.is.null")
        .order("archived_at", { ascending: false, nullsFirst: false })

    let { data, error } = await run()
    if (error && isMissingColumnError(error, "archived_at")) {
      ;({ data, error } = await table()
        .select("*")
        .eq("active", false)
        .order("updated_at", { ascending: false }))
    }
    if (error) throw error
    return (data ?? []).map(toClientRow)
  },

  async countArchived(): Promise<number> {
    const run = () =>
      table()
        .select("*", { count: "exact", head: true })
        .or("active.eq.false,archived_at.not.is.null")
    let { count, error } = await run()
    if (error && isMissingColumnError(error, "archived_at")) {
      ;({ count, error } = await table()
        .select("*", { count: "exact", head: true })
        .eq("active", false))
    }
    if (error) throw error
    return count ?? 0
  },
}
