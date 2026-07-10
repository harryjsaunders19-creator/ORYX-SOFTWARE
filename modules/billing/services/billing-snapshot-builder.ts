/**
 * Build billing export snapshots from Supabase data (no SQLite).
 */
import type { BillingHandoffRow } from "../types/billing-types"
import type { AccountsHandoverSnapshot } from "@/lib/db/stores"
import { supabaseJobRepo } from "@/lib/supabase/repositories/jobs"
import { supabaseClientRepo } from "@/modules/clients/supabase/repository"
import { supabaseStatusHistoryRepo } from "@/modules/jobs/supabase/status-history-repository"
import { supabaseQuoteRepo } from "@/lib/supabase/repositories/quotes"

export async function buildAccountsHandoverSnapshotAsync(
  handoff: BillingHandoffRow,
): Promise<AccountsHandoverSnapshot> {
  const job = await supabaseJobRepo.findUnique(handoff.sourceJobId)
  const client = job?.clientId ? await supabaseClientRepo.findUnique(job.clientId) : null
  const history = job ? await supabaseStatusHistoryRepo.forJob(job.id) : []
  const createdEntry = history.find(h => h.fromStatus === null)
  const completedEntry = [...history].reverse().find(h => h.toStatus === "ISSUED")
  const lastEntry = history[history.length - 1]

  const sourceQuote = job?.quoteReference
    ? await supabaseQuoteRepo.findByNumber(job.quoteReference)
    : null

  const revisions = job ? await supabaseJobRepo.revisionsForJob(job.id) : []
  const revisionHistory = revisions.map(r => ({
    drawingNumber: r.drawingNumber,
    revisionLetter: r.revisionLetter,
    status: r.status,
    requestedDate: r.dateCreated,
    completionDate: r.dateCompleted,
    description: r.notes,
    charge: r.quoteValue,
  }))
  const revisionChargesTotal = revisions.reduce((sum, r) => sum + (r.quoteValue ?? 0), 0)

  const notTracked = [
    "Billing Contact (distinct from Contact Name)",
    "Priority",
    "Request Source",
    "Internal References",
    "Purchase Order Number",
    "Cost Centre",
    "Payment Terms",
    "Surveyor (distinct role from Designer), Survey Date, Survey Notes, Survey References — this application does not track a separate survey workflow from the design workflow, even for itemType='SURVEY' jobs",
    "Attachments / Documents — this application has no file upload or document storage of any kind",
    "Description (distinct from Type of Works) for standard categories — only 'Other'-type jobs have a free-text description; Project Description above is populated only when this job was converted from a quote with its own description",
  ]

  return {
    handoffId: handoff.id,
    billingEventType: handoff.billingEventType,
    client: {
      clientName: client?.name ?? handoff.clientCompany,
      companyName: client?.name ?? handoff.clientCompany,
      contactName: client?.contactName ?? job?.requestedBy ?? null,
      contactEmail: client?.email ?? null,
      contactTelephone: client?.phone ?? null,
      billingContact: null,
      billingAddress: null,
      clientNotes: client?.notes ?? null,
    },
    project: {
      jobNumber: job?.drawingNumber ?? handoff.drawingNumber,
      drawingNumber: handoff.drawingNumber,
      projectName: null,
      projectDescription: sourceQuote?.description ?? null,
      siteAddress: handoff.address,
      typeOfWorks: handoff.typeOfWorks,
      otherTypeDescription: handoff.customTypeDescription,
      allNotes: job?.notes ?? null,
      jobStatus: job?.status ?? "ISSUED",
      priority: null,
      creationDate: job?.dateCreated ?? handoff.createdAt,
      dueDate: job?.requiredByDate ?? null,
      completionDate: handoff.completionDate,
    },
    request: {
      requestedBy: job?.requestedBy ?? null,
      companyRequestingWorks: handoff.clientCompany,
      requestDate: job?.requestedDate ?? null,
      requestSource: null,
      internalReferences: null,
      purchaseOrderNumber: null,
      costCentre: null,
    },
    commercial: {
      agreedFee: handoff.quoteValue,
      quotedFee: job?.quoteValue ?? handoff.quoteValue,
      quoteReference: handoff.quoteReference,
      variationFees: job?.variationFees ?? null,
      additionalCharges: job?.additionalCharges ?? null,
      revisionCharges: revisionChargesTotal || null,
      commercialNotes: job?.commercialNotes ?? null,
      paymentTerms: null,
    },
    design: {
      assignedDesigner: handoff.designer,
      completedBy: completedEntry?.changedBy ?? null,
      designCompletionDate: handoff.completionDate,
      designNotes: job?.notes ?? null,
      designReference: handoff.drawingNumber,
    },
    survey: {
      assignedSurveyor: null,
      surveyDate: null,
      surveyNotes: null,
      surveyReferences: null,
    },
    revisions: {
      revisionCount: revisions.length,
      history: revisionHistory,
    },
    audit: {
      createdBy: createdEntry?.changedBy ?? null,
      createdDate: job?.dateCreated ?? handoff.createdAt,
      lastModifiedBy: lastEntry?.changedBy ?? null,
      lastModifiedDate: job?.updatedAt ?? handoff.updatedAt,
      addedToQueueAt: handoff.addedToBillingQueueAt,
      fullHistory: history.map(h => ({
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        changedBy: h.changedBy,
        changedAt: h.changedAt,
        note: h.note,
      })),
    },
    attachments: {
      note: "This application has no file upload or document storage — no attachment metadata exists to export.",
      items: [],
    },
    notTracked,
  }
}
