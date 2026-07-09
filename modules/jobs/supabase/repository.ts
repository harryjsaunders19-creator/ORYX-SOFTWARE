/**
 * lib/supabase/repositories/jobs.ts
 *
 * Supabase-backed job reads and row mirrors. Used when SUPABASE_JOBS=true.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { aggAvg, aggSum } from "@/lib/supabase/aggregates"
import { VALID_ITEM_TYPES, VALID_STATUSES } from "@/lib/constants"
import type { JobRow } from "../types/job-types"
import type { FindManyOptions, WhereClause } from "@/lib/db/helpers"
import { isDrawingNumberListSort, sortJobsForList } from "../job-list-sort"
import {
  jobsArchivedFilterEnabled,
  noteJobsArchivedFromError,
  isMissingColumnError,
} from "@/lib/supabase/archived-filter"
import {
  sortColumn,
  todayIsoDate,
  toJobRow,
  toSupabaseRow,
  weekEndIsoDate,
  type SupabaseJobRow,
} from "./mapper"

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

/** Parse PostgREST / Postgres "column not found" errors so we can omit that field and retry. */
function missingColumnFromError(error: { code?: string; message?: string } | null): string | null {
  if (!error?.message) return null
  const quoted = error.message.match(/'([^']+)'\s+column/i)
  if (quoted?.[1]) return quoted[1]
  for (const col of [
    "site_name", "site_address", "location_status", "location_source",
    "latitude", "longitude", "geocoded_at", "geocoded_address",
    "variation_fees", "additional_charges",
  ]) {
    if (isMissingColumnError(error, col)) return col
  }
  return null
}

/**
 * Upsert a job row, omitting columns that are not yet in the remote schema
 * (e.g. migration 020 not applied on Supabase). Prevents job creation 500s.
 */
async function upsertJobRow(
  row: SupabaseJobRow,
  onConflict: "id" | "drawing_number",
): Promise<void> {
  const payload: Record<string, unknown> = { ...row }
  for (let attempt = 0; attempt < 16; attempt++) {
    const { error } = await table().upsert(payload, { onConflict })
    if (!error) return

    const missing = missingColumnFromError(error)
    if (missing && missing in payload) {
      delete payload[missing]
      continue
    }
    if (isMissingCommercialExtrasColumn(error)) {
      delete payload.variation_fees
      delete payload.additional_charges
      continue
    }
    throw error
  }
  throw new Error("Job upsert failed: too many missing-column retries")
}

/** Omit columns added in 005_job_commercial_extras.sql when Supabase hasn't migrated yet. */
function applyWhere(q: JobQuery, where: WhereClause = {}): JobQuery {
  // Soft-delete filter: exclude archived by default (requires 011_soft_delete.sql).
  if (jobsArchivedFilterEnabled()) {
    if (where.onlyArchived)        q = q.not("archived_at", "is", null)
    else if (!where.includeArchived) q = q.is("archived_at", null)
  }

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
    const run = () =>
      applyWhere(table().select("*", { count: "exact", head: true }), where)
    let { count, error } = await run()
    if (error && noteJobsArchivedFromError(error)) {
      ;({ count, error } = await run())
    }
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
    await upsertJobRow(toSupabaseRow(job), "id")
  },

  async upsertMany(jobs: JobRow[]): Promise<void> {
    if (!jobs.length) return
    for (const job of jobs) {
      await upsertJobRow(toSupabaseRow(job), "id")
    }
  },

  /** Excel import — upsert by drawing_number so a retry after partial import still succeeds. */
  async upsertManyForImport(jobs: JobRow[]): Promise<void> {
    if (!jobs.length) return
    for (const job of jobs) {
      await upsertJobRow(toSupabaseRow(job), "drawing_number")
    }
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
    const { data, error } = await table()
      .select("*")
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false })
    if (error) {
      if (noteJobsArchivedFromError(error)) {
        console.error("[supabaseJobRepo.findArchived] archived_at column missing — run 011_soft_delete.sql")
        return []
      }
      throw error
    }
    return (data ?? []).map(toJobRow)
  },

  async groupByStatus(): Promise<{ status: string; count: number }[]> {
    const rows = await Promise.all(
      VALID_STATUSES.map(async status => ({
        status,
        count: await this.count({ status }),
      })),
    )
    return rows.filter(r => r.count > 0)
  },

  async groupByItemType(): Promise<{ itemType: string; count: number }[]> {
    const rows = await Promise.all(
      VALID_ITEM_TYPES.map(async itemType => ({
        itemType,
        count: await this.count({ itemType }),
      })),
    )
    return rows.filter(r => r.count > 0)
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
   * Dashboard aggregates via parallel head-only count queries — O(1) row
   * transfer per metric instead of scanning the full jobs table in Node.
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
    const [
      byStatus,
      byItemType,
      unassigned,
      totalActiveJobs,
      totalRevisions,
      overdueCount,
      dueTodayCount,
      dueThisWeekCount,
    ] = await Promise.all([
      this.groupByStatus(),
      this.groupByItemType(),
      this.count({ unassigned: true }),
      this.count({ onlyOriginals: true }),
      this.count({ onlyRevisions: true }),
      this.count({ overdue: true }),
      this.count({ dueToday: true }),
      this.count({ dueThisWeek: true }),
    ])

    return {
      byStatus,
      byItemType,
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
      table().select("quote_value.sum()"),
      where,
    ).gt("quote_value", 0).maybeSingle()
    if (error) throw error
    return aggSum(data)
  },

  /**
   * Returns totalQuotedValue, totalIssuedValue and avgJobValue via SQL
   * aggregates — no full-table row transfer.
   */
  async jobValueStats(): Promise<{ totalQuotedValue: number; totalIssuedValue: number; avgJobValue: number }> {
    const base = () => table().select("quote_value.sum()").gt("quote_value", 0)
    const withArchived = (q: ReturnType<typeof base>) =>
      jobsArchivedFilterEnabled() ? q.is("archived_at", null) : q

    let [quoted, issued, avgRow] = await Promise.all([
      withArchived(base()).maybeSingle(),
      withArchived(base()).eq("status", "ISSUED").maybeSingle(),
      jobsArchivedFilterEnabled()
        ? table().select("quote_value.avg()").is("archived_at", null).gt("quote_value", 0).maybeSingle()
        : table().select("quote_value.avg()").gt("quote_value", 0).maybeSingle(),
    ])

    const err = quoted.error ?? issued.error ?? avgRow.error
    if (err && noteJobsArchivedFromError(err)) {
      ;[quoted, issued, avgRow] = await Promise.all([
        base().maybeSingle(),
        base().eq("status", "ISSUED").maybeSingle(),
        table().select("quote_value.avg()").gt("quote_value", 0).maybeSingle(),
      ])
    }

    if (quoted.error) throw quoted.error
    if (issued.error) throw issued.error
    if (avgRow.error) throw avgRow.error
    return {
      totalQuotedValue: aggSum(quoted.data),
      totalIssuedValue: aggSum(issued.data),
      avgJobValue:      aggAvg(avgRow.data),
    }
  },

  async totalQuotedValue(): Promise<number> {
    return this.sumQuoteValue()
  },

  async totalIssuedValue(): Promise<number> {
    return this.sumQuoteValue({ status: "ISSUED" })
  },

  /** Highest global ORYX drawing sequence suffix across all jobs. */
  async maxGlobalDrawingSequence(): Promise<number> {
    const { data, error } = await table().select("drawing_number").like("drawing_number", "%/ORYX/%")
    if (error) return 0
    let max = 0
    for (const row of (data ?? [])) {
      const match = (row.drawing_number as string).match(/^(\d{2})\/ORYX\/(\d{2})\/(\d+)/)
      if (!match) continue
      const seq = parseInt(match[3], 10)
      if (seq > max) max = seq
    }
    return max
  },

  /**
   * @deprecated Use maxGlobalDrawingSequence() — sequence is no longer per month.
   */
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
