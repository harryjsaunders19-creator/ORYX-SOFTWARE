"use client"

import { memo } from "react"
import { cn, formatGBP } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"
import { StatusBadge } from "@/modules/jobs/components/badges/status-badge"
import {
  revisionBadgeLabel,
  shortStatusLabel,
  siteDisplay,
} from "./jobs-register-helpers"
import type { JobsRegisterProject } from "./jobs-register-types"
import { REGISTER_ROW_H } from "./jobs-register-types"

interface JobsRegisterRowProps {
  project: JobsRegisterProject
  selected: boolean
  style?: React.CSSProperties
  onSelect: (id: string) => void
}

export const JobsRegisterRow = memo(function JobsRegisterRow({
  project,
  selected,
  style,
  onSelect,
}: JobsRegisterRowProps) {
  const site = siteDisplay(project.siteName, project.address)

  return (
    <div
      role="row"
      aria-selected={selected}
      tabIndex={-1}
      data-selected={selected ? "true" : undefined}
      style={{ ...style, height: REGISTER_ROW_H }}
      onClick={() => onSelect(project.id)}
      onKeyDown={e => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault()
          onSelect(project.id)
        }
      }}
      className={cn(
        "group grid grid-cols-[minmax(140px,1.1fr)_minmax(160px,1.4fr)_minmax(110px,0.9fr)_minmax(140px,1.1fr)_minmax(88px,0.7fr)]",
        "items-center gap-3 border-b border-bd/70 px-4 cursor-pointer transition-colors duration-150",
        "outline-none focus-visible:bg-rs-bg/40",
        selected
          ? "bg-rs-bg/50 border-l-4 border-l-rs-ic font-medium"
          : "border-l-4 border-l-transparent hover:bg-surface-low/80",
      )}
    >
      <div role="cell" className="min-w-0">
        <p className={cn(Typography.DrawingNumber, "text-t1 truncate", selected && "font-semibold")}>
          {project.drawingNumber}
        </p>
        <p className="text-xs text-t3 mt-0.5 truncate">
          {revisionBadgeLabel(project.currentRevisionLetter)}
        </p>
      </div>

      <div role="cell" className="min-w-0">
        <p className={cn("text-sm text-t1 truncate", selected ? "font-semibold" : "font-medium")}>
          {project.clientCompany || "—"}
        </p>
        <p className="text-xs text-t3 mt-0.5 truncate">{site}</p>
      </div>

      <div role="cell" className="min-w-0 flex flex-col items-start gap-1">
        <span className="inline-flex items-center rounded-md border border-bd bg-sr px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-t2">
          {revisionBadgeLabel(project.currentRevisionLetter)}
        </span>
        <span className="text-xs text-t3">{shortStatusLabel(project.currentStatus)}</span>
      </div>

      <div role="cell" className="min-w-0">
        <p className="text-sm text-t1 truncate">{project.nextAction}</p>
        <div className="mt-1 sm:hidden">
          <StatusBadge status={project.currentStatus} />
        </div>
      </div>

      <div role="cell" className="text-right tabular-nums text-sm text-t1">
        {formatGBP(project.value)}
      </div>
    </div>
  )
})
