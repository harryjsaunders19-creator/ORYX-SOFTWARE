/**
 * Build billing export snapshots from Supabase data (no SQLite).
 * Prefer the batch builder for export/recovery paths to avoid N+1 queries.
 */
import type { BillingHandoffRow } from "../types/billing-types"
import type { AccountsHandoverSnapshot } from "@/lib/db/stores"
import type { JobRow } from "@/modules/jobs/types/job-types"
import type { ClientRow } from "@/modules/clients/types/client-types"
import type { StatusHistoryRow } from "@/modules/jobs/types/history-types"
import type { QuoteRow } from "@/modules/quotes/types/quote-types"
import { supabaseJobRepo } from "@/modules/jobs/supabase/repository"
import { supabaseClientRepo } from "@/modules/clients/supabase/repository"
import { supabaseStatusHistoryRepo } from "@/modules/jobs/supabase/status-history-repository"
import { supabaseQuoteRepo } from "@/modules/quotes/supabase/repository"

const NOT_TRACKED = [
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

function assembleSnapshot(
  handoff: BillingHandoffRow,
  job: JobRow | null | undefined,
  client: ClientRow | null | undefined,
  history: StatusHistoryRow[],
  sourceQuote: QuoteRow | null | undefined,
  revisions: JobRow[],
): AccountsHandoverSnapshot {
  const createdEntry = history.find(h => h.fromStatus === null)
  const completedEntry = [...history].reverse().find(h => h.toStatus === "ISSUED")
  const lastEntry = history[history.length - 1]

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
    notTracked: NOT_TRACKED,
  }
}

/** Single-handoff builder (kept for callers that need one snapshot). */
export async function buildAccountsHandoverSnapshotAsync(
  handoff: BillingHandoffRow,
): Promise<AccountsHandoverSnapshot> {
  const [snapshot] = await buildAccountsHandoverSnapshotsBatch([handoff])
  return snapshot!
}

/**
 * Batch-build accounts handover snapshots for many handoffs.
 * Loads jobs, clients, status history, quotes, and revisions in bulk — no per-handoff N+1.
 * When handoffs reference work items, also loads parent work-item revision history.
 */
export async function buildAccountsHandoverSnapshotsBatch(
  handoffs: BillingHandoffRow[],
): Promise<AccountsHandoverSnapshot[]> {
  if (!handoffs.length) return []

  const jobIds = [...new Set(handoffs.map(h => h.sourceJobId).filter(Boolean))]
  const workItemIds = [...new Set(
    handoffs.map(h => h.sourceWorkItemId).filter((id): id is string => !!id),
  )]

  const jobs = await supabaseJobRepo.findManyByIds(jobIds)
  const jobById = new Map(jobs.map(j => [j.id, j]))

  let workItems: Awaited<ReturnType<typeof import("@/modules/jobs/supabase/work-item-repository").supabaseWorkItemRepo.findManyByIds>> = []
  let workItemsByParent = new Map<string, typeof workItems>()
  if (workItemIds.length) {
    const { supabaseWorkItemRepo } = await import("@/modules/jobs/supabase/work-item-repository")
    workItems = await supabaseWorkItemRepo.findManyByIds(workItemIds)
    const parentIds = [...new Set(workItems.map(w => w.parentJobId))]
    const allForParents = await Promise.all(parentIds.map(id => supabaseWorkItemRepo.findByParent(id)))
    workItemsByParent = new Map(parentIds.map((id, i) => [id, allForParents[i] ?? []]))
  }
  const workItemById = new Map(workItems.map(w => [w.id, w]))

  const clientIds = [...new Set(jobs.map(j => j.clientId).filter((id): id is string => !!id))]
  const quoteNumbers = [
    ...new Set([
      ...jobs.map(j => j.quoteReference).filter((n): n is string => !!n),
      ...workItems.map(w => w.quoteReference).filter((n): n is string => !!n),
    ]),
  ]

  const historyIds = [
    ...jobIds,
    ...workItems.map(w => w.legacyJobId).filter((id): id is string => !!id),
  ]

  const [clients, historyByJob, quotes, revisionsByParent] = await Promise.all([
    supabaseClientRepo.findManyByIds(clientIds),
    supabaseStatusHistoryRepo.forJobs([...new Set(historyIds)]),
    supabaseQuoteRepo.findManyByNumbers(quoteNumbers),
    supabaseJobRepo.revisionsForJobs(jobIds),
  ])

  // Also pull status history keyed by work_item_id where available
  const historyByWorkItem = new Map<string, StatusHistoryRow[]>()
  if (workItemIds.length) {
    for (const wiId of workItemIds) {
      try {
        const rows = await supabaseStatusHistoryRepo.forWorkItem(wiId)
        historyByWorkItem.set(wiId, rows)
      } catch { /* optional */ }
    }
  }

  const clientById = new Map(clients.map(c => [c.id, c]))
  const quoteByNumber = new Map(quotes.map(q => [q.quoteNumber, q]))

  return handoffs.map(handoff => {
    const workItem = handoff.sourceWorkItemId
      ? workItemById.get(handoff.sourceWorkItemId) ?? null
      : null
    const job = jobById.get(handoff.sourceJobId) ?? null
    const client = job?.clientId ? clientById.get(job.clientId) ?? null : null

    if (workItem) {
      const siblings = workItemsByParent.get(workItem.parentJobId) ?? []
      const asJobs = siblings.map(w => ({
        drawingNumber: handoff.drawingNumber,
        revisionLetter: w.revisionLetter,
        status: w.status,
        dateCreated: w.dateCreated,
        dateCompleted: w.completedAt,
        notes: w.notes,
        quoteValue: w.quoteValue,
      })) as JobRow[]
      const history = historyByWorkItem.get(workItem.id)
        ?? (workItem.legacyJobId ? historyByJob.get(workItem.legacyJobId) ?? [] : [])
      const sourceQuote = workItem.quoteReference
        ? quoteByNumber.get(workItem.quoteReference) ?? null
        : null
      return assembleSnapshot(handoff, job, client, history, sourceQuote, asJobs)
    }

    const history = job ? (historyByJob.get(job.id) ?? []) : []
    const sourceQuote = job?.quoteReference
      ? quoteByNumber.get(job.quoteReference) ?? null
      : null
    const revisions = job ? (revisionsByParent.get(job.id) ?? []) : []
    return assembleSnapshot(handoff, job, client, history, sourceQuote, revisions)
  })
}
