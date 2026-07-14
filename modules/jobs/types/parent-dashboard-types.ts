import type { ParentJobRow } from "./parent-job-types"
import type { DesignWorkItemRow } from "./design-work-item-types"

/** Active workload row — one billable/active work item with parent context. */
export interface ActiveWorkItemListRow {
  id: string
  parentJobId: string
  drawingNumber: string
  workLabel: string
  workType: "ORIGINAL" | "REVISION"
  revisionLetter: string | null
  clientCompany: string
  siteName: string | null
  address: string
  designer: string
  status: string
  requiredByDate: string | null
  billable: boolean
  quoteValue: number | null
  priority: string | null
  updatedAt: string
}

export interface WorkItemInvoiceSummary {
  quotedTotal: number
  billedTotal: number
  readyTotal: number
  itemCount: number
  invoicedCount: number
}

export interface ParentJobDashboard {
  parent: ParentJobRow
  workItems: DesignWorkItemRow[]
  currentActive: DesignWorkItemRow | null
  revisionCount: number
  invoiceSummary: WorkItemInvoiceSummary
  canAddRevision: boolean
  nextRevisionLetter: string | null
}

export interface CreateParentJobInput {
  id: string
  drawingNumber: string
  address: string
  siteName?: string | null
  siteAddress?: string | null
  typeOfWorks: string
  customTypeDescription?: string | null
  clientCompany: string
  clientId?: string | null
  requestedBy: string
  designer?: string
  notes?: string | null
  quoteValue?: number | null
  quoteReference?: string | null
  quoteDate?: string | null
  commercialNotes?: string | null
  variationFees?: number | null
  additionalCharges?: number | null
  requestedDate?: string | null
  requiredByDate?: string | null
  changedBy?: string
}

export interface CreateRevisionWorkItemInput {
  description?: string | null
  billable?: boolean
  designer?: string
  priority?: string | null
  quoteValue?: number | null
  requiredByDate?: string | null
  notes?: string | null
  changedBy?: string
}

export interface UpdateWorkItemInput {
  status?: string
  designer?: string
  description?: string | null
  notes?: string | null
  commercialNotes?: string | null
  billable?: boolean
  priority?: string | null
  quoteValue?: number | null
  quoteReference?: string | null
  quoteDate?: string | null
  variationFees?: number | null
  additionalCharges?: number | null
  requestedDate?: string | null
  requiredByDate?: string | null
  invoiceStatus?: DesignWorkItemRow["invoiceStatus"]
  invoiceNumber?: string | null
  invoiceDate?: string | null
  billedValue?: number | null
  completedAt?: string | null
  changedBy?: string
}
