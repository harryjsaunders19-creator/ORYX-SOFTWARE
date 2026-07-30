import { getJobStatus } from "@/lib/constants"
import { getJobDeadlineInfo } from "@/shared/utils/utils"
import type { Job } from "@/lib/types"
import type { MixedWorkloadRow } from "@/modules/jobs/services/mixed-workload-service"
import type {
  JobsRegisterProject,
  ProjectHealthTone,
  WorkflowStageId,
} from "./jobs-register-types"

/** Derive the engineer-facing next action from current revision status. */
export function deriveNextAction(status: string, requiredByDate?: string | null): string {
  const deadline = getJobDeadlineInfo({ status, requiredByDate })
  if (deadline.isOverdue) return "Overdue — chase"
  if (deadline.isDueToday) return "Due today"
  switch (status) {
    case "NEW_REQUEST":
      return "Start design"
    case "IN_DESIGN":
      return "Continue designing"
    case "CHECKING":
      return "Complete internal check"
    case "READY_TO_SEND":
      return "Issue to client"
    case "ISSUED":
      return "Complete"
    default:
      return getJobStatus(status).label
  }
}

export function deriveProjectHealth(
  status: string,
  requiredByDate?: string | null,
): { label: string; tone: ProjectHealthTone } {
  const deadline = getJobDeadlineInfo({ status, requiredByDate })
  if (status === "ISSUED") return { label: "Complete", tone: "ok" }
  if (deadline.isOverdue) return { label: "Overdue", tone: "danger" }
  if (deadline.isDueToday) return { label: "Due today", tone: "warn" }
  if (deadline.isDueThisWeek) return { label: "Due this week", tone: "warn" }
  if (deadline.daysRemaining != null && deadline.daysRemaining <= 1) {
    return { label: "Due tomorrow", tone: "warn" }
  }
  return { label: "On schedule", tone: "ok" }
}

export function shortStatusLabel(status: string): string {
  switch (status) {
    case "NEW_REQUEST":
      return "New"
    case "IN_DESIGN":
      return "Designing"
    case "CHECKING":
      return "Checking"
    case "READY_TO_SEND":
      return "Awaiting Client"
    case "ISSUED":
      return "Issued"
    default:
      return getJobStatus(status).shortLabel
  }
}

export function revisionBadgeLabel(letter: string | null | undefined): string {
  if (!letter) return "Rev 0"
  return letter.toUpperCase().startsWith("REV") ? letter.toUpperCase() : `Rev ${letter}`
}

/** Map classic job list row (original) → register project. */
export function jobToRegisterProject(job: Job): JobsRegisterProject {
  const status = job.currentStatus ?? job.status
  const due = job.currentRequiredByDate ?? job.requiredByDate
  return {
    id: job.id,
    detailId: job.currentRevisionId ?? job.id,
    kind: "job",
    drawingNumber: job.drawingNumber,
    clientCompany: job.clientCompany,
    siteName: job.siteName,
    address: job.address,
    currentRevisionLetter: job.currentRevisionLetter ?? job.revisionLetter,
    currentStatus: status,
    nextAction: deriveNextAction(status, due),
    value: job.currentQuoteValue ?? job.quoteValue,
    designer: job.currentDesigner ?? job.designer ?? "",
    requiredByDate: due,
    revisionCount: job.revisionCount ?? 0,
    updatedAt: job.updatedAt,
    canAddRevision: job.canAddRevision ?? false,
    clientId: job.clientId,
    typeOfWorks: job.typeOfWorks,
    projectStatus: job.status === "ISSUED" ? "ISSUED" : "IN_DESIGN",
  }
}

/** Map active work-item / mixed workload row → register project. */
export function workItemToRegisterProject(row: MixedWorkloadRow): JobsRegisterProject {
  const status = row.status
  return {
    id: row.parentJobId,
    detailId: row.id,
    kind: row.kind,
    drawingNumber: row.drawingNumber,
    clientCompany: row.clientCompany,
    siteName: row.siteName,
    address: row.address,
    currentRevisionLetter: row.revisionLetter,
    currentStatus: status,
    nextAction: deriveNextAction(status, row.requiredByDate),
    value: row.quoteValue,
    designer: row.designer ?? "",
    requiredByDate: row.requiredByDate,
    revisionCount: row.workType === "REVISION" ? 1 : 0,
    updatedAt: row.updatedAt,
    canAddRevision: status === "ISSUED",
    clientId: null,
    typeOfWorks: null,
    projectStatus: status === "ISSUED" ? "ISSUED" : "IN_DESIGN",
  }
}

/**
 * Data-driven workflow ticks for the current revision.
 * Stages complete automatically from status + document/invoice signals.
 */
export function deriveWorkflowProgress(input: {
  status: string
  hasDrawing: boolean
  invoiceStatus?: string | null
}): { id: WorkflowStageId; done: boolean }[] {
  const { status, hasDrawing, invoiceStatus } = input
  const issued = status === "ISSUED"
  const checkingOrBeyond = ["CHECKING", "READY_TO_SEND", "ISSUED"].includes(status)
  const readyOrBeyond = ["READY_TO_SEND", "ISSUED"].includes(status)
  const invoiced = invoiceStatus === "INVOICED" || invoiceStatus === "READY"

  return [
    { id: "created", done: true },
    { id: "uploaded", done: hasDrawing || checkingOrBeyond || issued },
    { id: "checking", done: checkingOrBeyond },
    { id: "issued", done: readyOrBeyond || issued },
    { id: "invoiced", done: Boolean(invoiced) || (issued && invoiceStatus === "INVOICED") },
  ]
}

export function siteDisplay(siteName: string | null, address: string): string {
  if (siteName?.trim()) return siteName.trim()
  const first = address.split(",")[0]?.trim()
  return first || address || "—"
}
