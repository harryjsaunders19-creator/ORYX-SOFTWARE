"use client"

import { useCallback, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { MapPin, RefreshCw } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { useToast } from "@/shared/ui/toast"
import type { MissingLocationJob } from "../types/location-types"
import { displaySiteName } from "../utils/job-address"

const JobMapManualPinDialog = dynamic(
  () => import("./job-map-manual-pin-dialog").then(m => m.JobMapManualPinDialog),
  { ssr: false },
)

interface Props {
  isAdmin: boolean
  onLocated: () => void
}

async function fetchMissing(): Promise<MissingLocationJob[]> {
  const res = await fetch("/api/job-map/missing-locations")
  if (!res.ok) throw new Error("Failed to load")
  const data = await res.json() as { jobs: MissingLocationJob[] }
  return data.jobs
}

export function JobMapMissingLocations({ isAdmin, onLocated }: Props) {
  const { toast } = useToast()
  const [jobs, setJobs] = useState<MissingLocationJob[]>([])
  const [loading, setLoading] = useState(true)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [pinJob, setPinJob] = useState<MissingLocationJob | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setJobs(await fetchMissing())
    } catch {
      toast("Failed to load missing locations", "error")
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const retry = useCallback(async (job: MissingLocationJob) => {
    setRetryingId(job.id)
    try {
      const res = await fetch(`/api/job-map/locations/${job.id}/retry`, { method: "POST" })
      if (!res.ok) throw new Error("Failed")
      const { success } = await res.json() as { success: boolean }
      if (success) {
        toast(`${job.drawingNumber} located successfully`, "success")
        onLocated()
        await load()
      } else {
        toast(`Could not locate ${job.drawingNumber} — try manual placement`, "info")
        await load()
      }
    } catch {
      toast("Retry failed", "error")
    } finally {
      setRetryingId(null)
    }
  }, [load, onLocated, toast])

  const onPinSaved = useCallback(async () => {
    setPinJob(null)
    onLocated()
    await load()
    toast("Location saved — project added to map", "success")
  }, [load, onLocated, toast])

  const empty = !loading && jobs.length === 0

  return (
    <>
      <div className="oryx-surface-card bg-sr border border-bd rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-bd flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-t3" />
            <h2 className="text-sm font-semibold text-t1">Missing Locations</h2>
            <span className="text-xs text-t3 tabular-nums">{jobs.length.toLocaleString()}</span>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {loading && (
          <p className="px-4 py-8 text-sm text-t3 text-center">Loading projects…</p>
        )}

        {empty && (
          <p className="px-4 py-8 text-sm text-t3 text-center">All completed projects have map locations.</p>
        )}

        {!loading && jobs.length > 0 && (
          <div className="divide-y divide-bd max-h-[min(70vh,720px)] overflow-y-auto thin-scroll">
            {jobs.map(job => (
              <div key={job.id} className="px-4 py-4 flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-t1 font-mono">{job.drawingNumber}</p>
                  <p className="text-xs text-t3">
                    <span className="text-t4 uppercase tracking-wide font-medium">Site: </span>
                    {displaySiteName(job.siteName, job.address)}
                  </p>
                  <p className="text-xs text-t3">
                    <span className="text-t4 uppercase tracking-wide font-medium">Address: </span>
                    {job.siteAddress?.trim() || job.address}
                  </p>
                  <p className="text-xs text-t3">{job.clientCompany}</p>
                  {job.dateCompleted && (
                    <p className="text-xs text-t4">Completed {job.dateCompleted.slice(0, 10)}</p>
                  )}
                  <p className="text-[11px] font-medium text-wa-tx uppercase tracking-wide pt-1">
                    {job.locationStatus === "needs_review" ? "Needs Review" : "Needs Location"}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button size="sm" variant="primary" className="h-8 text-xs" onClick={() => setPinJob(job)}>
                      Locate Manually
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={retryingId === job.id}
                      onClick={() => retry(job)}
                    >
                      {retryingId === job.id ? "Trying…" : "Try Again"}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {pinJob && (
        <JobMapManualPinDialog
          job={pinJob}
          open={!!pinJob}
          onOpenChange={open => { if (!open) setPinJob(null) }}
          onSaved={onPinSaved}
        />
      )}
    </>
  )
}
