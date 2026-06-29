import { cn } from "@/lib/utils"
import { getJobStatus } from "@/lib/constants"

// Status taxonomy: New Request (grey) / In Progress (yellow) / Requires Checking
// (amber) / Ready to Send (sky blue) / Complete (green).
export const JOB_BADGE_CLASSES: Record<string, string> = {
  NEW_REQUEST:   "bg-gy-bg text-gy-tx border border-gy-bd",
  IN_DESIGN:     "bg-yl-bg text-yl-tx border border-yl-bd",
  CHECKING:      "bg-wn-bg text-wn-tx border border-wn-bd",
  READY_TO_SEND: "bg-rs-bg text-rs-tx border border-rs-bd",
  ISSUED:        "bg-ok-bg text-ok-tx border border-ok-bd",
}

// Row background tints — dedicated *-row tokens (globals.css), full opacity.
export const JOB_ROW_BG: Record<string, string> = {
  NEW_REQUEST:   "bg-gy-row",
  IN_DESIGN:     "bg-yl-row",
  CHECKING:      "bg-wn-row",
  READY_TO_SEND: "bg-rs-row",
  ISSUED:        "bg-ok-row",
}

// Left-edge stripe gives instant status recognition even before reading the badge.
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

const pill = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap border shadow-sm"

// Larger variant for the jobs table — completion status should be the most
// scannable element in each row.
const pillLg = "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-bold whitespace-nowrap border shadow-sm"

export function StatusBadge({ status, size = "md" }: { status: string; size?: "md" | "lg" }) {
  const s = getJobStatus(status)
  const cls = JOB_BADGE_CLASSES[status] ?? JOB_BADGE_CLASSES.NEW_REQUEST
  const dot = STATUS_DOT[status] ?? STATUS_DOT.NEW_REQUEST
  const dotCls = cn(
    "rounded-full shrink-0 ring-2 ring-sr/80",
    size === "lg" ? "h-2.5 w-2.5" : "h-2 w-2",
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
