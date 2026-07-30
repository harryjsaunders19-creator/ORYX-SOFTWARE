/**
 * Jobs Register visual tokens — mirrored from Stitch
 * "Jobs - Command Center (Inter Typography)" / Project Command Center Split View.
 * Screen ids: f313bb87a8a3426190f85fd4b8cb6ef7, 46351d0bec1f43faa32bc5136f955565
 */
export const REGISTER_ROW_H = 68
/** Desktop split: register ~63% / inspector ~37%. */
export const REGISTER_PCT = 63
export const INSPECTOR_PCT = 37
/** @deprecated Prefer percentage split; kept for callers. */
export const INSPECTOR_W = 420

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
