/**
 * Fast bulk import path for Supabase-backed deployments.
 * Writes jobs/quotes to Supabase in batches (source of truth on Vercel),
 * then mirrors to SQLite for local side-effects (billing handoffs, etc.).
 */
import { db } from "@/lib/db/connection"
import { nowIso } from "@/lib/db/helpers"
import type { JobRow } from "@/lib/db/job-types"
import type { QuoteRow } from "@/lib/db/quote-types"
import { jobDb, quoteDb } from "@/lib/db/stores"
import { billingHandoffService } from "@/lib/services/billing-handoff-service"
import { useSupabaseBilling, useSupabaseJobs, useSupabaseQuotes } from "@/lib/supabase/feature-flags"
import { supabaseJobRepo } from "@/lib/supabase/repositories/jobs"
import { supabaseQuoteRepo } from "@/lib/supabase/repositories/quotes"

const CHUNK = 100

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

export async function bulkImportJobs(jobs: JobRow[]): Promise<void> {
  if (!jobs.length) return

  if (useSupabaseJobs()) {
    for (let i = 0; i < jobs.length; i += CHUNK) {
      await supabaseJobRepo.upsertMany(jobs.slice(i, i + CHUNK))
    }
  }

  db.transaction(() => {
    for (const job of jobs) {
      jobDb.rawInsertOrIgnore(job)
      if (job.status === "ISSUED") {
        jobDb._recordBillingHandoffIfIssued(job)
      }
    }
  })()

  if (useSupabaseBilling()) {
    const issued = jobs.filter(j => j.status === "ISSUED")
    for (const job of issued) {
      await billingHandoffService.syncJobHandoffs(job.id)
    }
  }
}

export async function bulkImportQuotes(quotes: QuoteRow[]): Promise<void> {
  if (!quotes.length) return

  if (useSupabaseQuotes()) {
    for (let i = 0; i < quotes.length; i += CHUNK) {
      await supabaseQuoteRepo.upsertMany(quotes.slice(i, i + CHUNK))
    }
  }

  db.transaction(() => {
    for (const quote of quotes) {
      quoteDb.rawInsertOrIgnore(quote)
    }
  })()
}

export function shouldUseBulkImport(): boolean {
  return useSupabaseJobs() || useSupabaseQuotes()
}
