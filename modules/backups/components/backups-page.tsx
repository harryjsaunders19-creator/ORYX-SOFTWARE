"use client"
import { useCallback, useEffect, useState } from "react"
import { format } from "date-fns"
import {
  RefreshCw, FileJson2, FileSpreadsheet, Upload, ShieldCheck, Play,
  Loader2,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { RequireRole } from "@/components/require-role"
import { PageHeader, PageShell, DataPanel, KpiTile } from "@/shared/layouts/page-layout"
import { useToast } from "@/shared/ui/toast"
import { cn } from "@/shared/utils/utils"
import {
  formatBytes, sheetTotal,
  type BackupJob, type AuditEntry, type ImportResult, type SheetResult,
} from "./backups-helpers"
import { BackupsList } from "./backups-list"

export default function BackupsPage() {
  return <RequireRole roles={["ADMIN", "ACCOUNTS"]}><BackupsInner /></RequireRole>
}

function BackupsInner() {
  const { toast } = useToast()
  const [backups, setBackups]       = useState<BackupJob[]>([])
  const [auditLog, setAuditLog]     = useState<AuditEntry[]>([])
  const [backupsDir, setBackupsDir] = useState("")
  const [localBackupSupported, setLocalBackupSupported] = useState(true)
  const [loading, setLoading]       = useState(true)
  const [starting, setStarting]     = useState(false)
  const [exportingJson, setExportingJson]     = useState(false)
  const [exportingExcel, setExportingExcel]   = useState(false)
  const [importingExcel, setImportingExcel]   = useState(false)
  const [importingJson, setImportingJson]     = useState(false)
  const [importResult, setImportResult]       = useState<ImportResult | null>(null)

  const busy = exportingJson || exportingExcel || importingExcel || importingJson

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/backups")
      if (!res.ok) throw new Error()
      const data = await res.json() as {
        backups: BackupJob[]
        auditLog: AuditEntry[]
        backupsDir: string
        localBackupSupported?: boolean
      }
      setBackups(data.backups)
      setAuditLog(data.auditLog)
      setBackupsDir(data.backupsDir)
      setLocalBackupSupported(data.localBackupSupported !== false)
    } catch { toast("Failed to load backups", "error") }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

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

  const downloadLogicalJson = async () => {
    setExportingJson(true)
    try {
      const res = await fetch("/api/backups/export-data")
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        toast(data.error ?? "Full data export failed", "error")
        return
      }
      const blob = await res.blob()
      const cd = res.headers.get("Content-Disposition") ?? ""
      const match = cd.match(/filename="([^"]+)"/)
      const name = match?.[1] ?? `oryx-data-backup-${new Date().toISOString().slice(0, 10)}.json`
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = name; a.click()
      URL.revokeObjectURL(url)
      toast("Full data backup downloaded", "success")
    } catch { toast("Download failed", "error") }
    finally { setExportingJson(false) }
  }

  const downloadExcel = async () => {
    setExportingExcel(true)
    try {
      const res = await fetch("/api/export/all")
      if (!res.ok) { toast("Excel export failed", "error"); return }
      const blob = await res.blob()
      const name = `oryx-export-${new Date().toISOString().slice(0, 10)}.xlsx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = name; a.click()
      URL.revokeObjectURL(url)
      toast("Excel report downloaded", "success")
    } catch { toast("Download failed", "error") }
    finally { setExportingExcel(false) }
  }

  const summariseImport = (data: ImportResult) => {
    setImportResult(data)
    const sheets = [data.clients, data.jobs, data.quotes, data.users].filter(Boolean) as SheetResult[]
    const total = sheets.reduce((n, s) => n + sheetTotal(s), 0)
    const errorCount = sheets.reduce((n, s) => n + s.errors.length, 0)
    if (total === 0) {
      toast("Import finished but no records were created or updated — check errors below", "error")
    } else if (errorCount > 0) {
      toast(
        `Import partially completed — ${total.toLocaleString()} records, ${errorCount} error(s). See details below.`,
        "error",
      )
    } else {
      toast(`Import complete — ${total.toLocaleString()} records`, "success")
    }
  }

  const importExcel = async (file: File) => {
    setImportingExcel(true)
    setImportResult(null)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/import/excel", { method: "POST", body: form })
      const raw = await res.text()
      let data: ImportResult & { error?: string }
      try {
        data = JSON.parse(raw) as ImportResult & { error?: string }
      } catch {
        const timedOut = res.status === 504 || /timeout|timed out/i.test(raw)
        toast(
          timedOut
            ? "Import timed out — try a smaller file or retry after deploy finishes"
            : `Import failed (${res.status})`,
          "error",
        )
        return
      }
      if (!res.ok) {
        toast(data.error ?? `Import failed (${res.status})`, "error")
        if (data.clients || data.jobs || data.quotes || data.users) setImportResult(data)
        return
      }
      summariseImport(data)
    } catch {
      toast("Import failed — network error", "error")
    } finally {
      setImportingExcel(false)
    }
  }

  const importJson = async (file: File) => {
    setImportingJson(true)
    setImportResult(null)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/backups/import-data", { method: "POST", body: form })
      const data = await res.json() as ImportResult & { error?: string }
      if (!res.ok) {
        toast(data.error ?? `Import failed (${res.status})`, "error")
        if (data.clients || data.jobs || data.quotes || data.users) setImportResult(data)
        return
      }
      summariseImport(data)
      load()
    } catch {
      toast("Import failed — network error", "error")
    } finally {
      setImportingJson(false)
    }
  }

  const completed = backups.filter(b => b.status === "COMPLETED")
  const latestCompleted = completed[0]
  const totalRows = latestCompleted?.rowCountsJson
    ? Object.values(JSON.parse(latestCompleted.rowCountsJson) as Record<string, number>).reduce((a, b) => a + b, 0)
    : null

  const importSheets = (["users", "clients", "jobs", "quotes"] as const).filter(
    key => importResult && importResult[key],
  )

  return (
    <PageShell wide>
      <DataPanel className="mb-4 p-4 border border-bd bg-surface-low text-sm text-t1">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-ac shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-2">
            <p className="font-medium">
              {localBackupSupported ? "Recovery options" : "Production recovery (Supabase)"}
            </p>
            <ul className="text-t2 text-sm space-y-1 list-disc pl-4">
              <li>
                <strong className="text-t1">Primary:</strong> Supabase project backups / PITR in the
                Supabase dashboard — restores the full live database.
              </li>
              <li>
                <strong className="text-t1">Full data (JSON):</strong> versioned pack of Users (no password
                hashes), Clients, Jobs, and Quotes — includes a sha256 checksum. Restored users get a
                temporary password and must set a new one on next login.
              </li>
              <li>
                <strong className="text-t1">Excel:</strong> human-readable export/import including
                Users directory, Jobs (designer + dates), Clients, and Quotes. Excel does not store
                login password hashes — restored users without a hash must set a new password.
              </li>
              {!localBackupSupported && (
                <li>
                  Local SQLite scheduled dumps are disabled here because Supabase is the source of truth.
                </li>
              )}
            </ul>
          </div>
        </div>
      </DataPanel>

      <PageHeader
        title="System Backup"
        description={
          localBackupSupported
            ? `Automated daily at ~02:00 · ${backups.length} backup${backups.length !== 1 ? "s" : ""} recorded`
            : `Live export & import · ${backups.length} historical backup record${backups.length !== 1 ? "s" : ""}`
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load} disabled={loading || busy}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadLogicalJson}
              loading={exportingJson}
              disabled={busy}
              title="Download Users, Clients, Jobs, and Quotes as a recoverable JSON pack"
            >
              <FileJson2 className="h-3.5 w-3.5" />
              Export full data
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadExcel}
              loading={exportingExcel}
              disabled={busy}
              title="Download business data as an Excel workbook"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export Excel
            </Button>
            <label className={cn(
              "inline-flex items-center gap-1.5 text-sm font-medium rounded-md px-3 py-1.5 border border-bd cursor-pointer",
              "bg-sr text-t1 hover:bg-hover-surface transition-colors",
              (busy) && "opacity-50 pointer-events-none",
            )}>
              {importingJson
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Upload className="h-3.5 w-3.5" />}
              {importingJson ? "Importing…" : "Import JSON"}
              <input
                type="file"
                accept=".json,application/json"
                className="sr-only"
                disabled={busy}
                onChange={e => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = "" }}
              />
            </label>
            <label className={cn(
              "inline-flex items-center gap-1.5 text-sm font-medium rounded-md px-3 py-1.5 border border-bd cursor-pointer",
              "bg-sr text-t1 hover:bg-hover-surface transition-colors",
              busy && "opacity-50 pointer-events-none",
            )}>
              {importingExcel
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Upload className="h-3.5 w-3.5" />}
              {importingExcel ? "Importing…" : "Import Excel"}
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                disabled={busy}
                onChange={e => { const f = e.target.files?.[0]; if (f) importExcel(f); e.target.value = "" }}
              />
            </label>
            {localBackupSupported && (
              <Button
                variant="primary"
                size="sm"
                onClick={startManualBackup}
                disabled={starting || busy || backups.some(b => b.status === "RUNNING" || b.status === "PENDING")}
              >
                <Play className="h-3.5 w-3.5" />
                {starting ? "Starting…" : "Run backup now"}
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiTile
          label={localBackupSupported ? "Last local backup" : "Local SQLite dumps"}
          value={
            localBackupSupported
              ? (latestCompleted
                ? format(new Date(latestCompleted.completedAt!), "d MMM yyyy, HH:mm")
                : "Never")
              : "Use JSON / Supabase"
          }
          accent="var(--color-ac)"
        />
        <KpiTile label="Size" value={formatBytes(latestCompleted?.sizeBytes ?? null)} accent="var(--color-ac2)" />
        <KpiTile label="Rows backed up" value={totalRows?.toLocaleString() ?? "—"} accent="var(--color-wn)" />
        <KpiTile
          label="Storage location"
          value={
            <span className="text-sm type-drawing-number font-normal truncate block">
              {localBackupSupported ? (backupsDir || "—") : "Supabase + downloads"}
            </span>
          }
          accent="var(--color-gy)"
        />
      </div>

      {importResult && (
        <DataPanel className="overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-bd flex items-center justify-between">
            <p className="type-label text-t3">Import result</p>
            <button type="button" onClick={() => setImportResult(null)} className="text-xs text-t4 hover:text-t2">
              Dismiss
            </button>
          </div>
          <div className="divide-y divide-bd">
            {importSheets.map(sheet => {
              const r = importResult[sheet]!
              const hasErrors = r.errors.length > 0
              return (
                <div key={sheet} className="px-4 py-3">
                  <div className="flex items-center gap-4 mb-1 flex-wrap">
                    <span className="text-xs font-semibold text-t1 capitalize w-16">{sheet}</span>
                    <span className="text-xs text-ok-tx">{r.created} created</span>
                    <span className="text-xs text-ac">{r.updated} updated</span>
                    {r.skipped > 0 && <span className="text-xs text-t4">{r.skipped} skipped</span>}
                  </div>
                  {hasErrors && (
                    <div className="mt-1 space-y-0.5">
                      {r.errors.slice(0, 5).map((e, i) => (
                        <p key={i} className="type-helper type-drawing-number text-dn-tx">{e}</p>
                      ))}
                      {r.errors.length > 5 && (
                        <p className="type-helper text-t4">…and {r.errors.length - 5} more errors</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </DataPanel>
      )}

      <BackupsList
        backups={backups}
        loading={loading}
        localBackupSupported={localBackupSupported}
      />

      {auditLog.length > 0 && (
        <DataPanel className="overflow-hidden">
          <div className="px-4 py-3 border-b border-bd">
            <p className="type-label text-t3">Audit log</p>
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
        </DataPanel>
      )}
    </PageShell>
  )
}
