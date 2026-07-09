"use client"

import type { JobMapStats } from "../types/job-map-types"
import { cn } from "@/shared/utils"

const CARDS = [
  { key: "total", label: "On Map" },
  { key: "missingLocations", label: "Missing Locations" },
  { key: "manuallyLocated", label: "Manually Located" },
  { key: "thisYear", label: "Completed This Year" },
  { key: "uniqueClients", label: "Unique Clients" },
] as const

export function JobMapStats({ stats, loading }: { stats: JobMapStats | null; loading?: boolean }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
      {CARDS.map(card => (
        <div
          key={card.key}
          className={cn(
            "oryx-surface-card bg-sr border border-bd rounded-md px-4 py-3",
            loading && "animate-pulse",
          )}
        >
          <p className="text-[11px] font-medium text-t3 uppercase tracking-wide">{card.label}</p>
          <p className="mt-1 text-2xl font-semibold text-t1 tabular-nums">
            {loading ? "—" : (stats?.[card.key] ?? 0).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  )
}
