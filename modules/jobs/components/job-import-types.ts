import type { ImportField } from "../import/import-jobs"

export interface PreviewRow {
  rowIndex: number
  address: string
  typeOfWorks: string
  customTypeDescription: string | null
  clientCompany: string
  requestedBy: string
  designer: string
  status: string
  notes: string | null
  quoteValue: number | null
  quoteReference: string | null
  quoteDate: string | null
  commercialNotes: string | null
  requiredByDate: string | null
  requestedDate: string | null
  dateCompleted: string | null
  itemType: string
  errors: string[]
  warnings: string[]
}

export interface PreviewResponse {
  preview: true
  filename: string
  headers: string[]
  mapping: Record<string, ImportField>
  unmappedHeaders: string[]
  rows: PreviewRow[]
  totalRawRows: number
  requiredFieldsMissing: boolean
  summary: { total: number; valid: number; errors: number; warnings: number }
}

export interface CommitResponse {
  imported: number
  skipped: number
  skippedDetails: { rowIndex: number; reasons: string[] }[]
  importedJobs: { drawingNumber: string; address: string; clientCompany: string }[]
  nextDrawingNumber: string
}

export type Step = "upload" | "preview" | "importing" | "done"
