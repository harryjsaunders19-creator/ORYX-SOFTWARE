/**
 * lib/supabase/repositories/jobs.ts
 *
 * Supabase-backed job reads and row mirrors. Used when SUPABASE_JOBS=true.
 */
import { createAdminClient } from "@/shared/supabase/admin"
import { aggAvg, aggSum } from "@/shared/supabase/aggregates"
import { VALID_ITEM_TYPES, VALID_STATUSES, matchingJobTags } from "@/lib/constants"
import type { JobRow } from "../types/job-types"
import type { FindManyOptions, WhereClause } from "@/lib/db/helpers"
import { isDrawingNumberListSort, sortJobsForList } from "../job-list-sort"
import {
  jobsArchivedFilterEnabled,
  noteJobsArchivedFromError,
  isMissingColumnError,
} from "@/shared/supabase/archived-filter"
import { postgrestOrIlike, postgrestTagsOverlap } from "@/shared/supabase/postgrest-filter"
import { logEvent } from "@/shared/logger"
import { collectRevisionParentIds } from "@/lib/revision-chain"
import {
  sortColumn,
  todayIsoDate,
  toJobRow,
  toSupabaseRow,
  weekEndIsoDate,
  type SupabaseJobRow,
} from "./mapper"
import {
  countActiveOriginalJobs,
  countActiveRevisions,
  displayDeadlineByOriginal,
  overdueOriginalIds,
  tallyDeadlineStats,
} from "../services/deadline-tallies"

/** Above this count, drawing-number list sort loads all matching IDs into memory. */
const DRAWING_SORT_WARN_ROWS = 8_000
/** PostgREST `.in()` chunk size for revision sidecar parent lookups. */
const REVISION_PARENT_IN_CHUNK = 100
import { parseOryxDrawingSequence } from "@/lib/drawing-number"

/** Perf: dashboard overdue list only needs id / drawing / address / deadline. */
const JOB_OVERDUE_PREVIEW_SELECT =
  "id,drawing_number,address,required_by_date,status,client_company,client_id,parent_job_id,revision_letter,updated_at"
const JOB_DEADLINE_TALLY_SELECT =
  "id,parent_job_id,revision_letter,status,required_by_date"

/**
 * Perf: list/detail payloads don't need geocode/notes blobs — select only columns
 * the jobs table + revision flags need. Same JobRow shape via toJobRow (nulls for omitted).
 */
const JOB_LIST_SELECT_COLUMNS = [
  "id", "drawing_number", "item_type", "address", "type_of_works", "custom_type_description",
  "legacy_type_of_works", "client_company", "client_id", "requested_by", "status", "designer",
  "design_standards",
  "date_created", "date_completed", "quote_value", "quote_reference", "quote_date",
  "variation_fees", "additional_charges", "invoice_id", "billing_status", "billing_batch_id",
  "requested_date", "required_by_date", "parent_job_id", "revision_letter", "billable",
  "tags", "archived_at", "archived_by", "created_at", "updated_at",
  "site_name", "site_address",
]

/**
 * Slim projection for scope / current-work overlay: enough for flagRevisions + sort,
 * without shipping full list columns for every candidate parent (up to export cap).
 */
const JOB_SCOPE_OVERLAY_SELECT_COLUMNS = [
  "id", "drawing_number", "parent_job_id", "revision_letter", "status", "designer",
  "required_by_date", "updated_at", "date_completed", "quote_value",
  "list_sort_key", "created_at",
]

export type JobListProjection = "list" | "scope-slim"

/** Omitted after PostgREST "column not found" — remote schema may lag migrations. */
const jobListSelectOmitted = new Set<string>()

function buildJobListSelect(projection: JobListProjection = "list"): string {
  const cols = projection === "scope-slim"
    ? JOB_SCOPE_OVERLAY_SELECT_COLUMNS
    : JOB_LIST_SELECT_COLUMNS
  return cols.filter(c => !jobListSelectOmitted.has(c)).join(",")
}

function noteJobListSelectMissingColumn(error: { code?: string; message?: string } | null): boolean {
  const missing = missingColumnFromError(error)
  if (
    !missing
    || (
      !JOB_LIST_SELECT_COLUMNS.includes(missing)
      && !JOB_SCOPE_OVERLAY_SELECT_COLUMNS.includes(missing)
    )
  ) {
    return false
  }
  jobListSelectOmitted.add(missing)
  return true
}

type JobListQueryResult<T> = { data: T | null; error: { code?: string; message?: string } | null; count?: number | null }

/** List reads retry without columns missing on Supabase (same idea as upsertJobRow). */
async function runJobListSelectQuery<T>(
  build: (select: string) => PromiseLike<JobListQueryResult<T>>,
  projection: JobListProjection = "list",
): Promise<JobListQueryResult<T>> {
  for (let attempt = 0; attempt < 16; attempt++) {
    const result = await build(buildJobListSelect(projection))
    if (!result.error) return result
    if (!noteJobListSelectMissingColumn(result.error)) return result
  }
  throw new Error("Job list query failed: too many missing-column retries")
}

/** Perf: analytics only needs status/type/money/dates — avoid transferring full job rows. */
const JOB_ANALYTICS_SELECT = "status,item_type,quote_value,date_created,date_completed"

/** Perf: employee performance aggregates — designer + status + deadline + stamp fields. */
const JOB_PERFORMANCE_SELECT = "designer,status,date_completed,required_by_date,updated_at"

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
    "design_standards",
    "list_sort_key",
    "tags",
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

export function isDuplicateDrawingNumberError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const e = err as { code?: string; message?: string }
  const msg = (e.message ?? "").toLowerCase()
  return e.code === "23505" && msg.includes("drawing_number")
}

/** Scan all ORYX drawing numbers (paginated) and return the highest sequence suffix. */
async function scanMaxOryxSequence(
  query: () => ReturnType<typeof table>,
): Promise<number> {
  let max = 0
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query()
      .select("drawing_number")
      .like("drawing_number", "%/ORYX/%")
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    for (const row of data) {
      const seq = parseOryxDrawingSequence(row.drawing_number as string)
      if (seq !== null && seq > max) max = seq
    }
    if (data.length < pageSize) break
  }
  return max
}

/** Omit columns added in 005_job_commercial_extras.sql when Supabase hasn't migrated yet. */
function applyWhere(q: JobQuery, where: WhereClause = {}): JobQuery {
  // Soft-delete filter: exclude archived by default (requires 011_soft_delete.sql).
  if (jobsArchivedFilterEnabled()) {
    if (where.onlyArchived)        q = q.not("archived_at", "is", null)
    else if (!where.includeArchived) q = q.is("archived_at", null)
  }

  if (where.search) {
    const textOr = postgrestOrIlike(
      [
        "drawing_number",
        "address",
        "client_company",
        "requested_by",
        "type_of_works",
        "custom_type_description",
        "designer",
        "quote_reference",
      ],
      where.search,
    )
    const tagsOr = postgrestTagsOverlap("tags", matchingJobTags(where.search))
    const orFilter = [textOr, tagsOr].filter(Boolean).join(",")
    if (orFilter) q = q.or(orFilter)
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
    q = q.not("required_by_date", "is", null).eq("required_by_date", todayIsoDate()).neq("status", "ISSUED")
  }
  if (where.dueThisWeek) {
    q = q
      .not("required_by_date", "is", null)
      .gte("required_by_date", todayIsoDate())
      .lte("required_by_date", weekEndIsoDate())
      .neq("status", "ISSUED")
  }
  if (where.hasQuote) q = q.not("quote_value", "is", null).gt("quote_value", 0)
  return q
}

type RevisionSidecarRow = {
  id: string
  parentJobId: string | null
  revisionLetter: string | null
  status: string
  designer: string
  requiredByDate: string | null
  updatedAt: string
  dateCompleted: string | null
  notes: string | null
  billable: boolean
}

const REVISION_SIDECAR_SELECT =
  "id, parent_job_id, revision_letter, status, designer, required_by_date, updated_at, date_completed, notes, billable"
const REVISION_SIDECAR_SELECT_NO_BILLABLE =
  "id, parent_job_id, revision_letter, status, designer, required_by_date, updated_at, date_completed, notes"

function mapRevisionSidecarRows(
  rows: Record<string, unknown>[],
  billableFallback = false,
): RevisionSidecarRow[] {
  return rows.map(r => ({
    id: r.id as string,
    parentJobId: r.parent_job_id as string | null,
    revisionLetter: r.revision_letter as string | null,
    status: r.status as string,
    designer: (r.designer as string) ?? "",
    requiredByDate: (r.required_by_date as string | null) ?? null,
    updatedAt: r.updated_at as string,
    dateCompleted: (r.date_completed as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    billable: billableFallback
      ? true
      : r.billable == null ? true : Boolean(r.billable),
  }))
}

/**
 * Perf: load revision rows only for parents on the current page (or export set),
 * instead of every revision matching the list WHERE clause.
 */
async function fetchRevisionRowsForParents(
  parentIds: string[],
): Promise<RevisionSidecarRow[]> {
  const unique = [...new Set(parentIds.filter(Boolean))]
  if (!unique.length) return []

  const out: RevisionSidecarRow[] = []
  for (let i = 0; i < unique.length; i += REVISION_PARENT_IN_CHUNK) {
    const chunk = unique.slice(i, i + REVISION_PARENT_IN_CHUNK)
    const { data, error } = await table()
      .select(REVISION_SIDECAR_SELECT)
      .in("parent_job_id", chunk)
    if (error) {
      if (isMissingColumnError(error, "billable")) {
        const { data: d2, error: e2 } = await table()
          .select(REVISION_SIDECAR_SELECT_NO_BILLABLE)
          .in("parent_job_id", chunk)
        if (e2) throw e2
        out.push(...mapRevisionSidecarRows((d2 ?? []) as Record<string, unknown>[], true))
        continue
      }
      throw error
    }
    out.push(...mapRevisionSidecarRows((data ?? []) as Record<string, unknown>[]))
  }
  return out
}

/** Legacy in-memory sort when migration 023 (list_sort_key) is not applied yet. */
async function findManyDrawingSortInMemory(opts: FindManyOptions): Promise<{
  jobs: JobRow[]
  total: number
  allForRevisions: RevisionSidecarRow[]
}> {
  const dir = opts.orderBy?.dir ?? "asc"
  const { data: sortData, count, error: sortErr } = await applyWhere(
    table().select("id,drawing_number,parent_job_id,revision_letter,created_at", { count: "exact" }),
    opts.where,
  )
  if (sortErr) throw sortErr

  const totalRows = count ?? 0
  if (totalRows > DRAWING_SORT_WARN_ROWS) {
    logEvent("jobs.list.drawing_sort_large_dataset", { totalRows }, "warn")
  }

  type SortRow = { id: string; drawingNumber: string; parentJobId: string | null; revisionLetter: string | null; createdAt: string }
  type SortDbRow = {
    id: string
    drawing_number: string
    parent_job_id: string | null
    revision_letter: string | null
    created_at: string
  }
  const allSortRows: SortRow[] = ((sortData ?? []) as SortDbRow[]).map(r => ({
    id:             r.id,
    drawingNumber:  r.drawing_number,
    parentJobId:    r.parent_job_id,
    revisionLetter: r.revision_letter,
    createdAt:      r.created_at,
  }))

  const sorted  = sortJobsForList<SortRow>(allSortRows, dir)
  const skip    = opts.skip ?? 0
  const page    = opts.take != null ? sorted.slice(skip, skip + opts.take) : sorted.slice(skip)
  const pageIds = page.map(r => r.id)

  if (!pageIds.length) {
    return { jobs: [], total: count ?? 0, allForRevisions: [] }
  }

  const { data: pageData, error: pageErr } = await runJobListSelectQuery(async select =>
    await table().select(select).in("id", pageIds),
  )
  if (pageErr) throw pageErr

  const byId = new Map(
    ((pageData ?? []) as unknown as SupabaseJobRow[]).map(r => [r.id, toJobRow(r)]),
  )
  const jobs = pageIds.map(id => byId.get(id)).filter((r): r is JobRow => r != null)
  const allForRevisions = await fetchRevisionRowsForParents(collectRevisionParentIds(jobs))

  return { jobs, total: count ?? allSortRows.length, allForRevisions }
}

/** Paginated drawing-number sort via list_sort_key (migration 023). */
async function findManyDrawingSortPaginated(
  opts: FindManyOptions,
  projection: JobListProjection = "list",
): Promise<{
  jobs: JobRow[]
  total: number
  allForRevisions: RevisionSidecarRow[]
}> {
  const dir = opts.orderBy?.dir ?? "asc"
  const asc = dir === "asc"
  const { data, count, error } = await runJobListSelectQuery(async select => {
    let q = applyWhere(table().select(select, { count: "exact" }), opts.where)
      .order("list_sort_key", { ascending: asc })
      .order("created_at", { ascending: asc })
    if (opts.skip != null && opts.take != null) {
      q = q.range(opts.skip, opts.skip + opts.take - 1)
    } else if (opts.take != null) {
      q = q.limit(opts.take)
    }
    return await q
  }, projection)
  if (error) {
    if (isMissingColumnError(error, "list_sort_key")) {
      return findManyDrawingSortInMemory(opts)
    }
    throw error
  }
  const jobs = ((data ?? []) as SupabaseJobRow[]).map(toJobRow)
  const allForRevisions = await fetchRevisionRowsForParents(collectRevisionParentIds(jobs))
  return {
    jobs,
    total: count ?? 0,
    allForRevisions,
  }
}

export const supabaseJobRepo = {
  /**
   * Returns a page of jobs AND the total count.
   *
   * Drawing-number sort (the default): paginated ORDER BY list_sort_key when
   * migration 023 is applied; falls back to in-memory sort otherwise.
   * Revision flags load children only for parents on the returned page.
   *
   * For all other sort fields Supabase handles ordering natively.
   */
  async findManyWithCount(
    opts: FindManyOptions & { projection?: JobListProjection } = {},
  ): Promise<{
    jobs: JobRow[]
    total: number
    allForRevisions?: { id: string; parentJobId: string | null }[]
  }> {
    const field = opts.orderBy?.field ?? "drawingNumber"
    const dir   = opts.orderBy?.dir   ?? "asc"
    const projection = opts.projection ?? "list"

    if (isDrawingNumberListSort(field)) {
      return findManyDrawingSortPaginated({ ...opts, orderBy: { field, dir } }, projection)
    }

    const col = sortColumn(field)
    const asc = dir === "asc"
    const { data, count, error } = await runJobListSelectQuery(async select => {
      let q = applyWhere(table().select(select, { count: "exact" }), opts.where).order(col, { ascending: asc })
      if (opts.skip != null && opts.take != null) {
        q = q.range(opts.skip, opts.skip + opts.take - 1)
      } else if (opts.take != null) {
        q = q.limit(opts.take)
      }
      return await q
    }, projection)
    if (error) throw error
    const jobs = ((data ?? []) as SupabaseJobRow[]).map(toJobRow)
    const allForRevisions = await fetchRevisionRowsForParents(collectRevisionParentIds(jobs))
    return { jobs, total: count ?? 0, allForRevisions }
  },

  async findMany(opts: FindManyOptions = {}): Promise<JobRow[]> {
    const { jobs } = await this.findManyWithCount(opts)
    return jobs
  },

  /**
   * Perf: slim projection for client analytics — only fields computeAnalytics reads.
   * Same take/clientId filter semantics as findMany; avoids shipping notes/geo/etc.
   */
  async findAnalyticsFields(opts: {
    clientId: string
    take?: number
  }): Promise<{
    status: string
    itemType: string
    quoteValue: number | null
    dateCreated: string
    dateCompleted: string | null
  }[]> {
    let q = applyWhere(table().select(JOB_ANALYTICS_SELECT), { clientId: opts.clientId })
    if (opts.take != null) q = q.limit(opts.take)
    const { data, error } = await q
    if (error) {
      if (noteJobsArchivedFromError(error)) {
        return this.findAnalyticsFields(opts)
      }
      throw error
    }
    return ((data ?? []) as {
      status: string
      item_type: string
      quote_value: number | string | null
      date_created: string
      date_completed: string | null
    }[]).map(r => ({
      status: r.status,
      itemType: r.item_type,
      quoteValue: r.quote_value != null ? Number(r.quote_value) : null,
      dateCreated: r.date_created,
      dateCompleted: r.date_completed ?? null,
    }))
  },

  /**
   * Perf: slim projection for employee performance dashboard.
   * Pages through all non-archived jobs (PostgREST default cap is 1000).
   */
  async findPerformanceFields(): Promise<{
    designer: string
    status: string
    dateCompleted: string | null
    requiredByDate: string | null
    updatedAt: string | null
  }[]> {
    const pageSize = 1000
    let useArchived = jobsArchivedFilterEnabled()
    const fetchPage = (from: number, archived: boolean) => {
      let q = table().select(JOB_PERFORMANCE_SELECT).range(from, from + pageSize - 1)
      if (archived) q = q.is("archived_at", null)
      return q
    }

    let { data, error } = await fetchPage(0, useArchived)
    if (error && noteJobsArchivedFromError(error)) {
      useArchived = false
      ;({ data, error } = await fetchPage(0, false))
    }
    if (error) throw error

    const rows = [...(data ?? [])]
    while ((data?.length ?? 0) === pageSize) {
      ;({ data, error } = await fetchPage(rows.length, useArchived))
      if (error) throw error
      rows.push(...(data ?? []))
    }

    return (rows as {
      designer: string | null
      status: string
      date_completed: string | null
      required_by_date: string | null
      updated_at: string | null
    }[]).map(r => ({
      designer: (r.designer ?? "").trim(),
      status: r.status,
      dateCompleted: r.date_completed ?? null,
      requiredByDate: r.required_by_date ?? null,
      updatedAt: r.updated_at ?? null,
    }))
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

  /** Non-issued job counts per client — used by client directory meta on Supabase. */
  async activeJobCountsForClients(clientIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>()
    if (!clientIds.length) return map
    // Page-sized directories (≤50): parallel head counts transfer no row bodies.
    // Filter set matches prior behaviour (status only — no archived_at clause).
    await Promise.all(clientIds.map(async (id) => {
      const { count, error } = await table()
        .select("id", { count: "exact", head: true })
        .eq("client_id", id)
        .neq("status", "ISSUED")
      if (error) throw error
      if ((count ?? 0) > 0) map.set(id, count!)
    }))
    return map
  },

  /** Active job count + quoted value per client — used by hold list enrichment. */
  async clientJobStatsForHolds(
    clientIds: string[],
  ): Promise<Map<string, { activeJobCount: number; quoteValueTotal: number }>> {
    const map = new Map<string, { activeJobCount: number; quoteValueTotal: number }>()
    if (!clientIds.length) return map
    const { data, error } = await table()
      .select("client_id, status, quote_value")
      .in("client_id", clientIds)
    if (error) throw error
    for (const row of data ?? []) {
      const clientId = row.client_id as string
      if (!clientId) continue
      const entry = map.get(clientId) ?? { activeJobCount: 0, quoteValueTotal: 0 }
      if (row.status !== "ISSUED") entry.activeJobCount += 1
      const qv = row.quote_value != null ? Number(row.quote_value) : 0
      if (qv > 0) entry.quoteValueTotal += qv
      map.set(clientId, entry)
    }
    return map
  },

  async findUnique(id: string): Promise<JobRow | null> {
    const { data, error } = await table().select("*").eq("id", id).maybeSingle()
    if (error) throw error
    return data ? toJobRow(data) : null
  },

  async findManyByIds(ids: string[]): Promise<JobRow[]> {
    if (!ids.length) return []
    const { data, error } = await runJobListSelectQuery(async select =>
      await table().select(select).in("id", ids),
    )
    if (error) throw error
    const byId = new Map(
      ((data ?? []) as unknown as SupabaseJobRow[]).map(r => [r.id, toJobRow(r)]),
    )
    // Preserve caller order (important after slim overlay paging).
    return ids.map(id => byId.get(id)).filter((j): j is JobRow => j != null)
  },

  /** Slim fetch for calendar enrichment — only fields needed for drawing-number labels. */
  async findManyByIdsSlim(ids: string[]): Promise<Pick<JobRow, "id" | "drawingNumber">[]> {
    if (!ids.length) return []
    const { data, error } = await table().select("id, drawing_number").in("id", ids)
    if (error) throw error
    return (data ?? []).map(row => ({
      id: row.id as string,
      drawingNumber: row.drawing_number as string,
    }))
  },

  async revisionsForJob(parentId: string): Promise<JobRow[]> {
    const { data, error } = await table()
      .select(buildJobListSelect())
      .eq("parent_job_id", parentId)
      .order("revision_letter", { ascending: true })
    if (error) throw error
    return ((data ?? []) as unknown as SupabaseJobRow[]).map(toJobRow)
  },

  /** Latest revision child only — used by job detail include=current. */
  async findLatestRevisionForParent(parentId: string): Promise<JobRow | null> {
    const { data, error } = await table()
      .select(buildJobListSelect())
      .eq("parent_job_id", parentId)
      .order("revision_letter", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data ? toJobRow(data as unknown as SupabaseJobRow) : null
  },

  /** Head count of revision children for a parent (avoids loading full rows). */
  async countRevisionsForParent(parentId: string): Promise<number> {
    const { count, error } = await table()
      .select("id", { count: "exact", head: true })
      .eq("parent_job_id", parentId)
    if (error) throw error
    return count ?? 0
  },

  /** Bulk-fetch revision children for many parent jobs — one query instead of N. */
  async revisionsForJobs(parentIds: string[]): Promise<Map<string, JobRow[]>> {
    const map = new Map<string, JobRow[]>()
    if (!parentIds.length) return map
    for (const id of parentIds) map.set(id, [])
    const { data, error } = await table()
      .select(buildJobListSelect())
      .in("parent_job_id", parentIds)
      .order("revision_letter", { ascending: true })
    if (error) throw error
    for (const row of (data ?? []) as unknown as SupabaseJobRow[]) {
      const job = toJobRow(row)
      if (!job.parentJobId) continue
      const list = map.get(job.parentJobId) ?? []
      list.push(job)
      map.set(job.parentJobId, list)
    }
    return map
  },

  async findLatestRevisionsForParents(parentIds: string[]): Promise<JobRow[]> {
    if (!parentIds.length) return []
    const { data, error } = await table()
      .select(buildJobListSelect())
      .in("parent_job_id", parentIds)
    if (error) throw error
    const latestByParent = new Map<string, JobRow>()
    for (const row of (data ?? []) as unknown as SupabaseJobRow[]) {
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
    // Perf: one status-column scan replaces N head-count round-trips (one per status).
    const { byStatus } = await this.dashboardCounts()
    return byStatus
  },

  async groupByItemType(): Promise<{ itemType: string; count: number }[]> {
    // Perf: reuse dashboardCounts slim scan (same archived filter + semantics).
    const { byItemType } = await this.dashboardCounts()
    return byItemType
  },

  async deadlineStats(): Promise<{ overdueCount: number; dueTodayCount: number; dueThisWeekCount: number }> {
    const { overdueCount, dueTodayCount, dueThisWeekCount } = await this.dashboardCounts()
    return { overdueCount, dueTodayCount, dueThisWeekCount }
  },

  /**
   * Dashboard aggregates via job_dashboard_counts RPC when available.
   * Falls back to a slim table scan if the RPC is missing / fails.
   * Deadline buckets use the RPC when available (migration 040); fallback
   * uses current-revision semantics via tallyDeadlineStats.
   */
  async dashboardCounts(): Promise<{
    byStatus:         { status: string; count: number }[]
    byItemType:       { itemType: string; count: number }[]
    unassigned:       number
    totalActiveJobs:  number
    activeRevisions:  number
    overdueCount:     number
    dueTodayCount:    number
    dueThisWeekCount: number
  }> {
    const rpc = await this.tryDashboardCountsRpc()
    if (rpc) return rpc
    return this.dashboardCountsViaScan()
  },

  /** Prefer Postgres aggregate RPC — O(1) round-trips vs full-table scan. */
  async tryDashboardCountsRpc(): Promise<{
    byStatus:         { status: string; count: number }[]
    byItemType:       { itemType: string; count: number }[]
    unassigned:       number
    totalActiveJobs:  number
    totalRevisions:   number
    overdueCount:     number
    dueTodayCount:    number
    dueThisWeekCount: number
  } | null> {
    try {
      const { data, error } = await createAdminClient().rpc("job_dashboard_counts")
      if (error || data == null) return null
      const raw = typeof data === "string" ? JSON.parse(data) : data
      if (!raw || typeof raw !== "object") return null
      return {
        byStatus:        Array.isArray(raw.byStatus) ? raw.byStatus : [],
        byItemType:      Array.isArray(raw.byItemType) ? raw.byItemType : [],
        unassigned:      Number(raw.unassigned) || 0,
        totalActiveJobs: Number(raw.totalActiveJobs) || 0,
        totalRevisions:  Number(raw.totalRevisions) || 0,
        overdueCount:    Number(raw.overdueCount) || 0,
        dueTodayCount:   Number(raw.dueTodayCount) || 0,
        dueThisWeekCount: Number(raw.dueThisWeekCount) || 0,
      }
    } catch {
      return null
    }
  },

  async dashboardCountsViaScan(): Promise<{
    byStatus:         { status: string; count: number }[]
    byItemType:       { itemType: string; count: number }[]
    unassigned:       number
    totalActiveJobs:  number
    totalRevisions:   number
    overdueCount:     number
    dueTodayCount:    number
    dueThisWeekCount: number
  }> {
    const pageSize = 1000
    let useArchived = jobsArchivedFilterEnabled()
    const cols = `${JOB_DEADLINE_TALLY_SELECT},item_type,designer`
    const fetchPage = (from: number, archived: boolean) => {
      let q = table().select(cols).range(from, from + pageSize - 1)
      if (archived) q = q.is("archived_at", null)
      return q
    }

    let { data, error } = await fetchPage(0, useArchived)
    if (error && noteJobsArchivedFromError(error)) {
      useArchived = false
      ;({ data, error } = await fetchPage(0, false))
    }
    if (error) throw error

    const rows = [...(data ?? [])]
    while ((data?.length ?? 0) === pageSize) {
      ;({ data, error } = await fetchPage(rows.length, useArchived))
      if (error) throw error
      rows.push(...(data ?? []))
    }

    const statusCounts = new Map<string, number>()
    const typeCounts = new Map<string, number>()
    let unassigned = 0
    const tallyRows = [] as {
      id: string
      parentJobId: string | null
      revisionLetter: string | null
      status: string
      requiredByDate: string | null
    }[]

    for (const row of rows) {
      const status = row.status as string
      const itemType = row.item_type as string
      statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1)
      typeCounts.set(itemType, (typeCounts.get(itemType) ?? 0) + 1)

      const designer = (row.designer as string | null) ?? ""
      if (!designer) unassigned += 1

      tallyRows.push({
        id: row.id as string,
        parentJobId: (row.parent_job_id as string | null) ?? null,
        revisionLetter: (row.revision_letter as string | null) ?? null,
        status,
        requiredByDate: (row.required_by_date as string | null) ?? null,
      })
    }

    const deadlines = tallyDeadlineStats(tallyRows, todayIsoDate())
    const totalActiveJobs = countActiveOriginalJobs(tallyRows)
    const activeRevisions = countActiveRevisions(tallyRows)

    return {
      byStatus: VALID_STATUSES
        .map(status => ({ status, count: statusCounts.get(status) ?? 0 }))
        .filter(r => r.count > 0),
      byItemType: VALID_ITEM_TYPES
        .map(itemType => ({ itemType, count: typeCounts.get(itemType) ?? 0 }))
        .filter(r => r.count > 0),
      unassigned,
      totalActiveJobs,
      activeRevisions,
      ...deadlines,
    }
  },

  async findRecent(take: number) {
    const selectCols =
      "id,drawing_number,item_type,address,status,client_company,designer,quote_value,invoice_id,parent_job_id,revision_letter,created_at"
    const run = () => {
      let q = table()
        .select(selectCols)
        .order("date_created", { ascending: false })
        .limit(take)
      if (jobsArchivedFilterEnabled()) q = q.is("archived_at", null)
      return q
    }
    let { data, error } = await run()
    if (error && noteJobsArchivedFromError(error)) {
      ;({ data, error } = await table()
        .select(selectCols)
        .order("date_created", { ascending: false })
        .limit(take))
    }
    if (error) throw error
    return ((data ?? []) as SupabaseJobRow[]).map(toJobRow)
  },

  /**
   * Dashboard overdue strip — originals whose *current revision* is overdue
   * (same rule as /jobs?deadline=overdue), capped.
   *
   * Perf: seed from DB-filtered candidates (past-due, not issued) using the
   * partial deadline index, then apply current-revision overlay in memory.
   * Falls back to a full slim scan only when the filtered path is empty but
   * we still need family overlays (rare).
   */
  async findOverduePreview(take = 5): Promise<JobRow[]> {
    const today = todayIsoDate()
    let useArchived = jobsArchivedFilterEnabled()

    const fetchCandidates = async (archived: boolean) => {
      let q = table()
        .select(JOB_OVERDUE_PREVIEW_SELECT)
        .neq("status", "ISSUED")
        .not("required_by_date", "is", null)
        .lt("required_by_date", today)
        .order("required_by_date", { ascending: true })
        .limit(500)
      if (archived) q = q.is("archived_at", null)
      return q
    }

    let { data, error } = await fetchCandidates(useArchived)
    if (error && noteJobsArchivedFromError(error)) {
      useArchived = false
      ;({ data, error } = await fetchCandidates(false))
    }
    if (error) throw error

    const rows = [...((data ?? []) as SupabaseJobRow[])]

    // Load sibling revisions + originals for parents in the candidate set so
    // current-revision overlay matches /jobs?deadline=overdue.
    const overdueParentIds = [
      ...new Set(
        rows
          .map(r => r.parent_job_id as string | null)
          .filter((id): id is string => !!id),
      ),
    ]
    const parentKeys = [
      ...new Set([
        ...rows.filter(r => r.parent_job_id == null).map(r => r.id),
        ...overdueParentIds,
      ]),
    ]

    if (parentKeys.length) {
      let siblingQ = table()
        .select(JOB_OVERDUE_PREVIEW_SELECT)
        .in("parent_job_id", parentKeys)
      if (useArchived) siblingQ = siblingQ.is("archived_at", null)
      const siblings = await siblingQ
      if (!siblings.error && siblings.data?.length) {
        const seen = new Set(rows.map(r => r.id))
        for (const row of siblings.data as SupabaseJobRow[]) {
          if (!seen.has(row.id)) {
            seen.add(row.id)
            rows.push(row)
          }
        }
      }
      let originalsQ = table()
        .select(JOB_OVERDUE_PREVIEW_SELECT)
        .in("id", parentKeys)
      if (useArchived) originalsQ = originalsQ.is("archived_at", null)
      const originals = await originalsQ
      if (!originals.error && originals.data?.length) {
        const seen = new Set(rows.map(r => r.id))
        for (const row of originals.data as SupabaseJobRow[]) {
          if (!seen.has(row.id)) {
            seen.add(row.id)
            rows.push(row)
          }
        }
      }
    }

    const tallyRows = rows.map(r => ({
      id: r.id,
      parentJobId: r.parent_job_id,
      revisionLetter: r.revision_letter,
      status: r.status,
      requiredByDate: r.required_by_date,
    }))
    const display = displayDeadlineByOriginal(tallyRows)
    const overdueIds = overdueOriginalIds(tallyRows, today)
    const byId = new Map(rows.map(r => [r.id, r]))

    return overdueIds
      .map(id => byId.get(id))
      .filter((r): r is SupabaseJobRow => !!r)
      .sort((a, b) => {
        const da = display.get(a.id)?.requiredByDate ?? ""
        const db = display.get(b.id)?.requiredByDate ?? ""
        return da.localeCompare(db)
      })
      .slice(0, take)
      .map(row => {
        const overlay = display.get(row.id)
        const mapped = toJobRow(row)
        if (!overlay) return mapped
        return {
          ...mapped,
          status: overlay.status,
          requiredByDate: overlay.requiredByDate,
        }
      })
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
    return scanMaxOryxSequence(table)
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
    const maxByKey = new Map<string, number>()
    const pageSize = 1000
    try {
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await table()
          .select("drawing_number")
          .not("drawing_number", "like", "%/ORYX/%")
          .range(from, from + pageSize - 1)
        if (error) return []
        if (!data?.length) break
        for (const row of data) {
          const match = (row.drawing_number as string | null)?.match(/^([A-Z]+)-(\d{4})-(\d+)$/)
          if (!match) continue
          const [, prefix, yearStr, nnn] = match
          const mapKey = `${prefix}||${yearStr}`
          const seq = parseInt(nnn, 10)
          const prev = maxByKey.get(mapKey) ?? 0
          if (seq > prev) maxByKey.set(mapKey, seq)
        }
        if (data.length < pageSize) break
      }
    } catch {
      return []
    }
    return Array.from(maxByKey.entries()).map(([mapKey, maxSeq]) => {
      const [prefix, yearStr] = mapKey.split("||")
      return { prefix, year: parseInt(yearStr, 10), maxSeq }
    })
  },
}
