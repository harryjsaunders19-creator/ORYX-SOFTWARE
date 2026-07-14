import { GitBranch } from "lucide-react"
import { cn } from "@/shared/utils/utils"
import type { Job } from "@/lib/types"

type RevisionFamilyJob = Pick<
  Job,
  | "parentJobId"
  | "revisionLetter"
  | "hasRevisions"
  | "revisionCount"
  | "latestRevisionLetter"
  | "currentRevisionLetter"
>

/** Large current-revision badge for parent cards — one drawing, one badge. */
export function RevisionFamilyBadge({
  job,
  size = "sm",
  className,
}: {
  job: RevisionFamilyJob
  size?: "sm" | "xs"
  className?: string
}) {
  const letter = job.currentRevisionLetter ?? job.latestRevisionLetter ?? job.revisionLetter
  if (!letter && !job.hasRevisions) return null

  const title = letter
    ? `Current revision ${letter}${job.revisionCount ? ` (${job.revisionCount} in history)` : ""}`
    : `${job.revisionCount} revision${job.revisionCount === 1 ? "" : "s"}`

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 shrink-0 font-semibold rounded-full border bg-ac-bg text-ac border-ac/25",
        size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-[9px] px-1 py-px",
        className,
      )}
    >
      <GitBranch className={size === "sm" ? "h-3 w-3" : "h-2.5 w-2.5"} />
      {letter ? (
        <>
          <span className="uppercase tracking-wide text-[9px] font-bold text-t3">Rev</span>
          <span className={size === "sm" ? "text-xs" : "text-[10px]"}>{letter}</span>
        </>
      ) : (
        <span>{job.revisionCount} rev{(job.revisionCount ?? 0) === 1 ? "" : "s"}</span>
      )}
    </span>
  )
}
