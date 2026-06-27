/** Shared job types — used by SQLite stores, Supabase repo, and API layer. */

export interface JobRow {
  id: string
  drawingNumber: string
  itemType: string
  address: string
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
  quoteValue: number | null
  quoteReference: string | null
  quoteDate: string | null
  commercialNotes: string | null
  invoiceId: string | null
  billingStatus: string | null
  billingBatchId: string | null
  requestedDate: string | null
  requiredByDate: string | null
  parentJobId: string | null
  revisionLetter: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateJobData {
  id: string
  drawingNumber: string
  itemType?: string
  address: string
  typeOfWorks: string
  customTypeDescription?: string | null
  clientCompany: string
  requestedBy: string
  status: string
  designer: string
  dateCompleted: string | null
  notes: string | null
  quoteValue?: number | null
  quoteReference?: string | null
  quoteDate?: string | null
  commercialNotes?: string | null
  parentJobId?: string | null
  revisionLetter?: string | null
  clientId?: string | null
  requestedDate?: string | null
  requiredByDate?: string | null
  changedBy?: string
}

export interface UpdateJobData {
  address?: string
  typeOfWorks?: string
  customTypeDescription?: string | null
  clientCompany?: string
  requestedBy?: string
  status?: string
  designer?: string
  dateCompleted?: string | null
  notes?: string | null
  quoteValue?: number | null
  quoteReference?: string | null
  quoteDate?: string | null
  commercialNotes?: string | null
  clientId?: string | null
  requestedDate?: string | null
  requiredByDate?: string | null
  changedBy?: string
}
