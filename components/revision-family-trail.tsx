"use client"
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { GitBranch, Loader2 } from "lucide-react"
import { StatusBadge } from "@/components/status-badge"
import { baseDrawingNumber, revisionParentId } from "@/lib/revision-chain"
import { REVISIONS_CHANGED } from "@/lib/revision-events"
import { cn } from "@/shared/utils/utils"
import type { Job } from "@/lib/types"

interface Props {
  job: Job
  parentJob?: Job | null
}

type ChainMember = {
  id: string
  drawingNumber: string
  revisionLetter: string | null
  status: string
  isOriginal: boolean
}

export function RevisionFamilyTrail({ job, parentJob = null }: Props) {
  const pathname = usePathname()
  const parentId = revisionParentId(job)
  const original = parentJob ?? (job.parentJobId === null ? job : null)

  const [revisions, setRevisions] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${job.id}/revisions`, { cache: "no-store" })
      if (!res.ok) return
      const { revisions: revs } = await res.json() as { revisions: Job[] }
      setRevisions(revs)
    } finally {
      setLoading(false)
    }
  }, [job.id])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load, pathname])

  useEffect(() => {
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ parentJobId: string }>).detail
      if (detail?.parentJobId === parentId) load()
    }
    window.addEventListener(REVISIONS_CHANGED, onChanged)
    return () => window.removeEventListener(REVISIONS_CHANGED, onChanged)
  }, [load, parentId])

  if (loading) {
    return (
      <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl border border-bd bg-pg text-xs text-t4">
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
        Loading revision family…
      </div>
    )
  }

  if (!original && revisions.length === 0) return null

  const chain: ChainMember[] = []
  if (original) {
    chain.push({
      id: original.id,
      drawingNumber: original.drawingNumber,
      revisionLetter: null,
      status: original.status,
      isOriginal: true,
    })
  }
  for (const rev of revisions) {
    chain.push({
      id: rev.id,
      drawingNumber: rev.drawingNumber,
      revisionLetter: rev.revisionLetter,
      status: rev.status,
      isOriginal: false,
    })
  }

  if (chain.length <= 1 && revisions.length === 0) return null

  const base = original ? baseDrawingNumber(original.drawingNumber) : baseDrawingNumber(job.drawingNumber)

  return (
    <div className="mb-4 rounded-xl border border-bd bg-sr shadow-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-bd bg-pg/60">
        <GitBranch className="h-3.5 w-3.5 text-ac shrink-0" />
        <p className="text-xs font-semibold text-t1">
          Revision family
          <span className="font-mono font-normal text-t3 ml-2">{base}</span>
        </p>
        <span className="ml-auto text-[10px] text-t4 tabular-nums">
          {chain.length} job{chain.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex items-stretch gap-1.5 overflow-x-auto px-3 py-2.5">
        {chain.map((member, index) => {
          const isCurrent = member.id === job.id
          return (
            <div key={member.id} className="flex items-center gap-1.5 shrink-0">
              {index > 0 && (
                <span className="text-t4 text-xs select-none" aria-hidden>→</span>
              )}
              <Link
                href={`/jobs/${member.id}`}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border px-2.5 py-2 min-w-[108px] transition-colors",
                  isCurrent
                    ? "border-ac bg-ac-bg shadow-sm"
                    : "border-bd bg-pg hover:border-ac/40 hover:bg-surface-low",
                )}
                aria-current={isCurrent ? "page" : undefined}
              >
                <span className="flex items-center gap-1.5">
                  <span className={cn(
                    "text-[10px] font-bold uppercase tracking-wide",
                    isCurrent ? "text-ac" : "text-t3",
                  )}>
                    {member.isOriginal ? "Original" : `Rev ${member.revisionLetter}`}
                  </span>
                  {isCurrent && (
                    <span className="text-[9px] font-semibold px-1.5 py-px rounded-full bg-ac text-on-ac">
                      viewing
                    </span>
                  )}
                </span>
                <span className={cn(
                  "font-mono text-[11px] font-semibold truncate max-w-[140px]",
                  isCurrent ? "text-ac" : "text-t2",
                )}>
                  {member.drawingNumber}
                </span>
                <StatusBadge status={member.status} />
              </Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}
