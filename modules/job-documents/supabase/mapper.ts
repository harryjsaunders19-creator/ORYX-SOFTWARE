import type { JobDocumentRow, ParseStatus } from "../types"

export interface SupabaseJobDocumentRow {
  id: string
  root_job_id: string
  job_id: string | null
  parent_job_id: string | null
  work_item_id: string | null
  revision_letter: string | null
  filename: string
  original_filename: string
  mime_type: string
  file_ext: string
  file_size: number
  category: string
  description: string | null
  storage_path: string
  uploaded_by: string
  uploaded_by_name: string
  email_subject: string | null
  email_from: string | null
  email_to: string | null
  email_cc: string | null
  email_date: string | null
  email_preview: string | null
  parse_status: string
  version_group_id: string | null
  approval_status: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export function toJobDocumentRow(row: SupabaseJobDocumentRow): JobDocumentRow {
  const parseStatus = (["none", "ok", "failed"].includes(row.parse_status)
    ? row.parse_status
    : "none") as ParseStatus
  return {
    id: row.id,
    rootJobId: row.root_job_id,
    jobId: row.job_id,
    parentJobId: row.parent_job_id,
    workItemId: row.work_item_id,
    revisionLetter: row.revision_letter,
    filename: row.filename,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    fileExt: row.file_ext,
    fileSize: Number(row.file_size) || 0,
    category: row.category,
    description: row.description,
    storagePath: row.storage_path,
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name,
    emailSubject: row.email_subject,
    emailFrom: row.email_from,
    emailTo: row.email_to,
    emailCc: row.email_cc,
    emailDate: row.email_date,
    emailPreview: row.email_preview,
    parseStatus,
    versionGroupId: row.version_group_id,
    approvalStatus: row.approval_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

export function toSupabaseJobDocument(row: JobDocumentRow): SupabaseJobDocumentRow {
  return {
    id: row.id,
    root_job_id: row.rootJobId,
    job_id: row.jobId,
    parent_job_id: row.parentJobId,
    work_item_id: row.workItemId,
    revision_letter: row.revisionLetter,
    filename: row.filename,
    original_filename: row.originalFilename,
    mime_type: row.mimeType,
    file_ext: row.fileExt,
    file_size: row.fileSize,
    category: row.category,
    description: row.description,
    storage_path: row.storagePath,
    uploaded_by: row.uploadedBy,
    uploaded_by_name: row.uploadedByName,
    email_subject: row.emailSubject,
    email_from: row.emailFrom,
    email_to: row.emailTo,
    email_cc: row.emailCc,
    email_date: row.emailDate,
    email_preview: row.emailPreview,
    parse_status: row.parseStatus,
    version_group_id: row.versionGroupId,
    approval_status: row.approvalStatus,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    deleted_at: row.deletedAt,
  }
}
