"use client"
import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, XCircle, RefreshCw, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RequireRole } from "@/components/require-role"
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
    </div>
  )
}
