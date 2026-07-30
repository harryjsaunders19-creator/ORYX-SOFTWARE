"use client"

import { memo } from "react"
import { cn, formatGBP } from "@/shared/utils/utils"
import { revisionBadgeLabel, siteDisplay } from "./jobs-register-helpers"
import type { JobsRegisterProject } from "./jobs-register-types"
import { REGISTER_ROW_H } from "./jobs-register-types"

interface JobsRegisterRowProps {
  project: JobsRegisterProject
  selected: boolean
  style?: React.CSSProperties
  onSelect: (id: string) => void
}

function statusChip(status: string) {
  if (status === "ISSUED") {
    return (
      <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-ok-bg text-ok-tx border border-ok-bd">
        Complete
      </span>
    )
  }
  return (
    <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-blue-500 text-white">
      Active
    </span>
  )
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
        "group grid grid-cols-[1.2fr_1.4fr_0.7fr_0.7fr] items-center gap-0 border-b border-bd/40 px-0 cursor-pointer transition-colors duration-150",
        "outline-none",
        selected
          ? "bg-ac/5 border-l-4 border-l-ac"
          : "border-l-4 border-l-transparent hover:bg-[#f3f3f3]",
      )}
    >
      <div role="cell" className="min-w-0 px-4 py-3">
        <p className={cn("text-sm text-t1 truncate", selected ? "font-bold" : "font-bold")}>
          {project.drawingNumber}
        </p>
        <p className="text-[10px] uppercase font-bold text-t4 mt-0.5 truncate">
          {revisionBadgeLabel(project.currentRevisionLetter)}
        </p>
      </div>

      <div role="cell" className="min-w-0 px-4 py-3">
        <p className="text-sm font-medium text-t1 truncate">{project.clientCompany || "—"}</p>
        <p className="text-xs text-t3 mt-0.5 truncate">{site}</p>
      </div>

      <div role="cell" className="px-4 py-3">
        {statusChip(project.currentStatus)}
      </div>

      <div role="cell" className="px-4 py-3 text-right text-sm font-medium tabular-nums text-t1">
        {formatGBP(project.value)}
      </div>
    </div>
  )
})
