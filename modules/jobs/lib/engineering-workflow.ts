/**
 * Engineering workflow stages derived from Drawing Status.
 * Not persisted — UI-only mapping over existing status values.
 */

export type EngineeringStageId =
  | "request"
  | "design"
  | "check"
  | "issue"
  | "complete"

export type EngineeringStage = {
  id: EngineeringStageId
  label: string
  /** Compact register / chip label */
  shortLabel: string
}

export const ENGINEERING_STAGES: readonly EngineeringStage[] = [
  { id: "request", label: "Request", shortLabel: "Request" },
  { id: "design", label: "Design", shortLabel: "Design" },
  { id: "check", label: "Check", shortLabel: "Check" },
  { id: "issue", label: "Issue", shortLabel: "Issue" },
  { id: "complete", label: "Complete", shortLabel: "Complete" },
] as const

const STAGE_BY_ID = Object.fromEntries(
  ENGINEERING_STAGES.map(s => [s.id, s]),
) as Record<EngineeringStageId, EngineeringStage>

/** Semantic colour tokens for the active engineering stage. */
export const ENGINEERING_STAGE_COLOUR: Record<
  EngineeringStageId,
  { text: string; dot: string; tint: string }
> = {
  request: { text: "text-ac2", dot: "bg-ac2", tint: "bg-ac2-bg" },
  design: { text: "text-rs-tx", dot: "bg-rs-ic", tint: "bg-rs-bg" },
  check: { text: "text-tag-revision", dot: "bg-tag-revision", tint: "bg-tag-revision-bg" },
  issue: { text: "text-wn-tx", dot: "bg-wn-ic", tint: "bg-wn-bg" },
  complete: { text: "text-ok-tx", dot: "bg-ok-ic", tint: "bg-ok-bg" },
}

/**
 * Map Drawing Status → engineering lifecycle stage.
 * Closed / no active drawing work resolves to Complete.
 */
export function getEngineeringStageFromDrawingStatus(
  status: string | null | undefined,
  options?: { closed?: boolean },
): EngineeringStage {
  if (options?.closed) return STAGE_BY_ID.complete

  switch (String(status || "").toUpperCase()) {
    case "NEW_REQUEST":
      return STAGE_BY_ID.request
    case "IN_DESIGN":
      return STAGE_BY_ID.design
    case "CHECKING":
      return STAGE_BY_ID.check
    case "READY_TO_SEND":
      return STAGE_BY_ID.issue
    case "ISSUED":
      return STAGE_BY_ID.complete
    default:
      return STAGE_BY_ID.request
  }
}

/** Human label for the active drawing (Original / Rev C). */
export function engineeringDrawingLabel(input: {
  currentWorkType: "original" | "revision" | "none" | string
  revisionLetter?: string | null
  currentWorkLabel?: string | null
}): string {
  if (input.currentWorkType === "revision") {
    const fromLabel = input.currentWorkLabel?.trim()
    if (fromLabel) return fromLabel
    const letter = input.revisionLetter?.trim()
    return letter ? `Rev ${letter.toUpperCase()}` : "Revision"
  }
  if (input.currentWorkType === "none") return "Complete"
  return "Original"
}
