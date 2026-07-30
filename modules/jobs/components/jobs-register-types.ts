/** Normalized project row for the Jobs Register (one row per project). */

export type ProjectHealthTone = "ok" | "warn" | "danger" | "neutral"

export interface JobsRegisterProject {
  /** Stable project id used for selection + workspace navigation. */
  id: string
  /** Classic job id or work-item id used for revision/document APIs when different. */
  detailId: string
  kind: "job" | "work_item"
  drawingNumber: string
  clientCompany: string
  siteName: string | null
  address: string
  currentRevisionLetter: string | null
  currentStatus: string
  /** Human next-action label derived from status / deadlines. */
  nextAction: string
  value: number | null
  designer: string
  requiredByDate: string | null
  revisionCount: number
  updatedAt: string
  canAddRevision: boolean
  clientId: string | null
  typeOfWorks: string | null
  projectStatus: string
}

export interface JobsRegisterScope {
  /** All | Active | Completed | Awaiting Client */
  scope: "all" | "active" | "completed" | "awaiting_client"
}

export const REGISTER_ROW_H = 56
export const INSPECTOR_W = 420

export const WORKFLOW_STAGES = [
  { id: "created", label: "Revision Created" },
  { id: "uploaded", label: "Drawing Uploaded" },
  { id: "checking", label: "Internal Check" },
  { id: "issued", label: "Client Issue" },
  { id: "invoiced", label: "Invoice Raised" },
] as const

export type WorkflowStageId = (typeof WORKFLOW_STAGES)[number]["id"]
