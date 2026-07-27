/**
 * Atomic quote → legacy job convert via migration 033 RPC.
 * Falls back to create + conditional link + compensating delete.
 */
import { createId } from "@paralleldrive/cuid2"
import { createAdminClient } from "@/lib/supabase/admin"
import { isSupabaseAdminConfigured } from "@/lib/supabase/config"
import { nowIso } from "@/lib/db/helpers"
import { composeJobAddress } from "@/modules/job-map/utils/job-address"
import type { CreateJobData, JobRow } from "@/modules/jobs/types/job-types"
import { toSupabaseRow } from "@/modules/jobs/supabase/mapper"
import { jobService } from "@/lib/services/job-service"
import { quoteService } from "./services/quote-service"
import type { QuoteRow } from "./types/quote-types"
import { logError } from "@/shared/logger"

function buildJobRow(data: CreateJobData, now: string): JobRow {
  const siteName = data.siteName?.trim() ?? null
  const siteAddress = data.siteAddress?.trim() ?? null
  const address = data.address?.trim()
    ? data.address.trim()
    : composeJobAddress(siteName, siteAddress)

  return {
    id: data.id,
    drawingNumber: data.drawingNumber,
    itemType: data.itemType ?? "DESIGN",
    address,
    siteName,
    siteAddress,
    typeOfWorks: data.typeOfWorks,
    customTypeDescription: data.customTypeDescription ?? null,
    legacyTypeOfWorks: null,
    clientCompany: data.clientCompany,
    clientId: data.clientId ?? null,
    requestedBy: data.requestedBy,
    status: data.status,
    designer: data.designer ?? "",
    dateCreated: now,
    dateCompleted: data.dateCompleted ?? null,
    notes: data.notes ?? null,
    tags: data.tags ?? [],
    quoteValue: data.quoteValue ?? null,
    quoteReference: data.quoteReference ?? null,
    quoteDate: data.quoteDate ?? null,
    commercialNotes: data.commercialNotes ?? null,
    variationFees: data.variationFees ?? null,
    additionalCharges: data.additionalCharges ?? null,
    invoiceId: null,
    billingStatus: null,
    billingBatchId: null,
    requestedDate: data.requestedDate ?? null,
    requiredByDate: data.requiredByDate ?? null,
    parentJobId: data.parentJobId ?? null,
    revisionLetter: data.revisionLetter ?? null,
    billable: data.billable ?? (data.parentJobId ? false : true),
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

function isMissingRpcError(message: string): boolean {
  return /convert_quote_to_job|42883|does not exist|PGRST202/i.test(message)
}

async function convertViaRpc(
  quoteId: string,
  job: JobRow,
  changedBy: string,
): Promise<{ job: JobRow; quote: QuoteRow } | "missing_rpc"> {
  const supabase = createAdminClient()
  const { error } = await supabase.rpc("convert_quote_to_job", {
    p_quote_id: quoteId,
    p_job: toSupabaseRow(job),
    p_history_id: createId(),
    p_changed_by: changedBy,
  })

  if (error) {
    if (isMissingRpcError(error.message)) return "missing_rpc"
    throw new Error(error.message)
  }

  const quote = await quoteService.findUnique(quoteId)
  if (!quote?.jobId) {
    throw new Error("convert_quote_to_job succeeded but quote was not linked")
  }
  return { job, quote }
}

async function convertLegacyFallback(
  quoteId: string,
  data: CreateJobData,
): Promise<{ job: JobRow; quote: QuoteRow }> {
  const job = await jobService.create(data)
  const updatedQuote = await quoteService.linkToJob(quoteId, job.id)
  if (!updatedQuote) {
    try {
      await jobService.delete(job.id)
    } catch (cleanupErr) {
      logError("quote.convert.rollback_failed", cleanupErr, { quoteId, jobId: job.id })
    }
    throw new Error("Failed to link quote to job")
  }
  return { job, quote: updatedQuote }
}

/** Create a legacy design job and link the quote atomically when RPC is available. */
export async function convertQuoteToLegacyJob(
  quoteId: string,
  data: CreateJobData,
): Promise<{ job: JobRow; quote: QuoteRow }> {
  const now = nowIso()
  const changedBy = data.changedBy ?? "System"
  const job = buildJobRow(data, now)

  // Local/CI SQLite has no admin client — skip RPC and use the create+link path.
  if (isSupabaseAdminConfigured()) {
    const viaRpc = await convertViaRpc(quoteId, job, changedBy)
    if (viaRpc !== "missing_rpc") return viaRpc
  }

  return convertLegacyFallback(quoteId, data)
}
