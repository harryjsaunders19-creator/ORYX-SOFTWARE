/**
 * Supabase-native job create/update with status-history and billing side effects.
 * Used when isSupabaseOnly() — no SQLite dual-write.
 */
import { createId as nanoid } from "@paralleldrive/cuid2"
import { nowIso } from "@/lib/db/helpers"
import { totalJobCommercialValue } from "@/lib/utils"
import { composeJobAddress } from "@/modules/job-map/utils/job-address"
import type { BillingHandoffRow } from "@/modules/billing/types/billing-types"
import { supabaseBillingRepo } from "@/modules/billing/supabase/repository"
import { useSupabaseBilling } from "@/lib/supabase/feature-flags"
import type { CreateJobData, JobRow, UpdateJobData } from "../types/job-types"
import type { StatusHistoryRow } from "../types/history-types"
import { supabaseJobRepo, isDuplicateDrawingNumberError } from "../supabase/repository"
import { supabaseStatusHistoryRepo } from "../supabase/status-history-repository"
import { allocateDrawingNumberAsync } from "@/shared/supabase/sequence-service"

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

function buildHandoffFromJob(job: JobRow): BillingHandoffRow {
  const now = nowIso()
  const billingEventType = job.parentJobId ? "REVISION_COMPLETED" : "JOB_COMPLETED"
  const completionDate = job.dateCompleted ?? now.slice(0, 10)
  return {
    id: nanoid(),
    sourceJobId: job.id,
    billingEventType,
    drawingNumber: job.drawingNumber,
    itemType: job.itemType,
    typeOfWorks: job.typeOfWorks,
    customTypeDescription: job.customTypeDescription,
    clientCompany: job.clientCompany,
    address: job.address,
    designer: job.designer || null,
    quoteValue: totalJobCommercialValue(job) ?? job.quoteValue,
    quoteReference: job.quoteReference,
    completionDate,
    addedToBillingQueueAt: now,
    clearedByAccountsAt: null,
    clearedBy: null,
    exportBatchId: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
  }
}

async function recordBillingHandoffIfIssued(job: JobRow): Promise<void> {
  if (!useSupabaseBilling() || job.status !== "ISSUED") return
  // Revisions only enter Ready for Invoicing when explicitly marked billable.
  if (job.parentJobId && !job.billable) return
  const existing = await supabaseBillingRepo.findBySourceJobId(job.id)
  if (existing) return
  await supabaseBillingRepo.upsertHandoff(buildHandoffFromJob(job))
}

async function retractBillingHandoffOnRevert(jobId: string): Promise<string | null> {
  if (!useSupabaseBilling()) return null
  const active = await supabaseBillingRepo.findBySourceJobId(jobId)
  if (active) {
    await supabaseBillingRepo.deleteHandoff(active.id)
    return null
  }
  const history = await supabaseBillingRepo.findHistoryBySourceJobId(jobId)
  const mostRecent = history[0]
  if (mostRecent?.clearedByAccountsAt) {
    const batchRef = mostRecent.exportBatchId ? `batch ${mostRecent.exportBatchId}` : "no batch reference"
    return `Note: this job had already been cleared for accounts (${batchRef}) before being reverted from Complete. That historical billing record was not deleted.`
  }
  return null
}

async function insertStatusHistory(row: StatusHistoryRow): Promise<void> {
  await supabaseStatusHistoryRepo.upsert(row)
}

export const jobSupabaseWrites = {
  async create(data: CreateJobData): Promise<JobRow> {
    const now = nowIso()
    const changedBy = data.changedBy ?? "System"
    let job = buildJobRow(data, now)

    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await supabaseJobRepo.upsert(job)
        await insertStatusHistory({
          id: nanoid(),
          jobId: job.id,
          fromStatus: null,
          toStatus: job.status,
          changedBy,
          changedAt: now,
          note: null,
        })
        await recordBillingHandoffIfIssued(job)
        return job
      } catch (err) {
        if (attempt < 9 && isDuplicateDrawingNumberError(err) && job.itemType === "DESIGN") {
          const drawingNumber = await allocateDrawingNumberAsync()
          job = { ...job, drawingNumber, updatedAt: nowIso() }
          continue
        }
        throw err
      }
    }
    throw new Error("Failed to save new job after drawing-number retries")
  },

  async update(id: string, data: UpdateJobData): Promise<JobRow | null> {
    const existing = await supabaseJobRepo.findUnique(id)
    if (!existing) return null

    const changedBy = data.changedBy ?? "System"
    const statusChanged = data.status !== undefined && data.status !== existing.status
    const oldStatus = existing.status
    const now = nowIso()

    const siteName = data.siteName !== undefined ? (data.siteName?.trim() ?? null) : existing.siteName
    const siteAddress = data.siteAddress !== undefined ? (data.siteAddress?.trim() ?? null) : existing.siteAddress
    let address = existing.address
    if (data.address !== undefined) {
      address = data.address
    } else if (data.siteName !== undefined || data.siteAddress !== undefined) {
      address = composeJobAddress(siteName, siteAddress, existing.address)
    }

    const locationChanged = (
      (data.address !== undefined && data.address.trim().toLowerCase() !== existing.address.trim().toLowerCase())
      || (data.siteName !== undefined && (data.siteName?.trim() ?? "") !== (existing.siteName?.trim() ?? ""))
      || (data.siteAddress !== undefined && (data.siteAddress?.trim() ?? "") !== (existing.siteAddress?.trim() ?? ""))
    )

    const updated: JobRow = {
      ...existing,
      address,
      siteName,
      siteAddress,
      typeOfWorks: data.typeOfWorks ?? existing.typeOfWorks,
      customTypeDescription: data.customTypeDescription !== undefined
        ? data.customTypeDescription
        : existing.customTypeDescription,
      clientCompany: data.clientCompany ?? existing.clientCompany,
      clientId: data.clientId !== undefined ? data.clientId : existing.clientId,
      requestedBy: data.requestedBy ?? existing.requestedBy,
      status: data.status ?? existing.status,
      designer: data.designer ?? existing.designer,
      dateCompleted: data.dateCompleted !== undefined ? data.dateCompleted : existing.dateCompleted,
      notes: data.notes !== undefined ? data.notes : existing.notes,
      tags: data.tags !== undefined ? data.tags : existing.tags,
      quoteValue: data.quoteValue !== undefined ? data.quoteValue : existing.quoteValue,
      quoteReference: data.quoteReference !== undefined ? data.quoteReference : existing.quoteReference,
      quoteDate: data.quoteDate !== undefined ? data.quoteDate : existing.quoteDate,
      commercialNotes: data.commercialNotes !== undefined ? data.commercialNotes : existing.commercialNotes,
      variationFees: data.variationFees !== undefined ? data.variationFees : existing.variationFees,
      additionalCharges: data.additionalCharges !== undefined ? data.additionalCharges : existing.additionalCharges,
      requestedDate: data.requestedDate !== undefined ? data.requestedDate : existing.requestedDate,
      requiredByDate: data.requiredByDate !== undefined ? data.requiredByDate : existing.requiredByDate,
      billable: data.billable !== undefined ? data.billable : existing.billable,
      updatedAt: now,
      ...(locationChanged && {
        latitude: null,
        longitude: null,
        geocodedAt: null,
        geocodedAddress: null,
        locationStatus: "needs_review",
        locationSource: null,
      }),
    }

    const dataKeys = Object.keys(data).filter(
      k => k !== "changedBy" && data[k as keyof UpdateJobData] !== undefined,
    )
    if (!dataKeys.length && !statusChanged) return existing

    await supabaseJobRepo.upsert(updated)

    if (statusChanged) {
      let historyNote: string | null = null
      if (oldStatus === "ISSUED" && data.status !== "ISSUED") {
        historyNote = await retractBillingHandoffOnRevert(id)
      }
      await insertStatusHistory({
        id: nanoid(),
        jobId: id,
        fromStatus: oldStatus,
        toStatus: data.status!,
        changedBy,
        changedAt: now,
        note: historyNote,
      })
      if (data.status === "ISSUED") {
        await recordBillingHandoffIfIssued(updated)
      }
    }

    return supabaseJobRepo.findUnique(id)
  },

  async assignDesigner(id: string, designer: string, changedBy: string): Promise<{ job: JobRow } | null> {
    const existing = await supabaseJobRepo.findUnique(id)
    if (!existing) return null
    const trimmed = designer.trim()
    const now = nowIso()
    const job: JobRow = { ...existing, designer: trimmed, updatedAt: now }
    await supabaseJobRepo.upsert(job)
    await insertStatusHistory({
      id: nanoid(),
      jobId: id,
      fromStatus: existing.status,
      toStatus: existing.status,
      changedBy,
      changedAt: now,
      note: `Designer assigned: ${trimmed}`,
    })
    return { job }
  },

  async setDrawingNumber(id: string, drawingNumber: string): Promise<JobRow | null> {
    const existing = await supabaseJobRepo.findUnique(id)
    if (!existing) return null
    const job: JobRow = { ...existing, drawingNumber, updatedAt: nowIso() }
    await supabaseJobRepo.upsert(job)
    return job
  },
}
