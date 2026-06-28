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
  // Soft-delete filter: exclude archived by default.
  if (where.onlyArchived)        q = q.not("archived_at", "is", null)
  else if (!where.includeArchived) q = q.is("archived_at", null)

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
  if (where.overdueOrDueToday) {
    q = q.not("required_by_date", "is", null).lte("required_by_date", todayIsoDate()).neq("status", "ISSUED")
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
   * Returns a page of jobs AND the total count.
   *
   * Drawing-number sort (the default): uses a 2-pass approach to avoid
   * fetching all columns for every row in the dataset.
   *   Pass 1 — lightweight SELECT of 5 columns for all matching rows:
   *     builds the sort order, total count, and canAddRevision data.
   *   Pass 2 — full SELECT * for only the 25 (or fewer) page rows by ID.
   *
   * At 1,000 jobs this reduces data transfer by ~10× compared with a
   * single SELECT * across the whole table.
   *
   * For all other sort fields Supabase handles ordering natively, so a
   * single paginated query with range() is sufficient.
   */
  async findManyWithCount(opts: FindManyOptions = {}): Promise<{
    jobs: JobRow[]
    total: number
    allForRevisions?: { id: string; parentJobId: string | null }[]
  }> {
    const field = opts.orderBy?.field ?? "drawingNumber"
    const dir   = opts.orderBy?.dir   ?? "asc"

    if (isDrawingNumberListSort(field)) {
      // Pass 1: minimal columns — enough for sorting and revision flagging.
      const { data: sortData, count, error: sortErr } = await applyWhere(
        table().select("id,drawing_number,parent_job_id,revision_letter,created_at", { count: "exact" }),
        opts.where,
      )
      if (sortErr) throw sortErr

      type SortRow = { id: string; drawingNumber: string; parentJobId: string | null; revisionLetter: string | null; createdAt: string }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allSortRows: SortRow[] = (sortData ?? []).map((r: any) => ({
        id:             r.id             as string,
        drawingNumber:  r.drawing_number as string,
        parentJobId:    r.parent_job_id  as string | null,
        revisionLetter: r.revision_letter as string | null,
        createdAt:      r.created_at     as string,
      }))

      const sorted  = sortJobsForList<SortRow>(allSortRows, dir)
      const skip    = opts.skip ?? 0
      const page    = opts.take != null ? sorted.slice(skip, skip + opts.take) : sorted.slice(skip)
      const pageIds = page.map(r => r.id)

      if (!pageIds.length) {
        return { jobs: [], total: count ?? 0, allForRevisions: allSortRows }
      }

      // Pass 2: full data for the page rows only (≤ 25 rows).
      const { data: pageData, error: pageErr } = await table().select("*").in("id", pageIds)
      if (pageErr) throw pageErr

      // Preserve the sort order established in pass 1.
      const byId = new Map((pageData ?? []).map(r => [r.id as string, toJobRow(r)]))
      const jobs  = pageIds.map(id => byId.get(id)).filter((r): r is JobRow => r != null)

      return { jobs, total: count ?? allSortRows.length, allForRevisions: allSortRows }
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

  async archive(id: string, archivedBy: string, archivedAt: string): Promise<boolean> {
    const { error, count } = await table()
      .update({ archived_at: archivedAt, archived_by: archivedBy, updated_at: archivedAt }, { count: "exact" })
      .eq("id", id)
    if (error) throw error
    return (count ?? 0) > 0
  },

  async restore(id: string, restoredAt: string): Promise<boolean> {
    const { error, count } = await table()
      .update({ archived_at: null, archived_by: null, updated_at: restoredAt }, { count: "exact" })
      .eq("id", id)
    if (error) throw error
    return (count ?? 0) > 0
  },

  async findArchived(): Promise<JobRow[]> {
    const { data, error } = await table().select("*").not("archived_at", "is", null).order("archived_at", { ascending: false })
    if (error) throw error
    return (data ?? []).map(toJobRow)
  },

  async groupByStatus(): Promise<{ status: string; count: number }[]> {
    const { data, error } = await table().select("status").is("archived_at", null)
    if (error) throw error
    const counts = new Map<string, number>()
    for (const row of data ?? []) {
      counts.set(row.status, (counts.get(row.status) ?? 0) + 1)
    }
    return [...counts.entries()].map(([status, count]) => ({ status, count }))
  },

  async groupByItemType(): Promise<{ itemType: string; count: number }[]> {
    const { data, error } = await table().select("item_type").is("archived_at", null)
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

  /**
   * Single-query replacement for 8 separate Supabase calls on the stats
   * endpoint: groupByStatus, groupByItemType, countWhere(unassigned),
   * countWhere(onlyOriginals), countWhere(onlyRevisions), and all three
   * deadlineStats counts.
   *
   * Fetches 5 lightweight columns for every job row and aggregates everything
   * in JS — far cheaper than 8 independent round trips.
   */
  async dashboardCounts(): Promise<{
    byStatus:         { status: string; count: number }[]
    byItemType:       { itemType: string; count: number }[]
    unassigned:       number
    totalActiveJobs:  number
    totalRevisions:   number
    overdueCount:     number
    dueTodayCount:    number
    dueThisWeekCount: number
  }> {
    const { data, error } = await table().select("status,item_type,parent_job_id,designer,required_by_date")
    if (error) throw error

    const today   = todayIsoDate()
    const weekEnd = weekEndIsoDate()

    const statusMap   = new Map<string, number>()
    const typeMap     = new Map<string, number>()
    let unassigned = 0, totalActiveJobs = 0, totalRevisions = 0
    let overdueCount = 0, dueTodayCount = 0, dueThisWeekCount = 0

    for (const row of data ?? []) {
      statusMap.set(row.status, (statusMap.get(row.status) ?? 0) + 1)
      const t = row.item_type as string
      typeMap.set(t, (typeMap.get(t) ?? 0) + 1)

      if (row.parent_job_id) totalRevisions++; else totalActiveJobs++

      if (!row.designer) unassigned++

      if (row.required_by_date && row.status !== "ISSUED") {
        const d = row.required_by_date as string
        if (d < today) overdueCount++
        else if (d === today) dueTodayCount++
        else if (d > today && d <= weekEnd) dueThisWeekCount++
      }
    }

    return {
      byStatus:         [...statusMap.entries()].map(([status, count]) => ({ status, count })),
      byItemType:       [...typeMap.entries()].map(([itemType, count]) => ({ itemType, count })),
      unassigned,
      totalActiveJobs,
      totalRevisions,
      overdueCount,
      dueTodayCount,
      dueThisWeekCount,
    }
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
