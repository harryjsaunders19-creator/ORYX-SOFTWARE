"use client"
import { Suspense, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { format, parseISO } from "date-fns"
import { RotateCcw, Briefcase, FileText, Users, Clock } from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogBody,
} from "@/shared/ui/dialog"
import { useToast } from "@/shared/ui/toast"
import { RequireRole } from "@/components/require-role"
import { PageHeader, PageShell, EmptyPanel } from "@/shared/layouts/page-layout"
import type { Job, Quote, Client } from "@/lib/types"
import type { ArchiveLogRow } from "../types/archive-types"
import { apiFetch } from "@/shared/hooks/use-api"

interface ArchivedData {
  jobs:    Job[]
  quotes:  Quote[]
  clients: Client[]
  warnings?: string[]
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—"
  try { return format(parseISO(iso), "d MMM yyyy HH:mm") } catch { return iso }
}

function fmtCancelLine(job: Job) {
  const when = fmtDate(job.archivedAt)
  const rec = job.cancelRecord
  if (rec) {
    const reason = rec.reason ? ` — ${rec.reason}` : ""
    return `Cancelled ${when} by ${rec.performedByName}${reason}`
  }
  return `Cancelled ${when}`
}

function ArchivedInner() {
  const { toast } = useToast()
  const [data, setData]     = useState<ArchivedData | null>(null)
  const [log, setLog]       = useState<ArchiveLogRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"jobs" | "quotes" | "clients" | "log">("jobs")

  const [restoring, setRestoring] = useState<string | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<{ type: "job" | "quote" | "client"; id: string; label: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const [arRes, logRes] = await Promise.all([
        apiFetch("/api/archived"),
        apiFetch("/api/archive-log"),
      ])
      if (arRes.ok) {
        setData(await arRes.json() as ArchivedData)
      } else {
        const body = await arRes.json().catch(() => null) as { detail?: string; error?: string } | null
        setFetchError(body?.detail ?? body?.error ?? "Failed to load archived items")
        setData(null)
      }
      if (logRes.ok) setLog(await logRes.json() as ArchiveLogRow[])
    } catch {
      setFetchError("Network error loading archived items")
    }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const doRestore = async () => {
    if (!confirmRestore) return
    const { type, id, label } = confirmRestore
    setRestoring(id)
    setConfirmRestore(null)
    try {
      const endpoint = type === "job"
        ? `/api/jobs/${id}/restore`
        : type === "quote"
        ? `/api/quotes/${id}/restore`
        : `/api/clients/${id}/restore`
      const res = await fetch(endpoint, { method: "POST" })
      if (!res.ok) { toast("Restore failed", "error"); return }
      toast(`${label} restored`, "success")
      load()
    } catch { toast("Network error", "error") }
    finally { setRestoring(null) }
  }

  const jobCount    = data?.jobs.length    ?? 0
  const quoteCount  = data?.quotes.length  ?? 0
  const clientCount = data?.clients.length ?? 0
  const logCount    = log.length

  const tabs: { id: typeof activeTab; label: string; count: number; icon: React.ReactNode }[] = [
    { id: "jobs",    label: "Jobs",    count: jobCount,    icon: <Briefcase className="h-4 w-4" /> },
    { id: "quotes",  label: "Quotes",  count: quoteCount,  icon: <FileText  className="h-4 w-4" /> },
    { id: "clients", label: "Clients", count: clientCount, icon: <Users     className="h-4 w-4" /> },
    { id: "log",     label: "Audit log", count: logCount,  icon: <Clock     className="h-4 w-4" /> },
  ]

  return (
    <PageShell>
      <PageHeader
        title="Archived Items"
        description="Cancelled jobs are kept here so drawing numbers stay on record. Gaps in the active sequence (e.g. 001, 003) mean a number was cancelled — check this page to see which. Restore any item to return it to active views."
      />

      {fetchError && (
        <div className="mb-4 bg-dn-bg border border-dn-bd rounded-md p-4 text-sm text-dn-tx">
          <p className="font-medium">Could not load archived items.</p>
          <p className="text-xs text-t3 mt-1">{fetchError}</p>
        </div>
      )}

      {!!data?.warnings?.length && (
        <div className="mb-4 bg-wn-bg border border-wn-bd rounded-md p-4 text-sm text-wn-tx space-y-1">
          {data.warnings.map(w => (
            <p key={w} className="text-xs">{w}</p>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-bd mb-4">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.id
                ? "border-ac text-ac"
                : "border-transparent text-t3 hover:text-t1"
            }`}
          >
            {t.icon}
            {t.label}
            {t.count > 0 && (
              <span className="ml-1 min-w-[18px] text-center rounded-full bg-t1/10 text-t2 text-xs px-1.5 py-0.5">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 flex justify-center text-t3 text-sm">Loading…</div>
      ) : (
        <>
          {/* Jobs */}
          {activeTab === "jobs" && (
            data?.jobs.length ? (
              <div className="divide-y divide-bd rounded-lg border border-bd overflow-hidden">
                {data.jobs.map(job => (
                  <div key={job.id} className="flex items-center justify-between gap-4 px-4 py-3 bg-panel opacity-90">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-mono text-sm font-semibold text-t3 line-through truncate">
                          {job.drawingNumber}
                        </p>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-dn-bg text-dn-tx border border-dn-bd shrink-0">
                          Cancelled
                        </span>
                      </div>
                      <p className="text-xs text-t4 line-through truncate">{job.address} · {job.clientCompany}</p>
                      <p className="text-xs text-t3 mt-0.5">
                        {fmtCancelLine(job)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link href={`/jobs/${job.id}`} className="text-xs text-ac hover:underline">View</Link>
                      <Button
                        size="sm" variant="outline"
                        loading={restoring === job.id}
                        onClick={() => setConfirmRestore({ type: "job", id: job.id, label: job.drawingNumber })}
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Restore
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyPanel icon={Briefcase} title="No cancelled jobs" description="Jobs you cancel will appear here with their drawing number and reason on record." />
            )
          )}

          {/* Quotes */}
          {activeTab === "quotes" && (
            data?.quotes.length ? (
              <div className="divide-y divide-bd rounded-lg border border-bd overflow-hidden">
                {data.quotes.map(q => (
                  <div key={q.id} className="flex items-center justify-between gap-4 px-4 py-3 bg-panel">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold text-t1">{q.quoteNumber}</p>
                      <p className="text-xs text-t3 truncate">{q.clientCompany} · {q.address}</p>
                      <p className="text-xs text-t4 mt-0.5">Archived {fmtDate(q.archivedAt)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm" variant="outline"
                        loading={restoring === q.id}
                        onClick={() => setConfirmRestore({ type: "quote", id: q.id, label: q.quoteNumber })}
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Restore
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyPanel icon={FileText} title="No archived quotes" description="Quotes you archive will appear here." />
            )
          )}

          {/* Clients */}
          {activeTab === "clients" && (
            data?.clients.length ? (
              <div className="divide-y divide-bd rounded-lg border border-bd overflow-hidden">
                {data.clients.map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-4 px-4 py-3 bg-panel">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-t1 truncate">{c.name}</p>
                      {c.contactName && <p className="text-xs text-t3">{c.contactName}</p>}
                      <p className="text-xs text-t4 mt-0.5">Archived {fmtDate(c.archivedAt)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link href={`/clients/${c.id}`} className="text-xs text-ac hover:underline">View</Link>
                      <Button
                        size="sm" variant="outline"
                        loading={restoring === c.id}
                        onClick={() => setConfirmRestore({ type: "client", id: c.id, label: c.name })}
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Restore
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyPanel icon={Users} title="No archived clients" description="Clients you archive will appear here." />
            )
          )}

          {/* Audit log */}
          {activeTab === "log" && (
            log.length ? (
              <div className="divide-y divide-bd rounded-lg border border-bd overflow-hidden">
                {log.map(entry => (
                  <div key={entry.id} className="flex items-start gap-3 px-4 py-3 bg-panel">
                    <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${entry.action === "archive" ? "bg-wn" : "bg-ok"}`} />
                    <div className="min-w-0 text-sm">
                      <span className="font-medium text-t1">{entry.performedByName}</span>
                      {" "}
                      <span className="text-t3">
                        {entry.entityType === "job" && entry.action === "archive"
                          ? "cancelled"
                          : entry.action === "archive"
                          ? "archived"
                          : "restored"}
                      </span>
                      {" "}
                      <span className="font-mono text-ac">{entry.entityLabel}</span>
                      {" "}
                      <span className="text-t4 text-xs">({entry.entityType})</span>
                      {entry.reason && <span className="text-t4 text-xs"> · {entry.reason}</span>}
                      <p className="text-xs text-t4 mt-0.5">{fmtDate(entry.performedAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyPanel icon={Clock} title="No archive history" description="Archive and restore actions will be logged here." />
            )
          )}
        </>
      )}

      {/* Restore confirmation dialog */}
      <Dialog open={!!confirmRestore} onOpenChange={o => { if (!o) setConfirmRestore(null) }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Restore {confirmRestore?.type}</DialogTitle>
            <DialogDescription>
              Restore{" "}
              <span className="font-mono font-semibold text-ac">{confirmRestore?.label}</span>?
              It will become visible again in active views.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-xs text-t3">
              All original data and relationships will be preserved.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRestore(null)}>Cancel</Button>
            <Button variant="primary" onClick={doRestore}>Restore</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}

export default function ArchivedPage() {
  return (
    <RequireRole roles={["ADMIN"]}>
      <Suspense><ArchivedInner /></Suspense>
    </RequireRole>
  )
}
