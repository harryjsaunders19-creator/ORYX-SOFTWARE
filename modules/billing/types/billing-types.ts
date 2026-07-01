/** Billing handoff + export types shared across SQLite and Supabase. */

export interface BillingHandoffRow {
  id: string
  sourceJobId: string
  billingEventType: string
  drawingNumber: string
  itemType: string
  typeOfWorks: string | null
  customTypeDescription: string | null
  clientCompany: string
  address: string
  designer: string | null
  quoteValue: number | null
  quoteReference: string | null
  completionDate: string
  addedToBillingQueueAt: string
  clearedByAccountsAt: string | null
  clearedBy: string | null
  exportBatchId: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface BillingExportBatchRow {
  id: string
  batchNumber: string
  exportDate: string
  exportedBy: string
  recordCount: number
  notes: string | null
  createdAt: string
}

export interface BillingExportSnapshotRow {
  id: string
  batchId: string
  handoffId: string
  snapshotJson: string
  createdAt: string
}

export interface BillingHandoffListOptions {
  cleared?: boolean
  skip?: number
  take?: number
}
