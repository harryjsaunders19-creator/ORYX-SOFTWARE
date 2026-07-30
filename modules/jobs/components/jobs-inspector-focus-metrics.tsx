"use client"

import { formatGBP, cn } from "@/shared/utils/utils"
import { deriveProjectHealth } from "./jobs-register-helpers"

function safeShortDate(value: string | null): string {
  if (!value) return "Not set"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "Not set"
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

interface JobsInspectorCurrentFocusProps {
  revisionLabel: string
  currentTask: string
  designer: string
  checker: string | null
  dueDate: string | null
  status: string
  nextAction?: string | null
}

/**
 * Current Focus — charcoal card that stays dark in both light and dark
 * app themes (avoids the bright white `bg-ac` flip in html.dark).
 */
export function JobsInspectorCurrentFocus({
  revisionLabel,
  currentTask,
  designer,
  checker,
  dueDate,
  status,
  nextAction,
}: JobsInspectorCurrentFocusProps) {
  const health = deriveProjectHealth(status, dueDate)
  const safeDesigner = typeof designer === "string" ? designer.trim() : ""
  const hasDesigner = Boolean(safeDesigner)
  const initials = hasDesigner
    ? safeDesigner
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(p => p[0]?.toUpperCase() ?? "")
        .join("")
    : "?"

  return (
    <section
      className={cn(
        "rounded-lg border p-4",
        "bg-[#1c1f24] border-[#2e3238] text-[#f4f4f5]",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[#a1a1aa]">
          Current Focus
        </h4>
        <span
          className={cn(
            "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
            health.tone === "danger"
              ? "border-red-500/35 bg-red-500/15 text-red-200"
              : health.tone === "warn"
                ? "border-amber-500/35 bg-amber-500/15 text-amber-100"
                : "border-white/15 bg-white/8 text-[#e4e4e7]",
          )}
        >
          {health.label}
        </span>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 border-b border-white/10 pb-3">
          <div>
            <span className="mb-0.5 block text-xs text-[#a1a1aa]">Active stage</span>
            <span className="text-sm font-semibold leading-tight text-[#fafafa]">
              {revisionLabel}
            </span>
          </div>
          <div className="text-right">
            <span className="mb-0.5 block text-xs text-[#a1a1aa]">Current task</span>
            <span className="text-sm font-medium leading-tight text-[#f4f4f5]">
              {currentTask}
            </span>
          </div>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-white/10 text-xs font-bold text-[#f4f4f5]">
              {initials}
            </div>
            <div className="min-w-0 space-y-1.5">
              <div>
                <span className="mb-0.5 block text-xs text-[#a1a1aa]">Responsible</span>
                {hasDesigner ? (
                  <span className="block truncate text-sm text-[#f4f4f5]">{safeDesigner}</span>
                ) : (
                  <span className="block text-sm text-[#d4d4d8]">Unassigned</span>
                )}
              </div>
              <div>
                <span className="mb-0.5 block text-xs text-[#a1a1aa]">Checker</span>
                <span className="block truncate text-sm text-[#d4d4d8]">
                  {checker?.trim() ? checker : "Not assigned"}
                </span>
              </div>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <span className="mb-0.5 block text-xs text-[#a1a1aa]">Due</span>
            <span className="text-sm font-medium text-[#f4f4f5]">{safeShortDate(dueDate)}</span>
          </div>
        </div>

        {nextAction ? (
          <div className="border-t border-white/10 pt-3">
            <span className="mb-0.5 block text-xs text-[#a1a1aa]">Next action</span>
            <span className="text-sm text-[#f4f4f5]">{nextAction}</span>
          </div>
        ) : null}
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
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-t3">
        Commercial Metrics
      </h4>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="rounded border border-bd bg-surface-low p-3">
          <span className="mb-1 block text-xs text-t3">Total Project Value</span>
          <span className="text-base font-bold tabular-nums text-t1">{formatGBP(totalValue)}</span>
        </div>
        <div className="rounded border border-bd bg-surface-low p-3">
          <span className="mb-1 block text-xs text-t3">Outstanding Value</span>
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
            value: lastActivity && safeShortDate(lastActivity) !== "Not set"
              ? safeShortDate(lastActivity)
              : "No activity",
          },
        ].map(m => (
          <div key={m.label} className="border-l border-bd pl-2.5 py-1.5">
            <span className="mb-0.5 block text-xs text-t3">{m.label}</span>
            <span className="text-sm font-semibold tabular-nums text-t1">{m.value}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
