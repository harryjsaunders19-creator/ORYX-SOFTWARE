"use client"

import Link from "next/link"
import { MapPin } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { formatSiteAddress } from "@/modules/sites/lib/normalize"
import { SiteJobsList } from "./site-jobs-list"
import type { SiteSummary } from "@/modules/sites/types"

type SiteJob = {
  id: string
  drawingNumber: string
  status: string
  typeOfWorks: string
  revisionLetter?: string | null
}

/**
 * Lightweight Site Details panel — index of jobs at a site, not a dashboard.
 */
export function SiteDetailsPanel({
  site,
  jobs,
  onClose,
  onFilterRegister,
}: {
  site: SiteSummary
  jobs: SiteJob[]
  onClose?: () => void
  onFilterRegister?: (siteId: string) => void
}) {
  const address = formatSiteAddress(site)
  const counts = site.jobCounts

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-bd px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-t4">Site</p>
            <h2 className="text-lg font-semibold uppercase tracking-wide text-t1">{site.name}</h2>
          </div>
          {onClose && (
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Close</Button>
          )}
        </div>
      </div>

      <div className="space-y-4 overflow-auto px-4 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-t4">Client</p>
          <p className="text-sm font-medium text-t1">{site.clientName ?? "—"}</p>
        </div>

        {address && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-t4">Address</p>
            <p className="mt-0.5 flex items-start gap-1.5 text-sm text-t2">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-t3" />
              <span className="whitespace-pre-line">
                {[site.addressLine1, site.addressLine2, site.city, site.postcode]
                  .filter(Boolean)
                  .join("\n")}
              </span>
            </p>
          </div>
        )}

        {site.siteReference && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-t4">Site Reference</p>
            <p className="text-sm text-t1">{site.siteReference}</p>
          </div>
        )}

        {counts && (
          <div className="flex flex-wrap gap-3 text-xs text-t3">
            <span>{counts.active} active</span>
            <span>{counts.completed} completed</span>
            <span>{counts.total} total</span>
          </div>
        )}

        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-t4">
            Jobs at this Site
          </p>
          <SiteJobsList jobs={jobs} />
        </div>

        {onFilterRegister && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onFilterRegister(site.id)}
          >
            View in Jobs Register
          </Button>
        )}

        {!onFilterRegister && (
          <Link
            href={`/jobs?siteId=${encodeURIComponent(site.id)}`}
            className="text-sm font-medium text-ac hover:text-ach"
          >
            View in Jobs Register
          </Link>
        )}
      </div>
    </div>
  )
}
