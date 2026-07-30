"use client"

import { useEffect, useState } from "react"
import { cn } from "@/shared/utils/utils"
import type { SiteSummary } from "@/modules/sites/types"

/**
 * Site filter dependent on selected Client.
 */
export function SiteFilter({
  clientId,
  value,
  onChange,
  className,
}: {
  clientId: string | null
  value: string
  onChange: (siteId: string) => void
  className?: string
}) {
  const [sites, setSites] = useState<SiteSummary[]>([])

  useEffect(() => {
    if (!clientId) {
      setSites([])
      return
    }
    const ac = new AbortController()
    void fetch(`/api/sites?clientId=${encodeURIComponent(clientId)}&activeOnly=false`, {
      signal: ac.signal,
    })
      .then(r => r.ok ? r.json() : null)
      .then((d: { sites: SiteSummary[] } | null) => {
        if (d?.sites) setSites(d.sites)
      })
      .catch(() => {})
    return () => ac.abort()
  }, [clientId])

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={!clientId}
      className={cn(
        "h-9 rounded-lg border border-bd bg-sr px-2 text-sm text-t1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      aria-label="Filter by site"
    >
      <option value="">{clientId ? "All sites" : "Select a client first"}</option>
      {sites.map(s => (
        <option key={s.id} value={s.id}>
          {s.name}{s.isActive === 0 ? " (archived)" : ""}
        </option>
      ))}
    </select>
  )
}
