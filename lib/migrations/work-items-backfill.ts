/**
 * Pure helpers for migrating design jobs → parent_jobs + work_items.
 * Used by scripts/migrate-design-jobs-to-work-items.ts and unit tests.
 */
import { baseDrawingNumber } from "@/lib/revision-chain"
import type { DesignWorkItemType, WorkItemInvoiceStatus } from "@/modules/jobs/types/design-work-item-types"
import type { ParentJobRow } from "@/modules/jobs/types/parent-job-types"

/** Item types that stay as single rows in Job/jobs — no parent/work-item split. */
export const SINGLE_JOB_ITEM_TYPES = new Set([
  "SITE_VISIT",
  "SURVEY",
  "INSPECTION",
  "CATIII_DESIGN_CHECK",
])

export interface LegacyDesignJobRow {
  id: string
  drawingNumber: string
  itemType: string
  address: string
  siteName?: string | null
  siteAddress?: string | null
  typeOfWorks: string
  customTypeDescription?: string | null
  legacyTypeOfWorks?: string | null
  clientCompany: string
  clientId?: string | null
  requestedBy: string
  status: string
  designer: string
  dateCreated: string
  dateCompleted?: string | null
  notes?: string | null
  quoteValue?: number | null
  quoteReference?: string | null
  quoteDate?: string | null
  commercialNotes?: string | null
  variationFees?: number | null
  additionalCharges?: number | null
  invoiceId?: string | null
  billingStatus?: string | null
  billingBatchId?: string | null
  requestedDate?: string | null
  requiredByDate?: string | null
  parentJobId?: string | null
  revisionLetter?: string | null
  billable?: boolean | number | null
  archivedAt?: string | null
  archivedBy?: string | null
  latitude?: number | null
  longitude?: number | null
  geocodedAt?: string | null
  geocodedAddress?: string | null
  locationStatus?: string | null
  locationSource?: string | null
  createdAt: string
  updatedAt: string
}

export interface LegacyHandoffRow {
  sourceJobId: string
  clearedByAccountsAt: string | null
  exportBatchId?: string | null
}

export function isDesignParentCandidate(job: LegacyDesignJobRow): boolean {
  return job.parentJobId == null && job.itemType === "DESIGN"
}

export function isDesignRevisionCandidate(
  job: LegacyDesignJobRow,
  designParentIds: Set<string>,
): boolean {
  return job.parentJobId != null && designParentIds.has(job.parentJobId)
}

export function originalWorkItemId(parentJobId: string): string {
  return `${parentJobId}:wi-original`
}

export function workItemTitle(workType: DesignWorkItemType, revisionLetter: string | null): string {
  if (workType === "ORIGINAL") return "Original Issue"
  return revisionLetter ? `Revision ${revisionLetter}` : "Revision"
}

export function toBoolBillable(v: boolean | number | null | undefined, defaultVal: boolean): boolean {
  if (v == null) return defaultVal
  if (typeof v === "number") return v !== 0
  return v
}

export function deriveInvoiceFields(
  job: LegacyDesignJobRow,
  handoffs: LegacyHandoffRow[],
): {
  invoiceStatus: WorkItemInvoiceStatus
  invoiceNumber: string | null
  invoiceDate: string | null
  billedValue: number | null
} {
  const forJob = handoffs.filter(h => h.sourceJobId === job.id)
  const active = forJob.find(h => h.clearedByAccountsAt == null)
  const cleared = forJob
    .filter(h => h.clearedByAccountsAt != null)
    .sort((a, b) => String(b.clearedByAccountsAt).localeCompare(String(a.clearedByAccountsAt)))[0]

  const quoted =
    (job.quoteValue ?? 0) + (job.variationFees ?? 0) + (job.additionalCharges ?? 0)
  const billedValue = quoted > 0 ? quoted : job.quoteValue

  if (cleared || job.invoiceId) {
    return {
      invoiceStatus: "INVOICED",
      invoiceNumber: job.invoiceId ?? null,
      invoiceDate: job.quoteDate ?? dateOnly(cleared?.clearedByAccountsAt) ?? null,
      billedValue: billedValue ?? null,
    }
  }

  if (active && job.status === "ISSUED") {
    return {
      invoiceStatus: "READY",
      invoiceNumber: null,
      invoiceDate: null,
      billedValue: null,
    }
  }

  if (job.status === "ISSUED" && job.parentJobId && !toBoolBillable(job.billable, false)) {
    return {
      invoiceStatus: "NONE",
      invoiceNumber: null,
      invoiceDate: null,
      billedValue: null,
    }
  }

  return {
    invoiceStatus: "NONE",
    invoiceNumber: null,
    invoiceDate: null,
    billedValue: null,
  }
}

function dateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null
  return String(iso).slice(0, 10)
}

export function buildParentJobFromOriginal(
  job: LegacyDesignJobRow,
  migratedAt: string,
): ParentJobRow {
  return {
    id: job.id,
    drawingNumber: baseDrawingNumber(job.drawingNumber),
    clientId: job.clientId ?? null,
    clientCompany: job.clientCompany,
    siteName: job.siteName ?? null,
    siteAddress: job.siteAddress ?? null,
    address: job.address,
    typeOfWorks: job.typeOfWorks,
    customTypeDescription: job.customTypeDescription ?? null,
    legacyTypeOfWorks: job.legacyTypeOfWorks ?? null,
    description: job.notes?.trim() || null,
    requestedBy: job.requestedBy,
    itemType: "DESIGN",
    archivedAt: job.archivedAt ?? null,
    archivedBy: job.archivedBy ?? null,
    latitude: job.latitude ?? null,
    longitude: job.longitude ?? null,
    geocodedAt: job.geocodedAt ?? null,
    geocodedAddress: job.geocodedAddress ?? null,
    locationStatus: job.locationStatus ?? null,
    locationSource: job.locationSource ?? null,
    legacyJobId: job.id,
    migratedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}

export interface BuiltWorkItem {
  id: string
  parentJobId: string
  workType: DesignWorkItemType
  revisionLetter: string | null
  title: string
  description: string | null
  status: string
  designer: string
  priority: string | null
  billable: boolean
  requestedDate: string | null
  requiredByDate: string | null
  notes: string | null
  commercialNotes: string | null
  quoteValue: number | null
  quoteReference: string | null
  quoteDate: string | null
  variationFees: number | null
  additionalCharges: number | null
  invoiceStatus: WorkItemInvoiceStatus
  invoiceNumber: string | null
  invoiceDate: string | null
  billedValue: number | null
  dateCreated: string
  completedAt: string | null
  legacyJobId: string | null
  migratedAt: string
  createdAt: string
  updatedAt: string
}

export function buildOriginalWorkItem(
  parent: LegacyDesignJobRow,
  handoffs: LegacyHandoffRow[],
  migratedAt: string,
): BuiltWorkItem {
  const invoice = deriveInvoiceFields(parent, handoffs)
  return {
    id: originalWorkItemId(parent.id),
    parentJobId: parent.id,
    workType: "ORIGINAL",
    revisionLetter: null,
    title: "Original Issue",
    description: null,
    status: parent.status,
    designer: parent.designer ?? "",
    priority: null,
    billable: toBoolBillable(parent.billable, true),
    requestedDate: dateOnly(parent.requestedDate),
    requiredByDate: dateOnly(parent.requiredByDate),
    notes: parent.notes ?? null,
    commercialNotes: parent.commercialNotes ?? null,
    quoteValue: parent.quoteValue ?? null,
    quoteReference: parent.quoteReference ?? null,
    quoteDate: dateOnly(parent.quoteDate),
    variationFees: parent.variationFees ?? null,
    additionalCharges: parent.additionalCharges ?? null,
    invoiceStatus: invoice.invoiceStatus,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    billedValue: invoice.billedValue,
    dateCreated: parent.dateCreated,
    completedAt: dateOnly(parent.dateCompleted),
    legacyJobId: parent.id,
    migratedAt,
    createdAt: parent.createdAt,
    updatedAt: parent.updatedAt,
  }
}

export function buildRevisionWorkItem(
  revision: LegacyDesignJobRow,
  handoffs: LegacyHandoffRow[],
  migratedAt: string,
): BuiltWorkItem {
  const parentId = revision.parentJobId!
  const letter = revision.revisionLetter ?? null
  const invoice = deriveInvoiceFields(revision, handoffs)
  return {
    id: revision.id,
    parentJobId: parentId,
    workType: "REVISION",
    revisionLetter: letter,
    title: workItemTitle("REVISION", letter),
    description: revision.notes ?? null,
    status: revision.status,
    designer: revision.designer ?? "",
    priority: null,
    billable: toBoolBillable(revision.billable, false),
    requestedDate: dateOnly(revision.requestedDate),
    requiredByDate: dateOnly(revision.requiredByDate),
    notes: revision.notes ?? null,
    commercialNotes: revision.commercialNotes ?? null,
    quoteValue: revision.quoteValue ?? null,
    quoteReference: revision.quoteReference ?? null,
    quoteDate: dateOnly(revision.quoteDate),
    variationFees: revision.variationFees ?? null,
    additionalCharges: revision.additionalCharges ?? null,
    invoiceStatus: invoice.invoiceStatus,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    billedValue: invoice.billedValue,
    dateCreated: revision.dateCreated,
    completedAt: dateOnly(revision.dateCompleted),
    legacyJobId: revision.id,
    migratedAt,
    createdAt: revision.createdAt,
    updatedAt: revision.updatedAt,
  }
}

export interface MigrationPlan {
  parents: ParentJobRow[]
  workItems: BuiltWorkItem[]
  idMap: { legacyJobId: string; workItemId: string; parentJobId: string }[]
}

export function planDesignJobMigration(
  allJobs: LegacyDesignJobRow[],
  handoffs: LegacyHandoffRow[],
  migratedAt: string,
): MigrationPlan {
  const parents = allJobs.filter(isDesignParentCandidate)
  const parentIds = new Set(parents.map(p => p.id))
  const revisions = allJobs.filter(j => isDesignRevisionCandidate(j, parentIds))

  const workItems: BuiltWorkItem[] = []
  const idMap: MigrationPlan["idMap"] = []

  for (const parent of parents) {
    const original = buildOriginalWorkItem(parent, handoffs, migratedAt)
    workItems.push(original)
    idMap.push({
      legacyJobId: parent.id,
      workItemId: original.id,
      parentJobId: parent.id,
    })
  }

  for (const rev of revisions) {
    const item = buildRevisionWorkItem(rev, handoffs, migratedAt)
    workItems.push(item)
    idMap.push({
      legacyJobId: rev.id,
      workItemId: item.id,
      parentJobId: rev.parentJobId!,
    })
  }

  return {
    parents: parents.map(p => buildParentJobFromOriginal(p, migratedAt)),
    workItems,
    idMap,
  }
}

export interface MigrationValidation {
  ok: boolean
  errors: string[]
  stats: {
    designParents: number
    workItems: number
    originals: number
    revisions: number
    idMapEntries: number
  }
}

export function validateMigrationPlan(
  allJobs: LegacyDesignJobRow[],
  plan: MigrationPlan,
): MigrationValidation {
  const errors: string[] = []
  const designParents = allJobs.filter(isDesignParentCandidate)
  const parentIds = new Set(designParents.map(p => p.id))
  const revisionJobs = allJobs.filter(j => isDesignRevisionCandidate(j, parentIds))

  if (plan.parents.length !== designParents.length) {
    errors.push(
      `parent_jobs count ${plan.parents.length} != design originals ${designParents.length}`,
    )
  }

  const expectedWorkItems = designParents.length + revisionJobs.length
  if (plan.workItems.length !== expectedWorkItems) {
    errors.push(
      `work_items count ${plan.workItems.length} != expected ${expectedWorkItems}`,
    )
  }

  const originals = plan.workItems.filter(w => w.workType === "ORIGINAL")
  if (originals.length !== designParents.length) {
    errors.push(`original work items ${originals.length} != parents ${designParents.length}`)
  }

  const revisions = plan.workItems.filter(w => w.workType === "REVISION")
  if (revisions.length !== revisionJobs.length) {
    errors.push(`revision work items ${revisions.length} != revision jobs ${revisionJobs.length}`)
  }

  if (plan.idMap.length !== plan.workItems.length) {
    errors.push(`id map ${plan.idMap.length} != work items ${plan.workItems.length}`)
  }

  const drawingNumbers = new Set(plan.parents.map(p => p.drawingNumber))
  if (drawingNumbers.size !== plan.parents.length) {
    errors.push("duplicate drawing numbers in parent_jobs plan")
  }

  for (const parent of plan.parents) {
    if (parent.drawingNumber !== baseDrawingNumber(parent.drawingNumber)) {
      errors.push(`parent ${parent.id} drawing number still has revision suffix`)
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    stats: {
      designParents: designParents.length,
      workItems: plan.workItems.length,
      originals: originals.length,
      revisions: revisions.length,
      idMapEntries: plan.idMap.length,
    },
  }
}
