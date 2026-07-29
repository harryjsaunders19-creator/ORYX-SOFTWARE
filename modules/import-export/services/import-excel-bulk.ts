/**
 * Bulk Excel import helpers — routes to Supabase-only or SQLite (local/CI).
 * Dual-write / mirror removed; see docs/sqlite-sunset.md.
 *
 * Row builders stay here (shared). Callers that prefer service-layer create/update
 * loops on SQLite should keep using those; use bulkImport* when isSupabaseOnly().
 */
import { createRequire } from "node:module"
import { nowIso } from "@/lib/db/helpers"
import type { ClientRow } from "@/modules/clients/types"
import type { JobRow } from "@/modules/jobs/types/job-types"
import type { QuoteRow } from "@/modules/quotes/types"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

const require = createRequire(import.meta.url)

const backend = isSupabaseOnly()
  ? (require("./import-excel-bulk-supabase") as typeof import("./import-excel-bulk-supabase"))
  : (require("./import-excel-bulk-sqlite") as typeof import("./import-excel-bulk-sqlite"))

export const bulkImportClients = backend.bulkImportClients
export const bulkImportJobs = backend.bulkImportJobs
export const bulkImportQuotes = backend.bulkImportQuotes

export function shouldUseBulkImport(): boolean {
  return isSupabaseOnly()
}

export function buildClientRowFromImport(data: {
  id: string
  name: string
  contactName: string | null
  phone: string | null
  email: string | null
  billingAddress: string | null
  notes: string | null
  accountCode: string | null
  active: number
}): ClientRow {
  const now = nowIso()
  return {
    id: data.id,
    name: data.name,
    nameLower: data.name.toLowerCase(),
    contactName: data.contactName,
    phone: data.phone,
    email: data.email,
    billingAddress: data.billingAddress,
    notes: data.notes,
    accountCode: data.accountCode,
    active: data.active,
    archivedAt: data.active === 0 ? now : null,
    archivedBy: data.active === 0 ? "Excel Import" : null,
    createdAt: now,
    updatedAt: now,
  }
}

export function buildJobRowFromImport(data: {
  id: string
  drawingNumber: string
  itemType: string
  address: string
  typeOfWorks: string
  clientCompany: string
  clientId: string | null
  requestedBy: string
  status: string
  designer: string
  quoteValue: number | null
  variationFees: number | null
  quoteReference: string | null
  requiredByDate: string | null
  dateCreated: string | null
  dateCompleted: string | null
  notes: string | null
}): JobRow {
  const now = nowIso()
  const dateCreated = data.dateCreated ?? now
  return {
    id: data.id,
    drawingNumber: data.drawingNumber,
    itemType: data.itemType,
    address: data.address,
    siteName: null,
    siteAddress: data.address,
    typeOfWorks: data.typeOfWorks,
    customTypeDescription: null,
    legacyTypeOfWorks: null,
    clientCompany: data.clientCompany,
    clientId: data.clientId,
    requestedBy: data.requestedBy,
    status: data.status,
    designer: data.designer,
    dateCreated: dateCreated.slice(0, 10),
    dateCompleted: data.dateCompleted?.slice(0, 10) ?? null,
    notes: data.notes,
    designStandards: null,
    tags: [],
    quoteValue: data.quoteValue,
    quoteReference: data.quoteReference,
    quoteDate: null,
    commercialNotes: null,
    variationFees: data.variationFees,
    additionalCharges: null,
    invoiceId: null,
    billingStatus: null,
    billingBatchId: null,
    requestedDate: null,
    requiredByDate: data.requiredByDate?.slice(0, 10) ?? null,
    parentJobId: null,
    revisionLetter: null,
    billable: true,
    archivedAt: null,
    archivedBy: null,
    latitude: null,
    longitude: null,
    geocodedAt: null,
    geocodedAddress: null,
    locationStatus: null,
    locationSource: null,
    createdAt: now,
    updatedAt: now,
  }
}

export function buildQuoteRowFromImport(data: {
  id: string
  quoteNumber: string
  clientId: string | null
  clientCompany: string
  contactName: string | null
  address: string
  description: string
  quoteValue: number
  quoteDate: string
  expiryDate: string | null
  status: string
  notes: string | null
  createdBy: string
  vatRate: number | null
}): QuoteRow {
  const now = nowIso()
  return {
    id: data.id,
    quoteNumber: data.quoteNumber,
    clientId: data.clientId,
    clientCompany: data.clientCompany,
    contactName: data.contactName,
    address: data.address,
    description: data.description,
    typeOfWorks: null,
    customTypeDescription: null,
    quoteValue: data.quoteValue,
    quoteDate: data.quoteDate.slice(0, 10),
    expiryDate: data.expiryDate?.slice(0, 10) ?? null,
    status: data.status,
    notes: data.notes,
    jobId: null,
    createdBy: data.createdBy,
    pdfPath: null,
    preparedBy: null,
    vatRate: data.vatRate,
    archivedAt: null,
    archivedBy: null,
    createdAt: now,
    updatedAt: now,
  }
}

/** Format Supabase/PostgREST errors for import result panels. */
export function formatImportError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === "object") {
    const e = err as { message?: string; code?: string; details?: string; hint?: string }
    return [e.message, e.details, e.hint, e.code ? `(${e.code})` : null].filter(Boolean).join(" — ")
  }
  return String(err)
}
