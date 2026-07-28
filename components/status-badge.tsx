import { cn } from "@/lib/utils"
import { getJobStatus } from "@/lib/constants"
import { Typography } from "@/shared/design/typography"

/**
 * Status colour communicates workflow meaning only (ISO / ops scanning).
 * Chrome stays restrained — no decorative shadows or oversized pills.
 */
export const JOB_BADGE_CLASSES: Record<string, string> = {
  NEW_REQUEST:   "bg-gy-bg text-gy-tx border border-gy-bd",
  IN_DESIGN:     "bg-yl-bg text-yl-tx border border-yl-bd",
  CHECKING:      "bg-wn-bg text-wn-tx border border-wn-bd",
  READY_TO_SEND: "bg-rs-bg text-rs-tx border border-rs-bd",
  ISSUED:        "bg-ok-bg text-ok-tx border border-ok-bd",
}

export const JOB_ROW_BG: Record<string, string> = {
  NEW_REQUEST:   "bg-gy-row",
  IN_DESIGN:     "bg-yl-row",
  CHECKING:      "bg-wn-row",
  READY_TO_SEND: "bg-rs-row",
  ISSUED:        "bg-ok-row",
}

export const JOB_ROW_BORDER: Record<string, string> = {
  NEW_REQUEST:   "border-l-[3px] border-l-gy-bd",
  IN_DESIGN:     "border-l-[3px] border-l-yl",
  CHECKING:      "border-l-[3px] border-l-wn-ic",
  READY_TO_SEND: "border-l-[3px] border-l-rs-ic",
  ISSUED:        "border-l-[3px] border-l-ok-ic",
}

export const STATUS_DOT: Record<string, string> = {
  NEW_REQUEST:   "bg-gy",
  IN_DESIGN:     "bg-yl",
  CHECKING:      "bg-wn-ic",
  READY_TO_SEND: "bg-rs-ic",
  ISSUED:        "bg-ok-ic",
}

const pill = cn(
  "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 whitespace-nowrap border",
  Typography.Badge,
)

const pillLg = cn(
  "inline-flex items-center gap-2 rounded-md px-2.5 py-1 whitespace-nowrap border",
  Typography.Badge,
)

export function StatusBadge({ status, size = "md" }: { status: string; size?: "md" | "lg" }) {
  const s = getJobStatus(status)
  const cls = JOB_BADGE_CLASSES[status] ?? JOB_BADGE_CLASSES.NEW_REQUEST
  const dot = STATUS_DOT[status] ?? STATUS_DOT.NEW_REQUEST
  const dotCls = cn(
    "rounded-full shrink-0",
    size === "lg" ? "h-2 w-2" : "h-1.5 w-1.5",
    dot,
  )
  if (size === "lg") {
    return (
      <span className={cn(pillLg, cls)}>
        <span className={dotCls} aria-hidden />
        {s.label}
      </span>
    )
  }
  return (
    <span className={cn(pill, cls)}>
      <span className={dotCls} aria-hidden />
      {s.label}
    </span>
  )
}
