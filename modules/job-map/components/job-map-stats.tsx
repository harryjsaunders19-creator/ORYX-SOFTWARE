"use client"

import type { JobMapStats as JobMapStatsData } from "../types/job-map-types"
import { cn } from "@/shared/utils"
import { Typography } from "@/shared/design/typography"

const CARDS = [
  { key: "total", label: "On map" },
  { key: "missingLocations", label: "Missing locations" },
  { key: "manuallyLocated", label: "Manually located" },
  { key: "thisYear", label: "Completed this year" },
  { key: "uniqueClients", label: "Unique clients" },
] as const

export function JobMapStats({ stats, loading }: { stats: JobMapStatsData | null; loading?: boolean }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
      {CARDS.map(card => (
        <div
          key={card.key}
          className={cn(
            "oryx-surface-card bg-sr border border-bd rounded-xl px-4 py-3",
            loading && "animate-pulse",
          )}
        >
          <p className={cn(Typography.Label, "text-t3")}>{card.label}</p>
          <p className={cn(Typography.Stat, "mt-1 text-t1")}>
            {loading ? "—" : (stats?.[card.key] ?? 0).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  )
}
