/** Shared job types — used by SQLite stores, Supabase repo, and API layer. */

export interface JobRow {
  id: string
  drawingNumber: string
  itemType: string
  address: string
  siteName: string | null
  siteAddress: string | null
  typeOfWorks: string
  customTypeDescription: string | null
  legacyTypeOfWorks: string | null
  clientCompany: string
  clientId: string | null
  requestedBy: string
  status: string
  designer: string
  dateCreated: string
  dateCompleted: string | null
  notes: string | null
  designStandards: string | null
  /** Multi-select labels — presets from JOB_TAGS plus optional custom tags. */
  tags: string[]
  quoteValue: number | null
  quoteReference: string | null
  quoteDate: string | null
  commercialNotes: string | null
  variationFees: number | null
  additionalCharges: number | null
  invoiceId: string | null
  billingStatus: string | null
  billingBatchId: string | null
  requestedDate: string | null
  requiredByDate: string | null
  parentJobId: string | null
  revisionLetter: string | null
  /** When true and ISSUED, creates a Ready for Invoicing handoff. New revisions default false. */
  billable: boolean
  archivedAt: string | null
  archivedBy: string | null
  latitude: number | null
  longitude: number | null
  geocodedAt: string | null
  geocodedAddress: string | null
  locationStatus: string | null
  locationSource: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateJobData {
  id: string
  drawingNumber: string
  itemType?: string
  address: string
  siteName?: string | null
  siteAddress?: string | null
  typeOfWorks: string
  customTypeDescription?: string | null
  clientCompany: string
  requestedBy: string
  status: string
  designer: string
  dateCompleted: string | null
  notes: string | null
  designStandards?: string | null
  tags?: string[]
  quoteValue?: number | null
  quoteReference?: string | null
  quoteDate?: string | null
  commercialNotes?: string | null
  variationFees?: number | null
  additionalCharges?: number | null
  parentJobId?: string | null
  revisionLetter?: string | null
  billable?: boolean
  clientId?: string | null
  requestedDate?: string | null
  requiredByDate?: string | null
  changedBy?: string
}

export interface UpdateJobData {
  address?: string
  siteName?: string | null
  siteAddress?: string | null
  typeOfWorks?: string
  customTypeDescription?: string | null
  clientCompany?: string
  requestedBy?: string
  status?: string
  designer?: string
  dateCompleted?: string | null
  notes?: string | null
  designStandards?: string | null
  tags?: string[]
  quoteValue?: number | null
  quoteReference?: string | null
  quoteDate?: string | null
  commercialNotes?: string | null
  variationFees?: number | null
  additionalCharges?: number | null
  clientId?: string | null
  requestedDate?: string | null
  requiredByDate?: string | null
  billable?: boolean
  changedBy?: string
}
