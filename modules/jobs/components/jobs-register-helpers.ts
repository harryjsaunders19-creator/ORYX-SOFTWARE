import { getJobStatus } from "@/lib/constants"
import { getJobDeadlineInfo } from "@/shared/utils/utils"
import type { Job } from "@/lib/types"
import type { MixedWorkloadRow } from "@/modules/jobs/services/mixed-workload-service"
import {
  getCurrentWorkItem,
  revisionsFromListOverlay,
  isCompleteStatus,
} from "@/modules/jobs/lib/current-work"
import type {
  JobsRegisterProject,
  ProjectHealthTone,
  WorkflowStageId,
  CurrentWorkType,
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

export function shortStatusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown"
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
  if (typeof letter !== "string" || !letter.trim()) return "Rev 0"
  const normalized = letter.trim().toUpperCase()
  return normalized.startsWith("REV") ? normalized : `Rev ${normalized}`
}

/** Map classic job list row (original) → register project. */
export function jobToRegisterProject(job: Job): JobsRegisterProject {
  const revisions = revisionsFromListOverlay({
    id: job.id,
    currentRevisionId: job.currentRevisionId,
    currentRevisionLetter: job.currentRevisionLetter,
    currentStatus: job.currentStatus,
    currentDesigner: job.currentDesigner,
    currentRequiredByDate: job.currentRequiredByDate,
    status: job.status,
    designer: job.designer,
    requiredByDate: job.requiredByDate,
  })
  const current = getCurrentWorkItem(
    {
      id: job.id,
      status: job.status,
      designer: job.designer,
      requiredByDate: job.requiredByDate,
    },
    revisions,
  )
  const due = current.dueDate
  const status = current.status
  return {
    id: job.id,
    detailId: current.id ?? job.id,
    kind: "job",
    drawingNumber: job.drawingNumber ?? "—",
    clientCompany: job.clientCompany ?? "",
    siteId: job.siteId ?? null,
    siteName: job.siteName,
    address: job.address ?? "",
    currentRevisionLetter:
      current.type === "revision"
        ? (job.currentRevisionLetter ?? job.revisionLetter)
        : null,
    currentStatus: status,
    nextAction:
      current.type === "none"
        ? "No active work"
        : deriveNextAction(status, due),
    value: job.currentQuoteValue ?? job.quoteValue,
    designer: current.designerId ?? job.currentDesigner ?? job.designer ?? "",
    requiredByDate: due,
    revisionCount: job.revisionCount ?? 0,
    updatedAt: job.updatedAt ?? "",
    canAddRevision: job.canAddRevision ?? false,
    clientId: job.clientId,
    typeOfWorks: job.typeOfWorks,
    dateCompleted: job.dateCompleted ?? null,
    projectStatus: job.status,
    currentWorkType: current.type,
    currentWorkLabel: current.revisionLabel ?? "COMPLETE",
    currentWorkDetail:
      current.type === "none" ? "No Active Work" : current.displayLabel,
    currentQuote: job.currentQuote
      ? {
          id: job.currentQuote.id,
          quoteNumber: job.currentQuote.quoteNumber,
          quoteValue: job.currentQuote.quoteValue,
          status: job.currentQuote.status,
        }
      : null,
  }
}

/** Map active work-item / mixed workload row → register project. */
export function workItemToRegisterProject(row: MixedWorkloadRow): JobsRegisterProject {
  const isRevision = row.workType === "REVISION"
  const status = row.status ?? "NEW_REQUEST"
  const complete = isCompleteStatus(status)
  const currentWorkType = complete
    ? "none"
    : isRevision
      ? "revision"
      : "original"
  let label = "ORIGINAL"
  if (complete) label = "COMPLETE"
  else if (isRevision) {
    const letter = row.revisionLetter?.trim()
    label = letter
      ? (letter.toUpperCase().startsWith("REV") ? letter.toUpperCase() : `REV ${letter.toUpperCase()}`)
      : "REV"
  }

  return {
    id: row.parentJobId,
    detailId: row.id,
    kind: row.kind,
    drawingNumber: row.drawingNumber ?? "—",
    clientCompany: row.clientCompany ?? "",
    siteId: row.siteId ?? null,
    siteName: row.siteName,
    address: row.address ?? "",
    currentRevisionLetter: row.revisionLetter,
    currentStatus: status,
    nextAction: complete ? "No active work" : deriveNextAction(status, row.requiredByDate),
    value: row.quoteValue,
    designer: row.designer ?? "",
    requiredByDate: row.requiredByDate,
    revisionCount: isRevision ? 1 : 0,
    updatedAt: row.updatedAt ?? "",
    canAddRevision: complete,
    clientId: null,
    typeOfWorks: null,
    dateCompleted: null,
    // Parent has no status field in work-items model — ORIGINAL work item is the design status.
    // When listing an active revision row, treat original as complete (revisions require issued original).
    projectStatus: isRevision ? "ISSUED" : status,
    currentWorkType,
    currentWorkLabel: label,
    currentWorkDetail: complete ? "No Active Work" : shortStatusLabel(status),
    currentQuote: null,
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

export function siteDisplay(
  siteName: string | null | undefined,
  address: string | null | undefined,
): string {
  if (siteName?.trim()) return siteName.trim()
  const safeAddress = typeof address === "string" ? address.trim() : ""
  if (!safeAddress) return "—"
  const first = safeAddress.split(",")[0]?.trim()
  return first || safeAddress
}

/**
 * Secondary line under the drawing number — useful project context
 * (never redundant "Closed" when Drawing Status already says Complete).
 */
export function drawingNumberContext(project: {
  currentRevisionLetter: string | null
  currentWorkType: CurrentWorkType | string
  revisionCount: number
  dateCompleted?: string | null
  typeOfWorks?: string | null
}): string {
  const letter = project.currentRevisionLetter?.trim()
  if (letter) {
    return revisionBadgeLabel(letter)
  }
  if (project.revisionCount > 0) {
    return project.revisionCount === 1
      ? "1 revision"
      : `${project.revisionCount} revisions`
  }
  const completed = project.dateCompleted?.trim()
  if (completed) {
    const d = new Date(completed)
    if (!Number.isNaN(d.getTime())) {
      return `Completed ${d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}`
    }
  }
  const works = project.typeOfWorks?.trim()
  if (works) return works
  if (project.currentWorkType === "original") return "Original only"
  return "Original design"
}

/** Prefer a readable empty-state label over a bare em dash. */
export function missingLabel(
  value: string | null | undefined,
  fallback: string,
): string {
  if (value == null) return fallback
  const trimmed = String(value).trim()
  if (!trimmed || trimmed === "—" || trimmed === "-") return fallback
  return trimmed
}
