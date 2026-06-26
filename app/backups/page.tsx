"use client"
import { useCallback, useEffect, useState } from "react"
import { format } from "date-fns"
import {
  DatabaseBackup, CheckCircle2, XCircle, Clock, Loader2, Play, HardDrive, RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { RequireRole } from "@/components/require-role"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

interface BackupJob {
  id: string; status: string; trigger: string
  triggeredByName: string; folderName: string
  startedAt: string; completedAt: string | null
  durationMs: number | null; sizeBytes: number | null
  checksum: string | null; rowCountsJson: string | null
  errorMessage: string | null; fileDeletedAt: string | null
}

interface AuditEntry {
  id: string; action: string; backupId: string | null
  userName: string; detail: string | null; createdAt: string
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—"
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "COMPLETED": return <CheckCircle2 className="h-4 w-4 text-ok-ic shrink-0" />
    case "FAILED":    return <XCircle className="h-4 w-4 text-dn shrink-0" />
    case "RUNNING":   return <Loader2 className="h-4 w-4 text-ac shrink-0" style={{ animation: "spin 1s linear infinite" }} />
    case "PENDING":   return <Clock className="h-4 w-4 text-t4 shrink-0" />
    default:          return <Clock className="h-4 w-4 text-t4 shrink-0" />
  }
}

function statusLabel(s: string): string {
  switch (s) {
    case "COMPLETED": return "Completed"
    case "FAILED":    return "Failed"
    case "RUNNING":   return "Running"
    case "PENDING":   return "Pending"
    default:          return s
  }
}

function triggerLabel(t: string): string {
  switch (t) {
    case "MANUAL":    return "Manual"
    case "SCHEDULED": return "Scheduled"
    case "PRE_RESTORE_SAFETY": return "Pre-restore"
    case "RETRY":     return "Retry"
    default:          return t
  }
}

export default function BackupsPage() {
  return <RequireRole roles={["ADMIN"]}><BackupsInner /></RequireRole>
}

function BackupsInner() {
  const { toast } = useToast()
  const [backups, setBackups]     = useState<BackupJob[]>([])
  const [auditLog, setAuditLog]   = useState<AuditEntry[]>([])
  const [backupsDir, setBackupsDir] = useState("")
  const [loading, setLoading]     = useState(true)
  const [starting, setStarting]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/backups")
      if (!res.ok) throw new Error()
      const data = await res.json() as { backups: BackupJob[]; auditLog: AuditEntry[]; backupsDir: string }
      setBackups(data.backups)
      setAuditLog(data.auditLog)
      setBackupsDir(data.backupsDir)
    } catch { toast("Failed to load backups", "error") }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

  // Auto-refresh while a backup is running
  useEffect(() => {
    const hasRunning = backups.some(b => b.status === "PENDING" || b.status === "RUNNING")
    if (!hasRunning) return
    const interval = setInterval(load, 3000)
    return () => clearInterval(interval)
  }, [backups, load])

  const startManualBackup = async () => {
    setStarting(true)
    try {
      const res = await fetch("/api/backups", { method: "POST" })
      const data = await res.json() as { error?: string }
      if (!res.ok) { toast(data.error ?? "Failed to start backup", "error"); return }
      toast("Backup started", "success")
      load()
    } catch { toast("Network error", "error") }
    finally { setStarting(false) }
  }

  const completed = backups.filter(b => b.status === "COMPLETED")
  const latestCompleted = completed[0]
  const totalRows = latestCompleted?.rowCountsJson
    ? Object.values(JSON.parse(latestCompleted.rowCountsJson) as Record<string, number>).reduce((a, b) => a + b, 0)
    : null

  return (
    <div className="px-6 py-6 max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-t1">System Backup</h1>
          <p className="text-sm text-t3 mt-0.5">Automated daily at ~02:00 · {backups.length} backup{backups.length !== 1 ? "s" : ""} recorded</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={startManualBackup} disabled={starting || backups.some(b => b.status === "RUNNING" || b.status === "PENDING")}>
            <Play className="h-3.5 w-3.5" />
            {starting ? "Starting…" : "Run backup now"}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="bg-sr border border-bd rounded-md p-3">
          <p className="text-[11px] font-medium text-t3 uppercase tracking-wider mb-1">Last backup</p>
          <p className="text-sm font-semibold text-t1">
            {latestCompleted
              ? format(new Date(latestCompleted.completedAt!), "d MMM yyyy, HH:mm")
              : "Never"}
          </p>
        </div>
        <div className="bg-sr border border-bd rounded-md p-3">
          <p className="text-[11px] font-medium text-t3 uppercase tracking-wider mb-1">Size</p>
          <p className="text-sm font-semibold text-t1">{formatBytes(latestCompleted?.sizeBytes ?? null)}</p>
        </div>
        <div className="bg-sr border border-bd rounded-md p-3">
          <p className="text-[11px] font-medium text-t3 uppercase tracking-wider mb-1">Rows backed up</p>
          <p className="text-sm font-semibold text-t1">{totalRows?.toLocaleString() ?? "—"}</p>
        </div>
        <div className="bg-sr border border-bd rounded-md p-3">
          <p className="text-[11px] font-medium text-t3 uppercase tracking-wider mb-1">Storage location</p>
          <p className="text-xs font-mono text-t2 truncate" title={backupsDir}>{backupsDir || "—"}</p>
        </div>
      </div>

      {/* Backup history */}
      {loading && backups.length === 0 ? (
        <div className="bg-sr border border-bd rounded-md">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 border-b border-bd last:border-0 px-4 flex items-center">
              <div className="skeleton h-4 w-64 rounded" />
            </div>
          ))}
        </div>
      ) : backups.length === 0 ? (
        <div className="bg-sr border border-bd rounded-md p-10 text-center">
          <DatabaseBackup className="h-8 w-8 text-t4 mx-auto mb-3" />
          <p className="text-sm font-medium text-t1 mb-1">No backups yet</p>
          <p className="text-xs text-t3">The first automated backup will run at ~02:00, or click "Run backup now" to create one immediately.</p>
        </div>
      ) : (
        <div className="bg-sr border border-bd rounded-md overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-bd">
            <p className="text-xs font-semibold text-t3 uppercase tracking-wider">Backup history</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-pg border-b border-bd text-xs">
                  <th className="px-4 py-2.5 text-left font-semibold text-t3 uppercase tracking-wider w-10" />
                  <th className="px-4 py-2.5 text-left font-semibold text-t3 uppercase tracking-wider">Date & Time</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-t3 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-t3 uppercase tracking-wider">Trigger</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-t3 uppercase tracking-wider">By</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-t3 uppercase tracking-wider">Size</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-t3 uppercase tracking-wider">Duration</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-t3 uppercase tracking-wider">Folder</th>
                </tr>
              </thead>
              <tbody>
                {backups.map(b => (
                  <tr key={b.id} className={cn("border-b border-bd last:border-0 hover:bg-pg", b.status === "FAILED" && "bg-dn-bg/30")}>
                    <td className="px-4 py-3"><StatusIcon status={b.status} /></td>
                    <td className="px-4 py-3 text-xs text-t1 tabular-nums whitespace-nowrap">
                      {format(new Date(b.startedAt), "d MMM yyyy, HH:mm:ss")}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "text-[11px] font-medium",
                        b.status === "COMPLETED" ? "text-ok-tx" :
                        b.status === "FAILED"    ? "text-dn-tx" :
                        b.status === "RUNNING"   ? "text-ac" :
                        "text-t3",
                      )}>
                        {statusLabel(b.status)}
                      </span>
                      {b.fileDeletedAt && <span className="text-[10px] text-t4 ml-1">(pruned)</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-t3">{triggerLabel(b.trigger)}</td>
                    <td className="px-4 py-3 text-xs text-t2">{b.triggeredByName}</td>
                    <td className="px-4 py-3 text-xs text-t2 text-right tabular-nums">{formatBytes(b.sizeBytes)}</td>
                    <td className="px-4 py-3 text-xs text-t2 text-right tabular-nums">{formatDuration(b.durationMs)}</td>
                    <td className="px-4 py-3 text-xs font-mono text-t4 truncate max-w-[180px]" title={b.folderName}>{b.folderName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Error details for failed backups */}
      {backups.filter(b => b.status === "FAILED").length > 0 && (
        <div className="bg-sr border border-bd rounded-md overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-bd">
            <p className="text-xs font-semibold text-dn-tx uppercase tracking-wider">Failed backups</p>
          </div>
          <div className="divide-y divide-bd">
            {backups.filter(b => b.status === "FAILED").map(b => (
              <div key={b.id} className="px-4 py-3">
                <p className="text-xs text-t2 mb-1">{format(new Date(b.startedAt), "d MMM yyyy, HH:mm:ss")}</p>
                <p className="text-xs font-mono text-dn-tx">{b.errorMessage ?? "Unknown error"}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit log */}
      {auditLog.length > 0 && (
        <div className="bg-sr border border-bd rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-bd">
            <p className="text-xs font-semibold text-t3 uppercase tracking-wider">Audit log</p>
          </div>
          <div className="max-h-[250px] overflow-y-auto thin-scroll divide-y divide-bd">
            {auditLog.map(e => (
              <div key={e.id} className="px-4 py-2.5 flex items-start gap-3">
                <span className="text-xs text-t4 tabular-nums whitespace-nowrap shrink-0">
                  {format(new Date(e.createdAt), "d MMM HH:mm")}
                </span>
                <span className="text-xs font-medium text-t2 shrink-0 w-16">{e.userName}</span>
                <span className="text-xs text-t3 flex-1 min-w-0">
                  <span className="font-medium text-t2">{e.action.replace(/_/g, " ")}</span>
                  {e.detail && <span className="text-t4 ml-1.5">— {e.detail}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
