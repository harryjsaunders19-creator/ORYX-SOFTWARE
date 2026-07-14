/** Work carried out on a design parent job — Original Issue or a revision. */

export const DESIGN_WORK_TYPES = ["ORIGINAL", "REVISION"] as const
export type DesignWorkItemType = (typeof DESIGN_WORK_TYPES)[number]

export const INVOICE_STATUSES = ["NONE", "READY", "INVOICED", "WRITTEN_OFF"] as const
export type WorkItemInvoiceStatus = (typeof INVOICE_STATUSES)[number]

export interface DesignWorkItemRow {
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

export interface WorkItemIdMapRow {
  legacyJobId: string
  workItemId: string
  parentJobId: string
  migratedAt: string
}
