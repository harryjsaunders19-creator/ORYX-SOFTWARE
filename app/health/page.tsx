"use client"
import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, XCircle, RefreshCw, Loader2, AlertTriangle, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input }  from "@/components/ui/input"
import { Label }  from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogBody,
} from "@/components/ui/dialog"
import { RequireRole } from "@/components/require-role"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

interface Check { ok: boolean; message: string; detail?: unknown }
interface Health {
  status:  "healthy" | "degraded"
  checks:  Record<string, Check>
  time:    string
  runtime: { node: string; env: string }
}

function CheckRow({ name, check }: { name: string; check: Check }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-sr border border-bd rounded-md overflow-hidden">
      <div className={cn("flex items-center gap-3 px-4 py-3", !check.ok && "bg-dn-bg")}>
        {check.ok
          ? <CheckCircle2 className="h-4 w-4 text-ok-ic shrink-0" />
          : <XCircle      className="h-4 w-4 text-dn  shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-t1 capitalize">{name}</p>
          <p className={cn("text-xs mt-0.5", check.ok ? "text-t3" : "text-dn-tx")}>
            {check.message}
          </p>
        </div>
        {check.detail != null && (
          <button
            onClick={() => setOpen(o => !o)}
            className="text-xs text-t3 hover:text-t2"
          >
            {open ? "hide" : "details"}
          </button>
        )}
      </div>
      {open && check.detail != null && (
        <pre className="px-4 py-3 text-xs bg-pg border-t border-bd overflow-x-auto text-t2 thin-scroll">
          {JSON.stringify(check.detail, null, 2)}
        </pre>
      )}
    </div>
  )
}

export default function HealthPage() {
  return <RequireRole roles={["ADMIN"]}><HealthPageInner /></RequireRole>
}

function HealthPageInner() {
  const [data,    setData]    = useState<Health | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const run = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      setData(await fetch("/api/health").then(r => r.json()) as Health)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { run() }, [run])

  const healthy = data?.status === "healthy"

  return (
    <div className="px-6 py-6 max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-t1">Health</h1>
          <p className="text-sm text-t3 mt-0.5">Database and API status</p>
        </div>
        <Button variant="outline" size="sm" onClick={run} disabled={loading}>
          {loading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      {/* Overall status banner */}
      {data && (
        <div className={cn(
          "rounded border px-4 py-3 mb-4 flex items-center gap-3",
          healthy ? "border-ok-bd bg-ok-bg" : "border-dn-bd bg-dn-bg",
        )}>
          {healthy
            ? <CheckCircle2 className="h-5 w-5 text-ok-ic shrink-0" />
            : <XCircle      className="h-5 w-5 text-dn  shrink-0" />}
          <div>
            <p className={cn("text-sm font-semibold", healthy ? "text-ok-tx" : "text-dn-tx")}>
              {healthy ? "All systems operational" : "One or more checks failed"}
            </p>
            <p className="text-xs text-t3 mt-0.5">
              {new Date(data.time).toLocaleTimeString()} · Node {data.runtime.node}
            </p>
          </div>
        </div>
      )}

      {/* Request error */}
      {error && (
        <div className="rounded border border-dn-bd bg-dn-bg p-4 mb-4">
          <p className="text-sm font-medium text-dn-tx">Request failed</p>
          <p className="text-xs font-mono text-dn mt-1">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="flex items-center justify-center py-12 text-t3 gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Running checks…</span>
        </div>
      )}

      {/* Check rows */}
      {data && (
        <div className="space-y-2">
          {Object.entries(data.checks).map(([name, check]) => (
            <CheckRow key={name} name={name} check={check} />
          ))}
        </div>
      )}

      <ExportDataSection />
      <ResetDataSection />
    </div>
  )
}

function ExportDataSection() {
  const { toast } = useToast()
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch("/api/export/all")
      if (!res.ok) { toast("Export failed", "error"); return }
      const blob = await res.blob()
      const disposition = res.headers.get("Content-Disposition") ?? ""
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match?.[1] ?? "oryx-export.xlsx"
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = filename
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast("Export downloaded", "success")
    } catch { toast("Export failed", "error") }
    finally { setExporting(false) }
  }

  return (
    <div className="mt-8 pt-6 border-t border-bd">
      <div className="flex items-start gap-3">
        <Download className="h-5 w-5 text-ac shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-t1">Export all data</p>
          <p className="text-xs text-t3 mt-0.5 mb-3">
            Download a single Excel file with all jobs, clients, upcoming calendar events, and invoicing data — each on its own sheet.
          </p>
          <Button variant="primary" size="sm" onClick={handleExport} loading={exporting} disabled={exporting}>
            <Download className="h-3.5 w-3.5" />
            {exporting ? "Exporting…" : "Export to Excel"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ResetDataSection() {
  const { toast } = useToast()
  const [open, setOpen]               = useState(false)
  const [password, setPassword]       = useState("")
  const [phrase, setPhrase]           = useState("")
  const [resetting, setResetting]     = useState(false)
  const [error, setError]             = useState("")

  const canSubmit = password.length > 0 && phrase === "RESET ALL DATA"

  const handleReset = async () => {
    setError("")
    setResetting(true)
    try {
      const res = await fetch("/api/admin/reset-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmPhrase: phrase }),
      })
      const body = await res.json() as { ok?: boolean; cleared?: { jobCount: number; clientCount: number; quoteCount: number }; error?: string }
      if (!res.ok) { setError(body.error ?? "Reset failed"); return }

      setOpen(false)
      setPassword("")
      setPhrase("")
      toast(`Cleared ${body.cleared?.jobCount ?? 0} jobs, ${body.cleared?.clientCount ?? 0} clients, ${body.cleared?.quoteCount ?? 0} quotes`, "success")
    } catch {
      setError("Connection error")
    } finally {
      setResetting(false)
    }
  }

  return (
    <>
      <div className="mt-8 pt-6 border-t border-bd">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-dn shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-t1">Reset all data</p>
            <p className="text-xs text-t3 mt-0.5 mb-3">
              Permanently delete all jobs, clients, quotes, and billing data. User accounts are preserved. This cannot be undone.
            </p>
            <Button variant="danger" size="sm" onClick={() => { setOpen(true); setError(""); setPassword(""); setPhrase("") }}>
              Reset all data
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={o => { if (!o && !resetting) setOpen(false) }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Reset all data</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="rounded-md p-3 mb-4" style={{ backgroundColor: "var(--color-dn-bg)", border: "1px solid var(--color-dn-bd)" }}>
              <p className="text-xs font-semibold text-dn-tx mb-1">This will permanently delete:</p>
              <ul className="text-xs text-dn-tx space-y-0.5 list-disc pl-4">
                <li>All jobs, revisions, and status history</li>
                <li>All clients and hold records</li>
                <li>All quotes and line items</li>
                <li>All billing and export history</li>
                <li>All drawing number sequences (reset to 001)</li>
              </ul>
              <p className="text-xs text-dn-tx mt-2 font-medium">User accounts are NOT deleted.</p>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col gap-1.5">
                <Label>Your password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your admin password"
                  autoComplete="current-password"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Type <span className="font-mono font-bold">RESET ALL DATA</span> to confirm</Label>
                <Input
                  value={phrase}
                  onChange={e => setPhrase(e.target.value)}
                  placeholder="RESET ALL DATA"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>

            {error && (
              <div className="mt-3 p-2.5 rounded-md text-xs font-medium" style={{ backgroundColor: "var(--color-dn-bg)", color: "var(--color-dn-tx)" }}>
                {error}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={resetting}>Cancel</Button>
            <Button variant="danger" onClick={handleReset} loading={resetting} disabled={!canSubmit || resetting}>
              {resetting ? "Resetting…" : "Permanently reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
