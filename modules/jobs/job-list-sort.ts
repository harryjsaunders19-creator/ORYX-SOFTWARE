/**
 * Job list sort — originals by drawing number (low → high), revisions
 * immediately after their parent in letter order (A, B, C…).
 */

import { parseOryxDrawingSequence } from "@/lib/drawing-number"

export interface JobListSortRow {
  drawingNumber: string
  parentJobId: string | null
  revisionLetter: string | null
  createdAt?: string
}

/** Base drawing number for grouping (strips " Rev X" suffix). */
export function jobListSortBase(drawingNumber: string): string {
  return drawingNumber.replace(/ Rev [A-Z]$/, "")
}

export function compareJobsForList(
  a: JobListSortRow,
  b: JobListSortRow,
  dir: "asc" | "desc",
): number {
  const baseA = a.parentJobId ? jobListSortBase(a.drawingNumber) : a.drawingNumber
  const baseB = b.parentJobId ? jobListSortBase(b.drawingNumber) : b.drawingNumber

  let cmp = baseA.localeCompare(baseB, undefined, { numeric: true, sensitivity: "base" })
  if (cmp === 0) {
    cmp = (a.revisionLetter ?? "").localeCompare(b.revisionLetter ?? "", undefined, { sensitivity: "base" })
  }
  if (cmp === 0 && a.createdAt && b.createdAt) {
    cmp = a.createdAt.localeCompare(b.createdAt)
  }
  return dir === "asc" ? cmp : -cmp
}

export function sortJobsForList<T extends JobListSortRow>(jobs: T[], dir: "asc" | "desc"): T[] {
  return [...jobs].sort((a, b) => compareJobsForList(a, b, dir)) as T[]
}

export function isDrawingNumberListSort(field: string | undefined): boolean {
  return !field || field === "drawingNumber"
}

/**
 * Zero-padded key for Postgres ORDER BY — matches compareJobsForList ordering.
 * ORYX drawings: `{seq}-{revOrd}`; non-ORYX refs prefixed with Z.
 */
export function computeJobListSortKey(
  drawingNumber: string,
  parentJobId: string | null,
  revisionLetter: string | null,
): string {
  const base = parentJobId ? jobListSortBase(drawingNumber) : drawingNumber
  const seq = parseOryxDrawingSequence(base)
  if (seq != null) {
    const revOrd =
      revisionLetter && /^[A-Z]$/.test(revisionLetter)
        ? revisionLetter.charCodeAt(0) - 64
        : 0
    return `${String(seq).padStart(4, "0")}-${String(revOrd).padStart(2, "0")}`
  }
  const revSuffix = revisionLetter ? `-${revisionLetter}` : ""
  return `Z${base}${revSuffix}`
}
