/**
 * Fast bulk import path for Supabase-backed deployments.
 * Writes jobs/quotes to Supabase in batches (source of truth on Vercel),
 * then mirrors to SQLite locally for side-effects (billing handoffs, etc.).
 */
import { db } from "@/lib/db/connection"
import { nowIso } from "@/lib/db/helpers"
import type { ClientRow, CreateClientData } from "@/lib/db/client-types"
import type { JobRow, UpdateJobData } from "@/lib/db/job-types"
import type { QuoteRow, UpdateQuoteData } from "@/lib/db/quote-types"
import { clientDb, jobDb, quoteDb } from "@/lib/db/stores"
import {
  useSupabaseClients,
  useSupabaseJobs,
  useSupabaseQuotes,
} from "@/lib/supabase/feature-flags"
import { supabaseClientRepo } from "@/lib/supabase/repositories/clients"
import { supabaseJobRepo } from "@/lib/supabase/repositories/jobs"
import { supabaseQuoteRepo } from "@/lib/supabase/repositories/quotes"

const CHUNK = 100

/** On Vercel, SQLite is ephemeral — Supabase is the only durable store. */
function mirrorBulkToSqlite(): boolean {
  return !process.env.VERCEL
}

export function mergeJobForImport(job: JobRow, data: UpdateJobData): JobRow {
  const now = nowIso()
  return {
    ...job,
    address: data.address ?? job.address,
    typeOfWorks: data.typeOfWorks ?? job.typeOfWorks,
    clientCompany: data.clientCompany ?? job.clientCompany,
    clientId: data.clientId !== undefined ? data.clientId : job.clientId,
    requestedBy: data.requestedBy ?? job.requestedBy,
    status: data.status ?? job.status,
    designer: data.designer ?? job.designer,
    dateCompleted: data.dateCompleted !== undefined ? data.dateCompleted : job.dateCompleted,
    notes: data.notes !== undefined ? data.notes : job.notes,
    quoteValue: data.quoteValue !== undefined ? data.quoteValue : job.quoteValue,
    quoteReference: data.quoteReference !== undefined ? data.quoteReference : job.quoteReference,
    variationFees: data.variationFees !== undefined ? data.variationFees : job.variationFees,
    requiredByDate: data.requiredByDate !== undefined ? data.requiredByDate : job.requiredByDate,
    updatedAt: now,
  }
}

export function mergeQuoteForImport(quote: QuoteRow, data: UpdateQuoteData): QuoteRow {
  const now = nowIso()
  return {
    ...quote,
    clientId: data.clientId !== undefined ? data.clientId : quote.clientId,
    clientCompany: data.clientCompany ?? quote.clientCompany,
    contactName: data.contactName !== undefined ? data.contactName : quote.contactName,
    address: data.address ?? quote.address,
    description: data.description ?? quote.description,
    quoteValue: data.quoteValue ?? quote.quoteValue,
    vatRate: data.vatRate !== undefined ? data.vatRate : quote.vatRate,
    quoteDate: data.quoteDate ?? quote.quoteDate,
    expiryDate: data.expiryDate !== undefined ? data.expiryDate : quote.expiryDate,
    status: data.status ?? quote.status,
    notes: data.notes !== undefined ? data.notes : quote.notes,
    updatedAt: now,
  }
}

export function buildClientRowFromImport(
  data: CreateClientData & { active: number },
): ClientRow {
  const now = nowIso()
  return {
    id: data.id,
    name: data.name,
    nameLower: data.name.toLowerCase(),
    contactName: data.contactName ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
    billingAddress: data.billingAddress ?? null,
    notes: data.notes ?? null,
    accountCode: data.accountCode ?? null,
    active: data.active,
    archivedAt: null,
    archivedBy: null,
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
    archivedAt: null,
    archivedBy: null,
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

export async function bulkImportClients(
  items: Array<CreateClientData & { active: number }>,
): Promise<ClientRow[]> {
  if (!items.length) return []

  const rows = items.map(buildClientRowFromImport)
  const now = nowIso()

  if (useSupabaseClients()) {
    for (let i = 0; i < items.length; i += CHUNK) {
      await supabaseClientRepo.upsertMany(items.slice(i, i + CHUNK), now)
    }
  }

  if (mirrorBulkToSqlite()) {
    db.transaction(() => {
      for (const row of rows) {
        clientDb.rawInsertOrIgnore(row)
      }
    })()
  }

  return rows
}

export async function bulkImportJobs(jobs: JobRow[]): Promise<void> {
  if (!jobs.length) return

  if (useSupabaseJobs()) {
    for (let i = 0; i < jobs.length; i += CHUNK) {
      await supabaseJobRepo.upsertMany(jobs.slice(i, i + CHUNK))
    }
  }

  if (!mirrorBulkToSqlite()) return

  db.transaction(() => {
    for (const job of jobs) {
      jobDb.rawInsertOrIgnore(job)
      if (job.status === "ISSUED") {
        jobDb._recordBillingHandoffIfIssued(job)
      }
    }
  })()
}

export async function bulkImportQuotes(quotes: QuoteRow[]): Promise<void> {
  if (!quotes.length) return

  if (useSupabaseQuotes()) {
    for (let i = 0; i < quotes.length; i += CHUNK) {
      await supabaseQuoteRepo.upsertMany(quotes.slice(i, i + CHUNK))
    }
  }

  if (!mirrorBulkToSqlite()) return

  db.transaction(() => {
    for (const quote of quotes) {
      quoteDb.rawInsertOrIgnore(quote)
    }
  })()
}

export function shouldUseBulkImport(): boolean {
  return useSupabaseClients() || useSupabaseJobs() || useSupabaseQuotes()
}
