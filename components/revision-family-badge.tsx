import { GitBranch } from "lucide-react"
import { revisionFamilyLabel } from "@/lib/revision-chain"
import { cn } from "@/shared/utils/utils"
import type { Job } from "@/lib/types"

type RevisionFamilyJob = Pick<
  Job,
  "parentJobId" | "revisionLetter" | "hasRevisions" | "revisionCount" | "latestRevisionLetter" | "isLatestInChain"
>

export function RevisionFamilyBadge({
  job,
  size = "sm",
  className,
}: {
  job: RevisionFamilyJob
  size?: "sm" | "xs"
  className?: string
}) {
  const label = revisionFamilyLabel(job)
  if (!label) return null

  const isRevision = job.parentJobId !== null

  return (
    <span
      title={label}
      className={cn(
        "inline-flex items-center gap-1 shrink-0 font-semibold rounded-full border",
        size === "sm"
          ? "text-[10px] px-1.5 py-0.5"
          : "text-[9px] px-1 py-px",
        isRevision
          ? "bg-ac-bg text-ac border-ac/25"
          : "bg-pg text-t2 border-bd",
        className,
      )}
    >
      <GitBranch className={size === "sm" ? "h-3 w-3" : "h-2.5 w-2.5"} />
      {isRevision ? (
        <>
          Rev {job.revisionLetter}
          {job.revisionCount != null && job.revisionCount > 0 && (
            <span className="font-normal text-t3">· {job.revisionCount}</span>
          )}
          {job.isLatestInChain && (
            <span className="font-normal text-ac">latest</span>
          )}
        </>
      ) : (
        <>
          {job.revisionCount} rev{job.revisionCount === 1 ? "" : "s"}
          {job.latestRevisionLetter && (
            <span className="font-normal text-t3">→ {job.latestRevisionLetter}</span>
          )}
        </>
      )}
    </span>
  )
}
