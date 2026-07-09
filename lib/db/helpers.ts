/**
 * lib/db/helpers.ts — shared query helpers.
 */
import { isDrawingNumberListSort } from "@/lib/job-list-sort"
export interface WhereClause {
  search?: string; status?: string
  unassigned?: boolean; hasQuote?: boolean
  itemType?: string; clientId?: string
  typeOfWorks?: string
  invoiced?: boolean; notInvoiced?: boolean
  billingExported?: boolean
  billingPending?:  boolean
  dueToday?:        boolean
  dueThisWeek?:     boolean
  overdue?:             boolean
  overdueOrDueToday?:   boolean
  hasDeadline?:         boolean
  parentJobId?: string; onlyOriginals?: boolean; onlyRevisions?: boolean
  /** When true, include archived records in results (default: exclude them). */
  includeArchived?: boolean
  /** When true, return ONLY archived records. Takes precedence over includeArchived. */
  onlyArchived?: boolean
}

export interface FindManyOptions {
  where?: WhereClause
  orderBy?: { field: string; dir: "asc" | "desc" }
  skip?: number; take?: number
}

export function nowIso() { return new Date().toISOString() }

export function buildWhere(where: WhereClause = {}): { sql: string; params: unknown[] } {
  const clauses: string[] = []
  const params:  unknown[] = []
  if (where.search) {
    const s = `%${where.search}%`
    clauses.push("(drawingNumber LIKE ? OR address LIKE ? OR clientCompany LIKE ? OR requestedBy LIKE ? OR typeOfWorks LIKE ? OR customTypeDescription LIKE ? OR designer LIKE ?)")
    params.push(s, s, s, s, s, s, s)
  }
  if (where.typeOfWorks)      { clauses.push("typeOfWorks = ?");                    params.push(where.typeOfWorks) }
  if (where.itemType)         { clauses.push("itemType = ?");                       params.push(where.itemType) }
  if (where.clientId)         { clauses.push("clientId = ?");                        params.push(where.clientId) }
  if (where.billingExported)  { clauses.push("billingStatus = 'EXPORTED_TO_ACCOUNTS'") }
  if (where.billingPending)   { clauses.push("status = 'ISSUED' AND invoiceId IS NULL AND (billingStatus IS NULL OR billingStatus != 'EXPORTED_TO_ACCOUNTS')") }
  if (where.overdue)            { clauses.push("requiredByDate IS NOT NULL AND requiredByDate < date('now') AND status != 'ISSUED'") }
  if (where.overdueOrDueToday)  { clauses.push("requiredByDate IS NOT NULL AND requiredByDate <= date('now') AND status != 'ISSUED'") }
  if (where.dueToday)         { clauses.push("requiredByDate IS NOT NULL AND requiredByDate = date('now') AND status != 'ISSUED'") }
  if (where.dueThisWeek)      { clauses.push("requiredByDate IS NOT NULL AND requiredByDate >= date('now') AND requiredByDate <= date('now','+7 days') AND status != 'ISSUED'") }
  if (where.hasDeadline)      { clauses.push("requiredByDate IS NOT NULL") }
  if (where.status)           { clauses.push("status = ?");                        params.push(where.status) }
  if (where.unassigned)       { clauses.push("(designer = '' OR designer IS NULL)") }
  if (where.hasQuote)         { clauses.push("(quoteValue IS NOT NULL AND quoteValue > 0)") }
  if (where.invoiced)         { clauses.push("invoiceId IS NOT NULL") }
  if (where.notInvoiced)      { clauses.push("invoiceId IS NULL") }
  if (where.parentJobId)      { clauses.push("parentJobId = ?");  params.push(where.parentJobId) }
  if (where.onlyOriginals)    { clauses.push("parentJobId IS NULL") }
  if (where.onlyRevisions)    { clauses.push("parentJobId IS NOT NULL") }
  // Soft-delete filter: exclude archived rows by default.
  if (where.onlyArchived)     { clauses.push("archivedAt IS NOT NULL") }
  else if (!where.includeArchived) { clauses.push("archivedAt IS NULL") }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params }
}

const SORT_WHITELIST = new Set(["createdAt","drawingNumber","clientCompany","designer","status","dateCreated","quoteValue","itemType","requiredByDate","requestedDate","address"])

export function safeOrder(field: string, dir: string) {
  const d = dir === "asc" ? "ASC" : "DESC"
  if (isDrawingNumberListSort(field)) {
    // Originals by drawing number; revisions grouped under parent, then by letter.
    return `ORDER BY
      CASE WHEN parentJobId IS NULL THEN drawingNumber
           ELSE COALESCE((SELECT p.drawingNumber FROM Job p WHERE p.id = Job.parentJobId), drawingNumber) END ${d},
      COALESCE(revisionLetter, '') ${d}`
  }
  const f = SORT_WHITELIST.has(field) ? field : "dateCreated"
  return `ORDER BY "${f}" ${d}`
}
