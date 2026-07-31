import { getJobStatus } from "@/lib/constants"

/**
 * Shared Drawing Status colour mapping for Jobs Register, inspector,
 * revision history, and status selectors.
 *
 * Prefer coloured text + small dot + optional transparent tint.
 * Do not use these classes on full table rows.
 */
export type DrawingStatusVisual = {
  /** Semantic text colour (theme-aware token). */
  text: string
  /** Small status dot. */
  dot: string
  /** Very light fill for compact badges only. */
  tint: string
}

const DRAWING_STATUS_COLOURS: Record<string, DrawingStatusVisual> = {
  NEW_REQUEST: {
    text: "text-ac2",
    dot: "bg-ac2",
    tint: "bg-ac2-bg",
  },
  IN_DESIGN: {
    text: "text-rs-tx",
    dot: "bg-rs-ic",
    tint: "bg-rs-bg",
  },
  CHECKING: {
    text: "text-tag-revision",
    dot: "bg-tag-revision",
    tint: "bg-tag-revision-bg",
  },
  READY_TO_SEND: {
    text: "text-wn-tx",
    dot: "bg-wn-ic",
    tint: "bg-wn-bg",
  },
  ISSUED: {
    text: "text-ok-tx",
    dot: "bg-ok-ic",
    tint: "bg-ok-bg",
  },
}

/** Derived operational tone — not a stored workflow status. */
export const OVERDUE_STATUS_COLOUR: DrawingStatusVisual = {
  text: "text-dn-tx",
  dot: "bg-dn",
  tint: "bg-dn-bg",
}

const FALLBACK: DrawingStatusVisual = DRAWING_STATUS_COLOURS.NEW_REQUEST

export function getDrawingStatusColour(status: string): DrawingStatusVisual {
  return DRAWING_STATUS_COLOURS[status] ?? FALLBACK
}

export function getDrawingStatusLabel(status: string): string {
  return getJobStatus(status).label
}

/**
 * Compact badge classes with stronger status differentiation:
 * filled soft tint for active work, outline for issued/complete.
 */
export function getDrawingStatusBadgeClass(status: string): string {
  const c = getDrawingStatusColour(status)
  switch (String(status || "").toUpperCase()) {
    case "ISSUED":
      return `${c.text} bg-transparent border border-ok-ic/35`
    case "READY_TO_SEND":
      return `${c.text} ${c.tint} border border-wn-ic/30`
    case "CHECKING":
      return `${c.text} ${c.tint} border border-tag-revision/30`
    case "IN_DESIGN":
      return `${c.text} ${c.tint} border border-rs-ic/20`
    case "NEW_REQUEST":
      return `${c.text} ${c.tint} border border-ac2/25`
    default:
      return `${c.text} ${c.tint} border border-transparent`
  }
}
