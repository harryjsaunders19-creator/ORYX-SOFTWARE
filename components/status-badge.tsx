import { cn } from "@/lib/utils"
import { getJobStatus } from "@/lib/constants"

// Status taxonomy: New Request (grey, not started) / In Progress (yellow,
// active work) / Requires Checking (amber, needs attention) / Complete
// (green, done) — a deliberate traffic-light progression. Requires Checking
// and Complete reuse the wn/ok semantic tokens directly: for a status
// specifically, "needs attention" and "done" genuinely are the warning/
// success meaning, not a borrowed colour that happens to look right. New
// Request and In Progress get their own dedicated grey/yellow tokens (gy/yl
// in globals.css) since neither has an existing semantic equivalent.
export const JOB_BADGE_CLASSES: Record<string, string> = {
  NEW_REQUEST: "bg-gy-bg text-gy-tx",
  IN_DESIGN:   "bg-yl-bg text-yl-tx",
  CHECKING:    "bg-wn-bg text-wn-tx",
  ISSUED:      "bg-ok-bg text-ok-tx",
}

// Subtle row background tints for the jobs table — same four tints, used at
// their natural (already very pale) strength so a whole row reads as a quiet
// wash of colour rather than a loud highlight.
export const JOB_ROW_BG: Record<string, string> = {
  NEW_REQUEST: "",                // white (default)
  IN_DESIGN:   "bg-yl-bg/40",
  CHECKING:    "bg-wn-bg/60",
  ISSUED:      "bg-ok-bg/50",
}

export const STATUS_DOT: Record<string, string> = {
  NEW_REQUEST: "bg-gy",
  IN_DESIGN:   "bg-yl",
  CHECKING:    "bg-wn",
  ISSUED:      "bg-ok-ic",
}

const pill = "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap"

// Larger, bolder variant for contexts where status should be the visually
// dominant element in the row (the jobs table) rather than one detail among
// several — a filled dot plus bigger type, still a pill so it still reads as
// a status (not a button or a heading).
const pillLg = "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold whitespace-nowrap"

export function StatusBadge({ status, size = "md" }: { status: string; size?: "md" | "lg" }) {
  const s = getJobStatus(status)
  const cls = JOB_BADGE_CLASSES[status] ?? JOB_BADGE_CLASSES.NEW_REQUEST
  if (size === "lg") {
    return (
      <span className={cn(pillLg, cls)}>
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", STATUS_DOT[status] ?? STATUS_DOT.NEW_REQUEST)} />
        {s.label}
      </span>
    )
  }
  return (
    <span className={cn(pill, cls)}>
      {s.label}
    </span>
  )
}
