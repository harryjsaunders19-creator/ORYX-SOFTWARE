export interface Job {
  id:              string
  drawingNumber:   string
  itemType:        string
  address:         string
  typeOfWorks:     string
  customTypeDescription: string | null   // set when typeOfWorks === "Other"
  legacyTypeOfWorks:     string | null   // original free-text value, preserved if this row was auto-migrated to the controlled list
  clientCompany:   string   // kept for backwards compat with all existing queries
  clientId:        string | null   // FK to Client.id
  requestedBy:     string
  status:          string
  designer:        string
  dateCreated:     string
  dateCompleted:   string | null
  notes:           string | null
  quoteValue:      number | null
  quoteReference:  string | null
  quoteDate:       string | null
  commercialNotes: string | null
  variationFees: number | null
  additionalCharges: number | null
  invoiceId:       string | null
  billingStatus:   string | null
  billingBatchId:  string | null
  requestedDate:   string | null   // ISO date — when client made the request
  requiredByDate:  string | null   // ISO date — deadline
  parentJobId:     string | null
  revisionLetter:  string | null
  archivedAt:      string | null
  archivedBy:      string | null
  /** List API only — true when this row is the revision anchor (original or latest rev). */
  canAddRevision?: boolean
  /** Set when archived — latest cancellation record from ArchiveLog. */
  cancelRecord?:    CancelRecord | null
  createdAt:       string
  updatedAt:       string
}

/** Cancellation metadata attached to archived jobs. */
export interface CancelRecord {
  reason:            string
  performedByName:   string
  performedAt:       string
}

export type Role = "ADMIN" | "ENGINEER"

export interface User {
  id:        string
  name:      string
  email:     string | null
  role:      Role
  active:    number   // 1 = active, 0 = disabled
  createdAt: string
  updatedAt: string
}

export interface UserFormData {
  name:  string
  email: string
  role:  Role
}

export interface Client {
  id:             string
  name:           string
  nameLower:      string
  contactName:    string | null
  email:          string | null
  phone:          string | null
  billingAddress: string | null
  notes:          string | null
  accountCode:    string | null   // shown as "Customer ID" on quote/invoice PDFs
  active:         number   // 1 = active, 0 = archived
  archivedAt:     string | null
  archivedBy:     string | null
  createdAt:      string
  updatedAt:      string
}

export interface ClientStats {
  totalJobs:          number
  activeJobs:         number
  issuedJobs:         number
  totalRevisions:     number
  totalQuotedValue:   number | null
  totalInvoicedValue: number | null
}

// DEPRECATED — the app no longer manages invoicing or billing exports
// internally. Kept only because some historical data may still exist in a
// deployed database; nothing in the current UI creates or reads these.
// See BillingHandoff below for the replacement.
export interface Invoice {
  id:            string
  invoiceNumber: string
  invoiceDate:   string
  invoiceValue:  number
  clientCompany: string
  paymentStatus: "DRAFT" | "SENT" | "PAID"
  notes:         string | null
  createdBy:     string
  createdAt:     string
  updatedAt:     string
  sentAt:        string | null
  paidAt:        string | null
}

export interface InvoiceItem {
  id:             string
  invoiceId:      string
  jobId:          string
  drawingNumber:  string
  description:    string | null
  value:          number
  address?:       string
  typeOfWorks?:   string
  clientCompany?: string
  status?:        string
  itemType?:      string
}

export interface ExportBatch {
  id:          string
  batchNumber: string
  exportDate:  string
  exportedBy:  string
  itemCount:   number
  totalValue:  number
  notes:       string | null
  createdAt:   string
}

export interface ExportBatchItem {
  id:            string
  batchId:       string
  jobId:         string
  drawingNumber: string
  clientCompany: string
  itemType:      string
  address:       string
  quoteValue:    number | null
  exportedAt:    string
}

/** One row per billable completion event — the "Ready For Invoicing" handoff
 *  queue for accounts. Replaces Invoice/ExportBatch above. */
export interface BillingHandoff {
  id:                    string
  sourceJobId:           string
  billingEventType:      "JOB_COMPLETED" | "REVISION_COMPLETED"
  drawingNumber:         string
  itemType:              string
  typeOfWorks:           string | null
  customTypeDescription: string | null
  clientCompany:         string
  address:               string
  designer:              string | null
  quoteValue:            number | null
  quoteReference:        string | null
  completionDate:        string
  addedToBillingQueueAt: string
  clearedByAccountsAt:   string | null
  clearedBy:             string | null
  exportBatchId:         string | null
  notes:                 string | null
  createdAt:             string
  updatedAt:             string
}

/** One row per Accounts Handover export — see BillingHandoff above. */
export interface BillingExportBatch {
  id:          string
  batchNumber: string
  exportDate:  string
  exportedBy:  string
  recordCount: number
  notes:       string | null
  createdAt:   string
}

export interface ClientHold {
  id:            string
  clientId:      string
  status:        "ACTIVE" | "REMOVED"
  reason:        string
  notes:         string | null
  addedBy:       string
  addedAt:       string
  removedBy:     string | null
  removedAt:     string | null
  removedReason: string | null
}

export interface ClientHoldWithClient extends ClientHold {
  clientName:      string
  activeJobCount:  number
  quoteValueTotal: number | null
}


export interface Quote {
  id:            string
  quoteNumber:   string
  clientId:      string | null
  clientCompany: string
  contactName:   string | null
  address:       string
  description:   string
  typeOfWorks:   string | null
  customTypeDescription: string | null
  quoteValue:    number | null   // null when redacted for a role that can't view commercial values (see lib/permissions.ts)
  quoteDate:     string
  expiryDate:    string | null
  status:        string   // DRAFT | SENT | ACCEPTED | REJECTED | EXPIRED
  notes:         string | null
  jobId:         string | null
  createdBy:     string
  pdfPath:       string | null
  preparedBy:    string | null
  /** NULL = simple single total on the PDF (no VAT breakdown shown) — the
   *  original, still-supported behaviour. A number (e.g. 20) shows the
   *  Subtotal/Taxable/VAT rate/VAT due/TOTAL breakdown. */
  vatRate:       number | null
  archivedAt:    string | null
  archivedBy:    string | null
  createdAt:     string
  updatedAt:     string
}

export interface QuoteLineItem {
  id: string; quoteId: string; description: string; amount: number
  vatApplicable: number; sortOrder: number; createdAt: string
}

export const QUOTE_STATUSES = [
  { value: "DRAFT",    label: "Draft",    color: "bg-t1/[0.06] text-t2" },
  { value: "SENT",     label: "Sent",     color: "bg-ac-bg text-ach" },
  { value: "ACCEPTED", label: "Accepted", color: "bg-ok-bg text-ok-tx" },
  { value: "REJECTED", label: "Rejected", color: "bg-dn-bg text-dn-tx" },
  { value: "EXPIRED",  label: "Expired",  color: "bg-t1/[0.04] text-t4" },
] as const

export interface StatusHistoryEntry {
  id:         string
  jobId:      string
  fromStatus: string | null
  toStatus:   string
  changedBy:  string
  changedAt:  string
  note:       string | null
}

export interface JobFormData {
  itemType:        string
  address:         string
  typeOfWorks:     string
  customTypeDescription: string
  clientCompany:   string
  clientId:        string   // empty = no client linked
  requestedBy:     string
  status:          string
  designer:        string
  dateCompleted:   string
  notes:           string
  quoteValue:      string
  quoteReference:  string
  quoteDate:       string
  commercialNotes: string
  variationFees: string
  additionalCharges: string
  requiredByDate:  string
}

export interface JobsResponse {
  jobs:  Job[]
  total: number
  page:  number
  limit: number
}

export interface StatsData {
  total:            number
  totalActiveJobs:  number
  totalRevisions:   number
  newRequest:       number
  inDesign:         number
  checking:         number
  issued:           number
  unassigned:       number
  // Commercial (Admin-only) — null when redacted for a role that can't view commercial values
  totalQuotedValue: number | null
  totalIssuedValue: number | null
  avgJobValue:      number | null
  clientsOnHold:        number
  holds:                ClientHoldWithClient[]
  overdueCount:         number
  dueTodayCount:        number
  dueThisWeekCount:     number
  // Ready For Invoicing — the accounts handoff queue (Admin-only module)
  readyForInvoicingCount: number | null
  readyForInvoicingValue: number | null
  clearedForInvoicingCount: number | null
  // Quote module — counts/rate stay visible to Engineers, money does not
  quotesSent:       number
  quotesAccepted:   number
  quotesRejected:   number
  quotesTotalValue: number | null
  quotesWonValue:   number | null
  quotesConversionRate: number
  byItemType:       { itemType: string; count: number }[]
  byStatus:         { status: string; count: number }[]
  recentJobs:       Pick<Job, "id"|"drawingNumber"|"itemType"|"address"|"status"|"clientCompany"|"clientId"|"designer"|"quoteValue"|"invoiceId"|"parentJobId"|"revisionLetter"|"createdAt">[]
}

// InvoiceReport was removed along with /api/invoices/report — see
// PROJECT_OVERVIEW.md §19. BillingHandoff above is the replacement model.

// CommercialReport was removed along with /commercial and /api/commercial —
// see PROJECT_OVERVIEW.md §26. The Dashboard still shows the Admin-only
// total-quoted/total-issued glance figures via /api/stats, which has its
// own inline response shape, not this type.

export type SortField = "drawingNumber" | "clientCompany" | "designer" | "status" | "createdAt" | "dateCreated" | "quoteValue" | "itemType" | "requiredByDate" | "address"
export type SortDir   = "asc" | "desc"

export const PAYMENT_STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "SENT",  label: "Sent"  },
  { value: "PAID",  label: "Paid"  },
] as const

export type PaymentStatus = "DRAFT" | "SENT" | "PAID"
