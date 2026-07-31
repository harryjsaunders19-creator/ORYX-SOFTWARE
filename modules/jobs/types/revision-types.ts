import type { Job } from "@/lib/types"

/** One row in the revision history timeline (original + each revision). */
export interface RevisionHistoryEntry {
  id: string
  drawingNumber: string
  revisionLetter: string | null
  isOriginal: boolean
  isCurrent: boolean
  /** Display title, e.g. "Original Issue", "Rev B", "Current Revision — Rev D". */
  title: string
  dateCreated: string
  notes: string | null
  status: string
  designer: string | null
  /** Person who moved the job to ISSUED (from status history). */
  issuedBy: string | null
  issuedAt: string | null
  billable: boolean
  /** Target due date for this revision (YYYY-MM-DD). */
  requiredByDate: string | null
  quoteValue?: number | null
}

export interface RevisionFamilyResponse {
  parentId: string
  baseDrawingNumber: string
  original: Job
  revisions: Job[]
  chain: RevisionHistoryEntry[]
  canAddRevision: boolean
  nextRevisionLetter: string | null
}
