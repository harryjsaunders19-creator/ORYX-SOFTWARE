"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { MapPin, RefreshCw } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { useToast } from "@/shared/ui/toast"
import { cn } from "@/shared/utils"
import type { GeocodeQueueReason, MissingLocationJob } from "../types/location-types"
import { displaySiteName, GEOCODE_QUEUE_LABELS } from "../utils/job-address"

const JobMapManualPinDialog = dynamic(
  () => import("./job-map-manual-pin-dialog").then(m => m.JobMapManualPinDialog),
  { ssr: false },
)

type QueueFilter = "all" | GeocodeQueueReason

const QUEUE_FILTERS: { id: QueueFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "incomplete_address", label: "Needs manual" },
  { id: "geocode_failed", label: "Failed auto" },
  { id: "auto_ready", label: "Ready for auto" },
  { id: "no_address", label: "No address" },
]

const QUEUE_BADGE_CLASS: Record<GeocodeQueueReason, string> = {
  incomplete_address: "text-wa-tx",
  geocode_failed: "text-dn-tx",
  auto_ready: "text-ok-tx",
  no_address: "text-t4",
}

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
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all")

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

  const counts = useMemo(() => {
    const tally: Record<QueueFilter, number> = {
      all: jobs.length,
      auto_ready: 0,
      incomplete_address: 0,
      geocode_failed: 0,
      no_address: 0,
    }
    for (const job of jobs) tally[job.queueReason]++
    return tally
  }, [jobs])

  const visibleJobs = useMemo(
    () => queueFilter === "all" ? jobs : jobs.filter(j => j.queueReason === queueFilter),
    [jobs, queueFilter],
  )

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

  const empty = !loading && visibleJobs.length === 0

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

        <div className="px-4 py-2 border-b border-bd flex flex-wrap gap-1.5">
          {QUEUE_FILTERS.map(filter => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setQueueFilter(filter.id)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors",
                queueFilter === filter.id
                  ? "border-ac bg-ac/10 text-ac"
                  : "border-bd text-t3 hover:text-t1 hover:border-t4",
              )}
            >
              {filter.label}
              <span className="ml-1 tabular-nums text-t4">{counts[filter.id]}</span>
            </button>
          ))}
        </div>

        {loading && (
          <p className="px-4 py-8 text-sm text-t3 text-center">Loading projects…</p>
        )}

        {empty && (
          <p className="px-4 py-8 text-sm text-t3 text-center">
            {jobs.length === 0
              ? "All completed original jobs have map locations."
              : "No projects in this queue."}
          </p>
        )}

        {!loading && visibleJobs.length > 0 && (
          <div className="divide-y divide-bd max-h-[min(70vh,720px)] overflow-y-auto thin-scroll">
            {visibleJobs.map(job => {
              const canRetry = job.queueReason === "auto_ready" || job.queueReason === "geocode_failed"
              return (
                <div key={job.id} className="px-4 py-4 flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-t1 font-mono">{job.drawingNumber}</p>
                    <p className="text-xs text-t3">
                      <span className="text-t4 uppercase tracking-wide font-medium">Site: </span>
                      {displaySiteName(job.siteName, job.address)}
                    </p>
                    <p className="text-xs text-t3">
                      <span className="text-t4 uppercase tracking-wide font-medium">Address: </span>
                      {job.siteAddress?.trim() || job.address || "—"}
                    </p>
                    <p className="text-xs text-t3">{job.clientCompany}</p>
                    {job.dateCompleted && (
                      <p className="text-xs text-t4">Completed {job.dateCompleted.slice(0, 10)}</p>
                    )}
                    <p className={cn(
                      "text-[11px] font-medium uppercase tracking-wide pt-1",
                      QUEUE_BADGE_CLASS[job.queueReason],
                    )}>
                      {GEOCODE_QUEUE_LABELS[job.queueReason]}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <Button size="sm" variant="primary" className="h-8 text-xs" onClick={() => setPinJob(job)}>
                        Locate Manually
                      </Button>
                      {canRetry && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          disabled={retryingId === job.id}
                          onClick={() => retry(job)}
                        >
                          {retryingId === job.id ? "Trying…" : "Try Again"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
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
