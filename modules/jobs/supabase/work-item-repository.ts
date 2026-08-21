import { createAdminClient } from "@/shared/supabase/admin"
import { escapePostgrestFilterValue, postgrestOrIlike } from "@/shared/supabase/postgrest-filter"
import type { DesignWorkItemRow } from "../types/design-work-item-types"
import { toWorkItemRow, toSupabaseWorkItem, type SupabaseWorkItemRow } from "./work-item-mapper"

const COLS = [
  "id", "parent_job_id", "work_type", "revision_letter", "title", "description",
  "status", "designer", "priority", "billable", "requested_date", "required_by_date",
  "notes", "commercial_notes", "quote_value", "quote_reference", "quote_date",
  "variation_fees", "additional_charges", "invoice_status", "invoice_number",
  "invoice_date", "billed_value", "date_created", "completed_at", "legacy_job_id",
  "migrated_at", "created_at", "updated_at",
].join(",")

/** Terminal workflow status — completed work leaves the engineer active list. */
export const WORK_ITEM_ACTIVE_STATUSES = [
  "NEW_REQUEST",
  "IN_DESIGN",
  "CHECKING",
  "READY_TO_SEND",
] as const

function table() {
  return createAdminClient().from("work_items")
}

export const supabaseWorkItemRepo = {
  async findUnique(id: string): Promise<DesignWorkItemRow | null> {
    const { data, error } = await table().select(COLS).eq("id", id).maybeSingle()
    if (error) throw new Error(error.message)
    return data ? toWorkItemRow(data as unknown as SupabaseWorkItemRow) : null
  },

  async findByParent(parentJobId: string): Promise<DesignWorkItemRow[]> {
    const { data, error } = await table()
      .select(COLS)
      .eq("parent_job_id", parentJobId)
      .order("date_created", { ascending: true })
    if (error) throw new Error(error.message)
    return ((data as unknown as SupabaseWorkItemRow[] | null) ?? []).map(toWorkItemRow)
  },

  /** Bulk siblings for many parents — one query instead of N findByParent calls. */
  async findByParents(parentJobIds: string[]): Promise<Map<string, DesignWorkItemRow[]>> {
    const map = new Map<string, DesignWorkItemRow[]>()
    if (!parentJobIds.length) return map
    for (const id of parentJobIds) map.set(id, [])
    const { data, error } = await table()
      .select(COLS)
      .in("parent_job_id", parentJobIds)
      .order("date_created", { ascending: true })
    if (error) throw new Error(error.message)
    for (const row of ((data as unknown as SupabaseWorkItemRow[] | null) ?? [])) {
      const item = toWorkItemRow(row)
      const list = map.get(item.parentJobId) ?? []
      list.push(item)
      map.set(item.parentJobId, list)
    }
    return map
  },

  async findActive(opts: {
    search?: string
    status?: string
    /** When set (and status is unset), filter to these statuses instead of WORK_ITEM_ACTIVE_STATUSES. */
    statuses?: string[]
    /** When set, restrict to ORIGINAL or REVISION work items. */
    workType?: "ORIGINAL" | "REVISION"
    designer?: string
    unassigned?: boolean
    parentIds?: string[]
    skip?: number
    take?: number
  } = {}): Promise<{ rows: DesignWorkItemRow[]; total: number }> {
    let q = table().select(COLS, { count: "exact" })
    if (opts.status) {
      q = q.eq("status", opts.status)
    } else if (opts.statuses?.length) {
      q = q.in("status", opts.statuses)
    } else {
      q = q.in("status", [...WORK_ITEM_ACTIVE_STATUSES])
    }
    if (opts.workType) q = q.eq("work_type", opts.workType)
    if (opts.designer) q = q.eq("designer", opts.designer)
    if (opts.unassigned) q = q.eq("designer", "")
    if (opts.parentIds?.length) q = q.in("parent_job_id", opts.parentIds)
    if (opts.search?.trim() && !opts.parentIds?.length) {
      const term = escapePostgrestFilterValue(opts.search.trim())
      const or = postgrestOrIlike(["title", "description", "notes", "designer"], term)
      if (or) q = q.or(or)
    }
    q = q.order("updated_at", { ascending: false })
    const take = opts.take ?? 25
    const skip = opts.skip ?? 0
    q = q.range(skip, skip + take - 1)

    const { data, error, count } = await q
    if (error) throw new Error(error.message)
    return {
      rows: ((data ?? []) as unknown as SupabaseWorkItemRow[]).map(toWorkItemRow),
      total: count ?? 0,
    }
  },

  async findManyByIds(ids: string[]): Promise<DesignWorkItemRow[]> {
    if (!ids.length) return []
    const { data, error } = await table().select(COLS).in("id", ids)
    if (error) throw new Error(error.message)
    return ((data as unknown as SupabaseWorkItemRow[] | null) ?? []).map(toWorkItemRow)
  },

  async upsert(row: DesignWorkItemRow): Promise<DesignWorkItemRow> {
    const payload = toSupabaseWorkItem(row)
    const { data, error } = await table().upsert(payload, { onConflict: "id" }).select(COLS).single()
    if (error) throw new Error(error.message)
    return toWorkItemRow(data as unknown as SupabaseWorkItemRow)
  },

  async update(id: string, patch: Partial<DesignWorkItemRow>): Promise<DesignWorkItemRow | null> {
    const existing = await this.findUnique(id)
    if (!existing) return null
    const next: DesignWorkItemRow = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    return this.upsert(next)
  },

  async revisionLettersForParent(parentJobId: string): Promise<string[]> {
    const { data, error } = await table()
      .select("revision_letter")
      .eq("parent_job_id", parentJobId)
      .eq("work_type", "REVISION")
      .not("revision_letter", "is", null)
    if (error) throw new Error(error.message)
    return (data ?? [])
      .map(r => r.revision_letter as string)
      .filter(Boolean)
  },
}
