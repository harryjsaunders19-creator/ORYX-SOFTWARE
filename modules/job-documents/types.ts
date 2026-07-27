import type { JobDocumentCategory, DocumentKindFilter, DocumentScopeFilter, DocumentPeriodFilter } from "./constants"

export type ParseStatus = "none" | "ok" | "failed"

export interface JobDocumentRow {
  id: string
  rootJobId: string
  jobId: string | null
  parentJobId: string | null
  workItemId: string | null
  revisionLetter: string | null
  filename: string
  originalFilename: string
  mimeType: string
  fileExt: string
  fileSize: number
  category: string
  description: string | null
  storagePath: string
  uploadedBy: string
  uploadedByName: string
  emailSubject: string | null
  emailFrom: string | null
  emailTo: string | null
  emailCc: string | null
  emailDate: string | null
  emailPreview: string | null
  parseStatus: ParseStatus
  versionGroupId: string | null
  approvalStatus: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface JobDocumentListOptions {
  rootJobId: string
  q?: string
  category?: JobDocumentCategory | string
  kind?: DocumentKindFilter
  scope?: DocumentScopeFilter
  period?: DocumentPeriodFilter
  currentJobId?: string | null
  currentWorkItemId?: string | null
  revisionJobId?: string | null
  workItemId?: string | null
  page?: number
  limit?: number
  includeDeleted?: boolean
}

export interface JobDocumentListResult {
  documents: JobDocumentRow[]
  total: number
  page: number
  limit: number
  pages: number
}

export interface CreateJobDocumentInput {
  id: string
  rootJobId: string
  jobId?: string | null
  parentJobId?: string | null
  workItemId?: string | null
  revisionLetter?: string | null
  filename: string
  originalFilename: string
  mimeType: string
  fileExt: string
  fileSize: number
  category: string
  description?: string | null
  storagePath: string
  uploadedBy: string
  uploadedByName: string
  emailSubject?: string | null
  emailFrom?: string | null
  emailTo?: string | null
  emailCc?: string | null
  emailDate?: string | null
  emailPreview?: string | null
  parseStatus?: ParseStatus
}

export interface UpdateJobDocumentInput {
  filename?: string
  category?: string
  description?: string | null
  jobId?: string | null
  workItemId?: string | null
  revisionLetter?: string | null
}

export interface ParsedEmailMeta {
  subject: string | null
  from: string | null
  to: string | null
  cc: string | null
  date: string | null
  preview: string | null
  ok: boolean
}
