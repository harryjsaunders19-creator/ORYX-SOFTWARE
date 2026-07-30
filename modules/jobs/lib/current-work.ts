/**
 * Current Work derivation — operational view for the Jobs Register / Inspector.
 *
 * Concepts (kept separate):
 * - Original design status  → parent/original record only
 * - Revision status         → each revision independently
 * - Current work            → derived: which item needs attention now
 *
 * Creating a revision must never reopen or overwrite the original design status.
 */

import { compareRevisionLetters } from "@/lib/revision-chain"
import { getJobStatus } from "@/lib/constants"

/** Closed / complete engineering status in ORYX (JOB_STATUSES). */
export const COMPLETE_STATUS = "ISSUED"

export type CurrentWorkType = "original" | "revision" | "none"

export type CurrentWorkItem = {
  type: CurrentWorkType
  id: string | null
  revisionLabel: string | null
  status: string
  displayLabel: string
  dueDate: string | null
  designerId: string | null
  checkerId: string | null
  isActive: boolean
  /** True when more than one non-complete revision exists (data integrity). */
  multipleActiveWarning?: boolean
}

export type CurrentWorkRevisionLike = {
  id: string
  revisionLetter?: string | null
  status: string
  requiredByDate?: string | null
  designer?: string | null
  /** Optional updatedAt for stable tie-breaks */
  updatedAt?: string | null
}

export type CurrentWorkProjectLike = {
  id: string
  status: string
  requiredByDate?: string | null
  designer?: string | null
}

export function isCompleteStatus(status: string | null | undefined): boolean {
  return status === COMPLETE_STATUS
}

export function isActiveStatus(status: string | null | undefined): boolean {
  return Boolean(status) && !isCompleteStatus(status)
}

function revisionLabel(letter: string | null | undefined): string {
  if (!letter) return "ORIGINAL"
  const n = letter.trim().toUpperCase()
  if (!n) return "ORIGINAL"
  return n.startsWith("REV") ? n : `REV ${n}`
}

function statusDisplayLabel(status: string): string {
  if (!status) return "Unknown"
  if (isCompleteStatus(status)) return "Complete"
  return getJobStatus(status).label
}

/**
 * Among active revisions, pick the latest by revision letter sequence
 * (not alphabetical string sort of full labels).
 */
export function pickLatestActiveRevision(
  revisions: CurrentWorkRevisionLike[],
): { revision: CurrentWorkRevisionLike | null; multipleActive: boolean } {
  const active = revisions.filter(r => isActiveStatus(r.status))
  if (active.length === 0) return { revision: null, multipleActive: false }

  const sorted = [...active].sort((a, b) => {
    const byLetter = compareRevisionLetters(a.revisionLetter, b.revisionLetter)
    if (byLetter !== 0) return byLetter
    return String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""))
  })
  return {
    revision: sorted[sorted.length - 1] ?? null,
    multipleActive: active.length > 1,
  }
}

/**
 * Derive the operational current-work item for a parent project.
 *
 * Priority:
 * 1. Active (non-complete) revision — latest by revision sequence
 * 2. Else active original design
 * 3. Else none (fully closed)
 */
export function getCurrentWorkItem(
  project: CurrentWorkProjectLike,
  revisions: CurrentWorkRevisionLike[] = [],
): CurrentWorkItem {
  const { revision, multipleActive } = pickLatestActiveRevision(revisions)

  if (revision) {
    return {
      type: "revision",
      id: revision.id,
      revisionLabel: revisionLabel(revision.revisionLetter),
      status: revision.status,
      displayLabel: statusDisplayLabel(revision.status),
      dueDate: revision.requiredByDate ?? null,
      designerId: revision.designer ?? null,
      checkerId: null,
      isActive: true,
      multipleActiveWarning: multipleActive,
    }
  }

  if (isActiveStatus(project.status)) {
    return {
      type: "original",
      id: project.id,
      revisionLabel: "ORIGINAL",
      status: project.status,
      displayLabel: statusDisplayLabel(project.status),
      dueDate: project.requiredByDate ?? null,
      designerId: project.designer ?? null,
      checkerId: null,
      isActive: true,
    }
  }

  return {
    type: "none",
    id: null,
    revisionLabel: "COMPLETE",
    status: COMPLETE_STATUS,
    displayLabel: "No Active Work",
    dueDate: null,
    designerId: null,
    checkerId: null,
    isActive: false,
  }
}

export function getCurrentWorkStatus(
  project: CurrentWorkProjectLike,
  revisions: CurrentWorkRevisionLike[] = [],
): string {
  return getCurrentWorkItem(project, revisions).status
}

export function isProjectOperationallyActive(
  project: CurrentWorkProjectLike,
  revisions: CurrentWorkRevisionLike[] = [],
): boolean {
  return getCurrentWorkItem(project, revisions).isActive
}

export function isProjectFullyClosed(
  project: CurrentWorkProjectLike,
  revisions: CurrentWorkRevisionLike[] = [],
): boolean {
  if (isActiveStatus(project.status)) return false
  return revisions.every(r => isCompleteStatus(r.status))
}

/** Aria / menu title clarifying which lifecycle is being edited. */
export function statusChangeTitle(
  workItemType: "original" | "revision",
  revisionLabelText?: string | null,
): string {
  if (workItemType === "original") return "Change original design status"
  const label = revisionLabelText?.trim()
  if (label) {
    const pretty = label.toUpperCase().startsWith("REV")
      ? label
      : `Revision ${label}`
    return `Change ${pretty} status`
  }
  return "Change revision status"
}

/**
 * Build a synthetic revisions list from list-API overlay fields when the
 * full revision chain is not loaded (Jobs Register rows).
 */
export function revisionsFromListOverlay(row: {
  id: string
  currentRevisionId?: string | null
  currentRevisionLetter?: string | null
  currentStatus?: string | null
  currentDesigner?: string | null
  currentRequiredByDate?: string | null
  status: string
  designer?: string | null
  requiredByDate?: string | null
}): CurrentWorkRevisionLike[] {
  const currentId = row.currentRevisionId
  if (!currentId || currentId === row.id) return []
  return [{
    id: currentId,
    revisionLetter: row.currentRevisionLetter ?? null,
    status: row.currentStatus ?? row.status,
    designer: row.currentDesigner ?? row.designer ?? null,
    requiredByDate: row.currentRequiredByDate ?? row.requiredByDate ?? null,
  }]
}
