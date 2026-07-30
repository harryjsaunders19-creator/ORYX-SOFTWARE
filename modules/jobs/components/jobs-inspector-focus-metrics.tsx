"use client"

import { formatGBP, cn } from "@/shared/utils/utils"
import { deriveProjectHealth } from "./jobs-register-helpers"

interface JobsInspectorCurrentFocusProps {
  revisionLabel: string
  currentTask: string
  designer: string
  checker: string | null
  dueDate: string | null
  status: string
}

/** Stitch Current Focus — black primary card (bg-primary / text-on-primary). */
export function JobsInspectorCurrentFocus({
  revisionLabel,
  currentTask,
  designer,
  checker,
  dueDate,
  status,
}: JobsInspectorCurrentFocusProps) {
  const health = deriveProjectHealth(status, dueDate)
  const initials = designer
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? "")
    .join("") || "?"

  return (
    <section className="rounded-lg bg-ac text-on-ac p-5 shadow-lg">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-ac/60 mb-4">
        Current Focus
      </h4>
      <div className="space-y-4">
        <div className="flex justify-between items-end gap-4 border-b border-on-ac/10 pb-4">
          <div>
            <span className="block text-[10px] uppercase font-medium text-on-ac/50 mb-1">
              Active Stage
            </span>
            <span className="text-base font-semibold leading-tight">{revisionLabel}</span>
          </div>
          <div className="text-right">
            <span className="block text-[10px] uppercase font-medium text-on-ac/50 mb-1">
              Current Task
            </span>
            <span className="text-sm font-medium leading-tight">{currentTask}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded bg-on-ac/10 flex items-center justify-center text-[12px] font-bold shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <span className="block text-[10px] uppercase text-on-ac/50 leading-none mb-0.5">
                Responsible
              </span>
              <span className="text-sm leading-none truncate block">{designer || "—"}</span>
              {checker && (
                <span className="block text-[10px] text-on-ac/50 mt-1 truncate">
                  Checker: {checker}
                </span>
              )}
            </div>
          </div>
          <div
            className={cn(
              "px-3 py-1 rounded text-[10px] font-bold shrink-0 border",
              health.tone === "danger" || health.tone === "warn"
                ? "bg-red-500/20 text-red-100 border-red-500/30"
                : "bg-on-ac/10 text-on-ac/80 border-on-ac/20",
            )}
          >
            {health.label.toUpperCase()}
          </div>
        </div>
      </div>
    </section>
  )
}

export function JobsInspectorMetrics({
  originalFee,
  revisionRevenue,
  totalValue,
  outstanding,
  revisionCount,
  lastActivity,
}: {
  originalFee: number | null
  revisionRevenue: number | null
  totalValue: number | null
  outstanding: number | null
  revisionCount: number
  lastActivity: string | null
}) {
  return (
    <section>
      <h4 className="text-[11px] font-bold uppercase tracking-widest text-t3 mb-4">
        Commercial Metrics
      </h4>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded border border-bd/40 bg-surface-low p-3">
          <span className="text-[10px] uppercase text-t3 block mb-1">Total Project Value</span>
          <span className="text-base font-bold text-t1 tabular-nums">{formatGBP(totalValue)}</span>
        </div>
        <div className="rounded border border-bd/40 bg-surface-low p-3">
          <span className="text-[10px] uppercase text-t3 block mb-1">Outstanding Value</span>
          <span
            className={cn(
              "text-base font-bold tabular-nums",
              (outstanding ?? 0) > 0 ? "text-dn" : "text-t1",
            )}
          >
            {formatGBP(outstanding)}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Orig. Fee", value: formatGBP(originalFee) },
          { label: "Rev Revenue", value: formatGBP(revisionRevenue) },
          { label: "Rev Count", value: `${revisionCount} Total` },
          {
            label: "Last Activity",
            value: lastActivity
              ? new Date(lastActivity).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                })
              : "—",
          },
        ].map(m => (
          <div key={m.label} className="border-l border-bd/50 pl-2.5 py-1.5">
            <span className="mb-0.5 block text-[10px] uppercase text-t3">{m.label}</span>
            <span className="text-sm font-semibold tabular-nums text-t1">{m.value}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
