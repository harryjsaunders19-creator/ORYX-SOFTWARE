/**
 * lib/supabase/repositories/jobs.ts
 *
 * Supabase-backed job reads and row mirrors. Used when SUPABASE_JOBS=true.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import type { JobRow } from "@/lib/db/job-types"
import type { FindManyOptions, WhereClause } from "@/lib/db/helpers"
import { isDrawingNumberListSort, sortJobsForList } from "@/lib/job-list-sort"
import {
  sortColumn,
  todayIsoDate,
  toJobRow,
  toSupabaseRow,
  weekEndIsoDate,
  type SupabaseJobRow,
} from "@/lib/supabase/mappers/job"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JobQuery = any

function table() {
  return createAdminClient().from("jobs")
}

function isMissingCommercialExtrasColumn(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "PGRST204"
    && !!error.message
    && /variation_fees|additional_charges/.test(error.message)
}

/** Omit columns added in 005_job_commercial_extras.sql when Supabase hasn't migrated yet. */
function withoutCommercialExtras(row: SupabaseJobRow): Omit<SupabaseJobRow, "variation_fees" | "additional_charges"> {
  const { variation_fees: _v, additional_charges: _a, ...rest } = row
  return rest
}

function applyWhere(q: JobQuery, where: WhereClause = {}): JobQuery {
  if (where.search) {
    const term = where.search.trim()
    q = q.or(
      [
        `drawing_number.ilike.%${term}%`,
        `address.ilike.%${term}%`,
        `client_company.ilike.%${term}%`,
        `requested_by.ilike.%${term}%`,
        `type_of_works.ilike.%${term}%`,
        `custom_type_description.ilike.%${term}%`,
        `designer.ilike.%${term}%`,
      ].join(","),
    )
  }
  if (where.typeOfWorks) q = q.eq("type_of_works", where.typeOfWorks)
  if (where.itemType) q = q.eq("item_type", where.itemType)
  if (where.clientId) q = q.eq("client_id", where.clientId)
  if (where.status) q = q.eq("status", where.status)
  if (where.unassigned) q = q.or("designer.eq.,designer.is.null")
  if (where.invoiced) q = q.not("invoice_id", "is", null)
  if (where.notInvoiced) q = q.is("invoice_id", null)
  if (where.billingExported) q = q.eq("billing_status", "EXPORTED_TO_ACCOUNTS")
  if (where.billingPending) {
    q = q.eq("status", "ISSUED").is("invoice_id", null).or("billing_status.is.null,billing_status.neq.EXPORTED_TO_ACCOUNTS")
  }
  if (where.parentJobId) q = q.eq("parent_job_id", where.parentJobId)
  if (where.onlyOriginals) q = q.is("parent_job_id", null)
  if (where.onlyRevisions) q = q.not("parent_job_id", "is", null)
  if (where.hasDeadline) q = q.not("required_by_date", "is", null)
  if (where.overdue) {
    q = q.not("required_by_date", "is", null).lt("required_by_date", todayIsoDate()).neq("status", "ISSUED")
  }
  if (where.dueToday) {
    q = q.not("required_by_date", "is", null).eq("required_by_date", todayIsoDate())
  }
  if (where.dueThisWeek) {
    q = q
      .not("required_by_date", "is", null)
      .gte("required_by_date", todayIsoDate())
      .lte("required_by_date", weekEndIsoDate())
  }
  if (where.hasQuote) q = q.not("quote_value", "is", null).gt("quote_value", 0)
  return q
}

export const supabaseJobRepo = {
  /**
   * Returns a page of jobs AND the total count in a single Supabase request
   * (using `count: "exact"`). For the default drawing-number sort it also
   * returns `allForRevisions` — the full unsorted set — so callers can
   * compute canAddRevision in-memory without a second round trip.
   */
  async findManyWithCount(opts: FindManyOptions = {}): Promise<{
    jobs: JobRow[]
    total: number
    allForRevisions?: JobRow[]
  }> {
    const field = opts.orderBy?.field ?? "drawingNumber"
    const dir   = opts.orderBy?.dir   ?? "asc"

    if (isDrawingNumberListSort(field)) {
      // Must fetch all rows for correct drawing-number sort (revision grouping).
      // The single `count: "exact"` call avoids a separate COUNT round trip.
      const { data, count, error } = await applyWhere(
        table().select("*", { count: "exact" }),
        opts.where,
      )
      if (error) throw error
      const allRows: JobRow[] = (data ?? []).map(toJobRow)
      const sorted = sortJobsForList<JobRow>(allRows, dir)
      const skip = opts.skip ?? 0
      const jobs = opts.take != null ? sorted.slice(skip, skip + opts.take) : sorted.slice(skip)
      return { jobs, total: count ?? allRows.length, allForRevisions: allRows }
    }

    const col = sortColumn(field)
    const asc = dir === "asc"
    let q = applyWhere(table().select("*", { count: "exact" }), opts.where).order(col, { ascending: asc })
    if (opts.skip != null && opts.take != null) {
      q = q.range(opts.skip, opts.skip + opts.take - 1)
    } else if (opts.take != null) {
      q = q.limit(opts.take)
    }
    const { data, count, error } = await q
    if (error) throw error
    return { jobs: (data ?? []).map(toJobRow), total: count ?? 0 }
  },

  async findMany(opts: FindManyOptions = {}): Promise<JobRow[]> {
    const { jobs } = await this.findManyWithCount(opts)
    return jobs
  },

  async count(where: WhereClause = {}): Promise<number> {
    const { count, error } = await applyWhere(
      table().select("*", { count: "exact", head: true }),
      where,
    )
    if (error) throw error
    return count ?? 0
  },

  async findUnique(id: string): Promise<JobRow | null> {
    const { data, error } = await table().select("*").eq("id", id).maybeSingle()
    if (error) throw error
    return data ? toJobRow(data) : null
  },

  async findManyByIds(ids: string[]): Promise<JobRow[]> {
    if (!ids.length) return []
    const { data, error } = await table().select("*").in("id", ids)
    if (error) throw error
    return (data ?? []).map(toJobRow)
  },

  async revisionsForJob(parentId: string): Promise<JobRow[]> {
    const { data, error } = await table()
      .select("*")
      .eq("parent_job_id", parentId)
      .order("revision_letter", { ascending: true })
    if (error) throw error
    return (data ?? []).map(toJobRow)
  },

  async findLatestRevisionsForParents(parentIds: string[]): Promise<JobRow[]> {
    if (!parentIds.length) return []
    const { data, error } = await table()
      .select("*")
      .in("parent_job_id", parentIds)
    if (error) throw error
    const latestByParent = new Map<string, JobRow>()
    for (const row of data ?? []) {
      const job = toJobRow(row)
      if (!job.parentJobId || !job.revisionLetter) continue
      const prev = latestByParent.get(job.parentJobId)
      if (!prev || (prev.revisionLetter ?? "") < job.revisionLetter) {
        latestByParent.set(job.parentJobId, job)
      }
    }
    return [...latestByParent.values()]
  },

  async upsert(job: JobRow): Promise<void> {
    const row = toSupabaseRow(job)
    let { error } = await table().upsert(row, { onConflict: "id" })
    if (isMissingCommercialExtrasColumn(error)) {
      ;({ error } = await table().upsert(withoutCommercialExtras(row), { onConflict: "id" }))
    }
    if (error) throw error
  },

  async delete(id: string): Promise<boolean> {
    const { error, count } = await table().delete({ count: "exact" }).eq("id", id)
    if (error) throw error
    return (count ?? 0) > 0
  },

  async groupByStatus(): Promise<{ status: string; count: number }[]> {
    const { data, error } = await table().select("status")
    if (error) throw error
    const counts = new Map<string, number>()
    for (const row of data ?? []) {
      counts.set(row.status, (counts.get(row.status) ?? 0) + 1)
    }
    return [...counts.entries()].map(([status, count]) => ({ status, count }))
  },

  async groupByItemType(): Promise<{ itemType: string; count: number }[]> {
    const { data, error } = await table().select("item_type")
    if (error) throw error
    const counts = new Map<string, number>()
    for (const row of data ?? []) {
      const key = row.item_type as string
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()].map(([itemType, count]) => ({ itemType, count }))
  },

  async deadlineStats(): Promise<{ overdueCount: number; dueTodayCount: number; dueThisWeekCount: number }> {
    const [overdueCount, dueTodayCount, dueThisWeekCount] = await Promise.all([
      this.count({ overdue: true }),
      this.count({ dueToday: true }),
      this.count({ dueThisWeek: true }),
    ])
    return { overdueCount, dueTodayCount, dueThisWeekCount }
  },

  async findRecent(take: number) {
    const { data, error } = await table()
      .select(
        "id,drawing_number,item_type,address,status,client_company,designer,quote_value,invoice_id,parent_job_id,revision_letter,created_at",
      )
      .order("date_created", { ascending: false })
      .limit(take)
    if (error) throw error
    return (data ?? []).map((row) => ({
      id: row.id as string,
      drawingNumber: row.drawing_number as string,
      itemType: row.item_type as string,
      address: row.address as string,
      status: row.status as string,
      clientCompany: row.client_company as string,
      designer: (row.designer as string | null) ?? "",
      quoteValue: row.quote_value != null ? Number(row.quote_value) : null,
      invoiceId: row.invoice_id as string | null,
      parentJobId: row.parent_job_id as string | null,
      revisionLetter: row.revision_letter as string | null,
      createdAt: row.created_at as string,
    }))
  },

  async sumQuoteValue(where: WhereClause = {}): Promise<number> {
    const { data, error } = await applyWhere(
      table().select("quote_value").gt("quote_value", 0),
      where,
    )
    if (error) throw error
    return (data ?? []).reduce((sum: number, row: { quote_value: number | null }) => sum + Number(row.quote_value ?? 0), 0)
  },

  /**
   * Returns totalQuotedValue, totalIssuedValue and avgJobValue in a single
   * Supabase round trip. Replaces three separate sumQuoteValue/avgJobValue
   * calls that each fetched the same rows independently.
   */
  async jobValueStats(): Promise<{ totalQuotedValue: number; totalIssuedValue: number; avgJobValue: number }> {
    const { data, error } = await table()
      .select("quote_value,status")
      .gt("quote_value", 0)
    if (error) throw error
    const rows = data ?? []
    let total = 0, issued = 0, count = 0
    for (const row of rows) {
      const v = Number(row.quote_value ?? 0)
      total += v
      count++
      if (row.status === "ISSUED") issued += v
    }
    return {
      totalQuotedValue: total,
      totalIssuedValue: issued,
      avgJobValue:      count > 0 ? total / count : 0,
    }
  },

  async totalQuotedValue(): Promise<number> {
    return this.sumQuoteValue()
  },

  async totalIssuedValue(): Promise<number> {
    return this.sumQuoteValue({ status: "ISSUED" })
  },

  /** Returns the highest drawing sequence per year-month key (e.g. "2606" → 14). */
  async maxDrawingSequences(): Promise<{ yearMonth: string; maxSeq: number }[]> {
    const { data, error } = await table().select("drawing_number").like("drawing_number", "%/ORYX/%")
    if (error) return []
    const maxByKey = new Map<string, number>()
    for (const row of (data ?? [])) {
      const match = (row.drawing_number as string).match(/^(\d{2})\/ORYX\/(\d{2})\/(\d+)/)
      if (!match) continue
      const [, yy, mm, nnn] = match
      const key = `${yy}${mm}`
      const seq = parseInt(nnn, 10)
      const prev = maxByKey.get(key) ?? 0
      if (seq > prev) maxByKey.set(key, seq)
    }
    return Array.from(maxByKey.entries()).map(([yearMonth, maxSeq]) => ({ yearMonth, maxSeq }))
  },

  /** Returns the highest ref sequence per prefix+year (e.g. SV/2026 → 5). */
  async maxRefSequences(): Promise<{ prefix: string; year: number; maxSeq: number }[]> {
    const { data, error } = await table().select("drawing_number").not("drawing_number", "like", "%/ORYX/%")
    if (error) return []
    const maxByKey = new Map<string, number>()
    for (const row of (data ?? [])) {
      const match = (row.drawing_number as string | null)?.match(/^([A-Z]+)-(\d{4})-(\d+)$/)
      if (!match) continue
      const [, prefix, yearStr, nnn] = match
      const mapKey = `${prefix}||${yearStr}`
      const seq = parseInt(nnn, 10)
      const prev = maxByKey.get(mapKey) ?? 0
      if (seq > prev) maxByKey.set(mapKey, seq)
    }
    return Array.from(maxByKey.entries()).map(([mapKey, maxSeq]) => {
      const [prefix, yearStr] = mapKey.split("||")
      return { prefix, year: parseInt(yearStr, 10), maxSeq }
    })
  },
}
