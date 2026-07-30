"use client"

import { formatGBP } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"
import { deriveProjectHealth } from "./jobs-register-helpers"

interface JobsInspectorCurrentFocusProps {
  revisionLabel: string
  currentTask: string
  designer: string
  checker: string | null
  dueDate: string | null
  status: string
}

export function JobsInspectorCurrentFocus({
  revisionLabel,
  currentTask,
  designer,
  checker,
  dueDate,
  status,
}: JobsInspectorCurrentFocusProps) {
  const health = deriveProjectHealth(status, dueDate)
  const healthDot =
    health.tone === "danger"
      ? "bg-dn"
      : health.tone === "warn"
        ? "bg-wn-ic"
        : health.tone === "ok"
          ? "bg-ok-ic"
          : "bg-t4"

  const rows: { label: string; value: string }[] = [
    { label: "Current Revision", value: revisionLabel },
    { label: "Current Task", value: currentTask },
    { label: "Responsible Designer", value: designer || "—" },
    { label: "Current Checker", value: checker || "—" },
    {
      label: "Due Date",
      value: dueDate
        ? new Date(dueDate).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "—",
    },
  ]

  return (
    <section className="rounded-xl border border-bd bg-sr p-4">
      <h3 className={cnTitle()}>Current Focus</h3>
      <dl className="mt-3 space-y-2.5">
        {rows.map(row => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-xs uppercase tracking-wide text-t3 shrink-0">{row.label}</dt>
            <dd className="text-sm text-t1 text-right font-medium truncate">{row.value}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 pt-1 border-t border-bd/60">
          <dt className="text-xs uppercase tracking-wide text-t3">Project Health</dt>
          <dd className="text-sm text-t1 font-medium inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${healthDot}`} aria-hidden />
            {health.label}
          </dd>
        </div>
      </dl>
    </section>
  )
}

function cnTitle() {
  return `${Typography.CardTitle} text-t1`
}

interface Metric {
  label: string
  value: string
  emphasize?: boolean
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
  const metrics: Metric[] = [
    { label: "Original Design Fee", value: formatGBP(originalFee) },
    { label: "Revision Revenue", value: formatGBP(revisionRevenue) },
    { label: "Total Project Value", value: formatGBP(totalValue) },
    {
      label: "Outstanding Value",
      value: formatGBP(outstanding),
      emphasize: (outstanding ?? 0) > 0,
    },
    { label: "Revision Count", value: String(revisionCount) },
    {
      label: "Last Activity",
      value: lastActivity
        ? new Date(lastActivity).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          })
        : "—",
    },
  ]

  return (
    <section>
      <h3 className={cnTitle()}>Commercial Metrics</h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {metrics.map(m => (
          <div
            key={m.label}
            className="rounded-lg border border-bd bg-surface-low/70 px-3 py-2.5"
          >
            <p className="text-[10px] uppercase tracking-wider text-t3">{m.label}</p>
            <p
              className={`mt-1 text-sm font-semibold tabular-nums ${
                m.emphasize ? "text-dn" : "text-t1"
              }`}
            >
              {m.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
