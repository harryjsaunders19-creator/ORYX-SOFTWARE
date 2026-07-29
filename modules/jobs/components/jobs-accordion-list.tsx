"use client"

import { memo, useState } from "react"
import { ChevronDown, GitBranch } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/utils/utils"
import { DrawingNumber } from "@/shared/design/drawing-number"
import { Typography } from "@/shared/design/typography"
import { baseDrawingNumber } from "@/lib/revision-chain"
import { worksTypeDisplayLabel } from "@/lib/constants"
import type { Job } from "@/lib/types"
import {
  AccordionStatus,
  DesignerAvatar,
  RevisionPill,
} from "./jobs-registry-chrome"

export type AccordionJob = Job & { canAddRevision?: boolean }

export const JobsAccordionItem = memo(function JobsAccordionItem({
  job,
  isOnHold,
  open,
  onToggle,
  onOpenJob,
  onEdit,
  onDelete,
  isAdmin,
  onQuickRevision,
  creatingRevision,
}: {
  job: AccordionJob
  isOnHold: boolean
  open: boolean
  onToggle: (id: string) => void
  onOpenJob: (id: string) => void
  onEdit: (job: AccordionJob) => void
  onDelete?: (job: AccordionJob) => void
  isAdmin?: boolean
  onQuickRevision?: (job: AccordionJob) => void
  creatingRevision?: boolean
}) {
  const revLetter = job.currentRevisionLetter ?? job.latestRevisionLetter ?? job.revisionLetter
  const drawing = baseDrawingNumber(job.drawingNumber)
  const project = job.siteName || job.address
  const fullAddress = job.siteAddress || job.address
  const works = worksTypeDisplayLabel(job.typeOfWorks, job.customTypeDescription)

  return (
    <div
      className={cn(
        "bg-sr border border-bd rounded-md shadow-sm overflow-hidden",
        open && "ring-1 ring-bd",
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(job.id)}
        className={cn(
          "w-full text-left grid grid-cols-12 gap-2 items-center px-4 py-3",
          "hover:bg-surface-low transition-colors",
        )}
        aria-expanded={open}
      >
        <div className="col-span-12 md:col-span-2 min-w-0">
          <DrawingNumber className={cn(Typography.Badge, "text-t1")}>
            {drawing}
          </DrawingNumber>
        </div>
        <div className="hidden md:block md:col-span-1">
          <RevisionPill letter={revLetter} emphasized={!!revLetter && revLetter !== "A"} />
        </div>
        <div className="col-span-12 md:col-span-4 min-w-0 mt-1 md:mt-0">
          <p className={cn(Typography.Body, "font-bold text-t1 truncate")}>{project}</p>
          <p className="text-[10px] text-t3 truncate leading-tight mt-0.5">
            {job.clientCompany}
            {revLetter && (
              <span className="md:hidden">
                {" · "}
                <RevisionPill letter={revLetter} emphasized={!!revLetter && revLetter !== "A"} />
              </span>
            )}
          </p>
        </div>
        <div className="col-span-8 md:col-span-2 mt-2 md:mt-0 min-w-0">
          <AccordionStatus status={job.status} isOnHold={isOnHold} />
        </div>
        <div className="hidden md:flex md:col-span-2 items-center gap-1.5 min-w-0">
          <DesignerAvatar name={job.designer} />
          <span className={cn(Typography.Badge, "text-t3 truncate")}>
            {job.designer || "Unassigned"}
          </span>
        </div>
        <div className="col-span-4 md:col-span-1 flex justify-end">
          <ChevronDown
            className={cn(
              "h-4 w-4 text-t3 transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 border-t border-bd/40 bg-pg/40 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div>
            <p className={cn(Typography.Label, "text-t3 uppercase tracking-wide mb-1")}>
              Full site address
            </p>
            <p className={cn(Typography.Body, "text-t1")}>{fullAddress || "—"}</p>
          </div>
          <div>
            <p className={cn(Typography.Label, "text-t3 uppercase tracking-wide mb-1")}>
              Type of works
            </p>
            {works ? (
              <span className={cn(Typography.Badge, "inline-flex px-1.5 py-0.5 rounded-sm bg-surface-low text-t2")}>
                {works}
              </span>
            ) : (
              <span className={cn(Typography.Helper, "text-t4 italic")}>—</span>
            )}
          </div>
          <div>
            <p className={cn(Typography.Label, "text-t3 uppercase tracking-wide mb-1")}>
              Requester
            </p>
            <p className={cn(Typography.Body, "text-t1")}>
              {job.requestedBy || <span className="text-t4 italic">—</span>}
            </p>
            {job.designer && (
              <p className={cn(Typography.Helper, "text-t3 mt-1 md:hidden")}>
                Designer: {job.designer}
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-start lg:justify-end items-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenJob(job.id)}>
              View job
            </Button>
            <Button variant="primary" size="sm" onClick={() => onEdit(job)}>
              Edit job
            </Button>
            {job.canAddRevision && onQuickRevision && (
              <Button
                variant="outline"
                size="sm"
                loading={creatingRevision}
                onClick={() => onQuickRevision(job)}
              >
                <GitBranch className="h-3.5 w-3.5" />
                Add revision
              </Button>
            )}
            {isAdmin && onDelete && (
              <Button variant="danger" size="sm" onClick={() => onDelete(job)}>
                Cancel job
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
})

export function JobsAccordionList({
  jobs,
  holdClientIds,
  expandedId,
  onToggle,
  onOpenJob,
  onEdit,
  onDelete,
  isAdmin,
  onQuickRevision,
  creatingRevisionFor,
  loading,
  empty,
  layout = "list",
}: {
  jobs: AccordionJob[]
  holdClientIds: Set<string>
  expandedId: string | null
  onToggle: (id: string) => void
  onOpenJob: (id: string) => void
  onEdit: (job: AccordionJob) => void
  onDelete?: (job: AccordionJob) => void
  isAdmin?: boolean
  onQuickRevision: (job: AccordionJob) => void
  creatingRevisionFor: string | null
  loading?: boolean
  empty?: React.ReactNode
  layout?: "list" | "grid"
}) {
  if (loading) {
    return (
      <div className={cn(layout === "grid" ? "grid grid-cols-1 lg:grid-cols-2 gap-2" : "space-y-2")}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded-md border border-bd bg-sr skeleton" />
        ))}
      </div>
    )
  }

  if (jobs.length === 0) {
    return <>{empty}</>
  }

  return (
    <div className={cn(layout === "grid" ? "grid grid-cols-1 lg:grid-cols-2 gap-2" : "space-y-2")}>
      {jobs.map(job => (
        <JobsAccordionItem
          key={job.id}
          job={job}
          isOnHold={!!(job.clientId && holdClientIds.has(job.clientId))}
          open={expandedId === job.id}
          onToggle={onToggle}
          onOpenJob={onOpenJob}
          onEdit={onEdit}
          onDelete={onDelete}
          isAdmin={isAdmin}
          onQuickRevision={onQuickRevision}
          creatingRevision={creatingRevisionFor === job.id}
        />
      ))}
    </div>
  )
}

/** Controlled expand helper — one open row at a time (Stitch accordion feel). */
export function useAccordionExpand() {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const onToggle = (id: string) => {
    setExpandedId(cur => (cur === id ? null : id))
  }
  return { expandedId, onToggle, setExpandedId }
}
