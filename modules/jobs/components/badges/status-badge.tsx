import { cn } from "@/shared/utils"
import {
  getDrawingStatusBadgeClass,
  getDrawingStatusColour,
} from "@/modules/jobs/lib/drawing-status-colours"
import { DrawingStatusBadge } from "@/modules/jobs/components/drawing-status-badge"

/**
 * Compact badge classes — coloured text + light tint.
 * Prefer DrawingStatusBadge / getDrawingStatusColour for new Jobs UI.
 */
export const JOB_BADGE_CLASSES: Record<string, string> = {
  NEW_REQUEST: getDrawingStatusBadgeClass("NEW_REQUEST"),
  IN_DESIGN: getDrawingStatusBadgeClass("IN_DESIGN"),
  CHECKING: getDrawingStatusBadgeClass("CHECKING"),
  READY_TO_SEND: getDrawingStatusBadgeClass("READY_TO_SEND"),
  ISSUED: getDrawingStatusBadgeClass("ISSUED"),
}

/**
 * @deprecated Full-row status backgrounds are removed — use Drawing Status
 * text/dot colouring instead. Kept as empty map so legacy className joins
 * remain harmless.
 */
export const JOB_ROW_BG: Record<string, string> = {
  NEW_REQUEST: "",
  IN_DESIGN: "",
  CHECKING: "",
  READY_TO_SEND: "",
  ISSUED: "",
}

/**
 * @deprecated Prefer selection/hover borders only; status colour lives on
 * Drawing Status text, not the row edge.
 */
export const JOB_ROW_BORDER: Record<string, string> = {
  NEW_REQUEST: "",
  IN_DESIGN: "",
  CHECKING: "",
  READY_TO_SEND: "",
  ISSUED: "",
}

export const STATUS_DOT: Record<string, string> = {
  NEW_REQUEST: getDrawingStatusColour("NEW_REQUEST").dot,
  IN_DESIGN: getDrawingStatusColour("IN_DESIGN").dot,
  CHECKING: getDrawingStatusColour("CHECKING").dot,
  READY_TO_SEND: getDrawingStatusColour("READY_TO_SEND").dot,
  ISSUED: getDrawingStatusColour("ISSUED").dot,
}

/**
 * Status colour communicates workflow meaning only (ISO / ops scanning).
 * Uses the shared Drawing Status colour map — text + dot + light tint.
 */
export function StatusBadge({ status, size = "md", className }: {
  status: string
  size?: "md" | "lg"
  className?: string
}) {
  return <DrawingStatusBadge status={status} size={size} className={className} />
}

/** Class string for non-React consumers. */
export function statusBadgeClassNames(status: string): string {
  const colour = getDrawingStatusColour(status)
  return cn(
    "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 whitespace-nowrap font-medium",
    getDrawingStatusBadgeClass(status),
    colour.text,
  )
}
