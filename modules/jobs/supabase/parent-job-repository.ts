import { createAdminClient } from "@/shared/supabase/admin"
import { postgrestOrIlike, postgrestTagsOverlap } from "@/shared/supabase/postgrest-filter"
import { matchingJobTags } from "@/lib/constants"
import type { ParentJobRow } from "../types/parent-job-types"
import { toParentJobRow, toSupabaseParentJob, type SupabaseParentJobRow } from "./parent-job-mapper"

const COLS = [
  "id", "drawing_number", "client_id", "client_company", "site_id", "site_name", "site_address",
  "location_mode", "location_name", "postcode",
  "address", "type_of_works", "custom_type_description", "legacy_type_of_works",
  "description", "tags", "requested_by", "item_type", "archived_at", "archived_by",
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
      const textOr = postgrestOrIlike(
        ["drawing_number", "client_company", "site_name", "address", "description"],
        opts.search,
      )
      const tagsOr = postgrestTagsOverlap("tags", matchingJobTags(opts.search))
      const or = [textOr, tagsOr].filter(Boolean).join(",")
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

  /** Compensating delete after a failed quote convert (work items first — FK restrict). */
  async deleteCascade(id: string): Promise<void> {
    const admin = createAdminClient()
    const { error: wiErr } = await admin.from("work_items").delete().eq("parent_job_id", id)
    if (wiErr) throw new Error(wiErr.message)
    const { error } = await table().delete().eq("id", id)
    if (error) throw new Error(error.message)
  },

  async update(id: string, patch: Partial<ParentJobRow>): Promise<ParentJobRow | null> {
    const existing = await this.findUnique(id)
    if (!existing) return null
    const next = { ...existing, ...patch, updatedAt: new Date().toISOString() }
    return this.upsert(next)
  },
}
