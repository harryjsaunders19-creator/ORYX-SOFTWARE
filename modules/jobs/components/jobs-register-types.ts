/**
 * Jobs Register visual tokens — mirrored from Stitch
 * "Jobs - Command Center (Inter Typography)" / Project Command Center Split View.
 * Screen ids: f313bb87a8a3426190f85fd4b8cb6ef7, 46351d0bec1f43faa32bc5136f955565
 */
export const REGISTER_ROW_H = 64
/** Stitch uses w-[65%] / w-[35%] of the main canvas (after sidebar). */
export const REGISTER_PCT = 65
export const INSPECTOR_PCT = 35
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

export interface JobsRegisterProject {
  id: string
  detailId: string
  kind: "job" | "work_item"
  drawingNumber: string
  clientCompany: string
  siteName: string | null
  address: string
  currentRevisionLetter: string | null
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
  /** Parent/project workflow status (independent of current revision). */
  projectStatus: string
}

export type JobsRegisterScope = "all" | "active" | "completed"
