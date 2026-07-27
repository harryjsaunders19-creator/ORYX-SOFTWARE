/** Client-safe exports for job documents UI. */
export {
  JOB_DOCUMENT_CATEGORIES,
  JOB_DOC_LIST_PAGE_SIZE,
  JOB_DOC_UPLOAD_CONCURRENCY,
  MAX_JOB_DOC_BYTES,
  documentKind,
  type JobDocumentCategory,
  type DocumentKindFilter,
  type DocumentScopeFilter,
  type DocumentPeriodFilter,
} from "./constants"

export type {
  JobDocumentRow,
  JobDocumentListResult,
  JobDocumentListOptions,
} from "./types"

export { JobDocumentsPanel } from "./components/job-documents-panel"
