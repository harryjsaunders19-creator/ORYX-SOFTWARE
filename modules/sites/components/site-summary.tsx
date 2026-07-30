"use client"

import { MapPin } from "lucide-react"
import { formatSiteAddress } from "@/modules/sites/lib/normalize"
import type { SiteSummary } from "@/modules/sites/types"

export function SiteSummaryCard({
  site,
  onOpen,
}: {
  site: SiteSummary
  onOpen?: () => void
}) {
  const address = formatSiteAddress(site)
  const counts = site.jobCounts
  const content = (
    <div className="rounded-lg border border-bd bg-sr px-3 py-2.5 text-left transition-colors hover:border-bds">
      <p className="text-sm font-semibold text-t1">{site.name}</p>
      {address && (
        <p className="mt-0.5 flex items-start gap-1 text-xs text-t3">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
          {address}
        </p>
      )}
      {counts && (
        <p className="mt-1.5 text-[11px] text-t4">
          {counts.active} active · {counts.total} total
        </p>
      )}
    </div>
  )
  if (!onOpen) return content
  return (
    <button type="button" onClick={onOpen} className="w-full">
      {content}
    </button>
  )
}
