import { createAdminClient } from "@/lib/supabase/admin"
import { escapePostgrestFilterValue, postgrestOrIlike } from "@/shared/supabase/postgrest-filter"
import type { ParentJobRow } from "../types/parent-job-types"
import { toParentJobRow, toSupabaseParentJob, type SupabaseParentJobRow } from "./parent-job-mapper"

const COLS = [
  "id", "drawing_number", "client_id", "client_company", "site_name", "site_address",
  "address", "type_of_works", "custom_type_description", "legacy_type_of_works",
  "description", "requested_by", "item_type", "archived_at", "archived_by",
  "latitude", "longitude", "geocoded_at", "geocoded_address", "location_status",
  "location_source", "legacy_job_id", "migrated_at", "created_at", "updated_at",
].join(",")

function table() {
  return createAdminClient().from("parent_jobs")
}

export const supabaseParentJobRepo = {
  async findUnique(id: string): Promise<ParentJobRow | null> {
    const { data, error } = await table().select(COLS).eq("id", id).maybeSingle()
    if (error) throw new Error(error.message)
    return data ? toParentJobRow(data as unknown as SupabaseParentJobRow) : null
  },

  async findByDrawingNumber(drawingNumber: string): Promise<ParentJobRow | null> {
    const { data, error } = await table()
      .select(COLS)
      .eq("drawing_number", drawingNumber)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? toParentJobRow(data as unknown as SupabaseParentJobRow) : null
  },

  async findMany(opts: {
    search?: string
    clientId?: string
    includeArchived?: boolean
    skip?: number
    take?: number
  } = {}): Promise<{ rows: ParentJobRow[]; total: number }> {
    let q = table().select(COLS, { count: "exact" })
    if (!opts.includeArchived) q = q.is("archived_at", null)
    if (opts.clientId) q = q.eq("client_id", opts.clientId)
    if (opts.search?.trim()) {
      const term = escapePostgrestFilterValue(opts.search.trim())
      const or = postgrestOrIlike(["drawing_number", "client_company", "site_name", "address", "description"], term)
      if (or) q = q.or(or)
    }
    q = q.order("updated_at", { ascending: false })
    if (opts.skip != null) q = q.range(opts.skip, opts.skip + (opts.take ?? 25) - 1)
    else if (opts.take != null) q = q.limit(opts.take)

    const { data, error, count } = await q
    if (error) throw new Error(error.message)
    return {
      rows: ((data ?? []) as unknown as SupabaseParentJobRow[]).map(toParentJobRow),
      total: count ?? 0,
    }
  },

  async upsert(row: ParentJobRow): Promise<ParentJobRow> {
    const payload = toSupabaseParentJob(row)
    const { data, error } = await table().upsert(payload, { onConflict: "id" }).select(COLS).single()
    if (error) throw new Error(error.message)
    return toParentJobRow(data as unknown as SupabaseParentJobRow)
  },

  async update(id: string, patch: Partial<ParentJobRow>): Promise<ParentJobRow | null> {
    const existing = await this.findUnique(id)
    if (!existing) return null
    const next = { ...existing, ...patch, updatedAt: new Date().toISOString() }
    return this.upsert(next)
  },
}
