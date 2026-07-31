/**
 * Jobs Register visual tokens — mirrored from the Stitch export
 * `stitch_minimalist_monochrome_job_card` (ORYX OS | Engineering Hub · Job List).
 * Design system: Industrial Mono Refined. Inspector rail: 480px.
 */
/** Stitch Final registry row height (py-5 denser list). */
export const REGISTER_ROW_H = 72
/** Desktop: list flexes; inspector is a fixed 480px rail. */
export const REGISTER_PCT = 65
export const INSPECTOR_PCT = 35
/** Stitch Final inspector rail width. */
export const INSPECTOR_W = 480

export const WORKFLOW_STAGES = [
  { id: "created", label: "Revision Created" },
  { id: "uploaded", label: "Drawing Uploaded" },
  { id: "checking", label: "Internal Check" },
  { id: "issued", label: "Client Issue" },
  { id: "invoiced", label: "Invoice Raised" },
] as const

export type WorkflowStageId = (typeof WORKFLOW_STAGES)[number]["id"]

export type ProjectHealthTone = "ok" | "warn" | "danger" | "neutral"

export type CurrentWorkType = "original" | "revision" | "none"

export interface JobsRegisterProject {
  id: string
  /** Id of the current work item to PATCH for status (revision or original). */
  detailId: string
  kind: "job" | "work_item"
  drawingNumber: string
  clientCompany: string
  siteId: string | null
  siteName: string | null
  address: string
  currentRevisionLetter: string | null
  /** Derived current-work status (operational). */
  currentStatus: string
  nextAction: string
  value: number | null
  designer: string
  requiredByDate: string | null
  revisionCount: number
  updatedAt: string
  canAddRevision: boolean
  clientId: string | null
  typeOfWorks: string | null
  /** Parent completion date when available (ISO). */
  dateCompleted: string | null
  /** Parent/original design workflow status (independent of current revision). */
  projectStatus: string
  /** Derived current-work classification. */
  currentWorkType: CurrentWorkType
  /** Register label: REV C | ORIGINAL | COMPLETE */
  currentWorkLabel: string
  /** Human subtitle under the label when fully closed. */
  currentWorkDetail: string
  /** Linked quotation summary when available from list enrichment. */
  currentQuote: {
    id: string
    quoteNumber: string
    quoteValue: number
    status: string
  } | null
}

export type JobsRegisterScope = "all" | "active" | "completed" | "with_active_revision"
