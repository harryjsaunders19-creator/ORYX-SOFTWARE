"use client"

import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, XCircle, RefreshCw, Loader2, Database, AlertTriangle } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { surfaceCard } from "@/shared/layouts/page-layout"
import { cn } from "@/shared/utils/utils"
import type { SupabaseStatusReport } from "@/shared/supabase/status-report"

export function SupabaseStatusSection() {
  const [data, setData] = useState<SupabaseStatusReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/supabase/status")
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }
      setData(await res.json() as SupabaseStatusReport)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const healthy = data?.summary.healthy

  return (
    <div className="mt-8 pt-6 border-t border-bd">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <Database className="h-5 w-5 text-ac shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-t1">Supabase integration</p>
            <p className="text-xs text-t3 mt-0.5">
              Production database status, module flags, and migration readiness.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded border border-dn-bd bg-dn-bg p-3 mb-3 text-xs text-dn-tx">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center gap-2 py-6 text-sm text-t3">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking Supabase…
        </div>
      )}

      {data && (
        <>
          <div className={cn(
            "rounded border px-4 py-3 mb-4 flex items-center gap-3",
            healthy ? "border-ok-bd bg-ok-bg" : "border-wn-bd bg-wn-bg",
          )}>
            {healthy
              ? <CheckCircle2 className="h-5 w-5 text-ok-ic shrink-0" />
              : <AlertTriangle className="h-5 w-5 text-wn shrink-0" />}
            <div className="min-w-0">
              <p className={cn("text-sm font-semibold", healthy ? "text-ok-tx" : "text-wn-tx")}>
                {healthy ? "Supabase fully ready" : data.message}
              </p>
              <p className="text-xs text-t3 mt-0.5 truncate">
                {data.url ?? "Not connected"}
                {data.onVercel && " · Vercel"}
                {data.anonHealthOk === false && data.serviceRoleOk && " · anon key invalid (service role OK)"}
                {data.sqliteStillActive && " · SQLite fallback active for some modules"}
              </p>
            </div>
          </div>

          {data.warnings.length > 0 && (
            <div className={cn(surfaceCard, "mb-4 p-4 border-wn-bd bg-wn-bg/40")}>
              <p className="text-xs font-semibold text-wn-tx mb-2">Warnings ({data.warnings.length})</p>
              <ul className="space-y-1 text-xs text-t2 list-disc pl-4">
                {data.warnings.slice(0, 8).map(warning => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {data.issues.length > 0 && (
            <div className={cn(surfaceCard, "mb-4 p-4")}>
              <p className="text-xs font-semibold text-t1 mb-2">Issues ({data.issues.length})</p>
              <ul className="space-y-1 text-xs text-t2 list-disc pl-4">
                {data.issues.slice(0, 8).map(issue => (
                  <li key={issue}>{issue}</li>
                ))}
                {data.issues.length > 8 && (
                  <li className="text-t3">…and {data.issues.length - 8} more</li>
                )}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            {data.modules.map(mod => {
              const open = expanded === mod.id
              const modOk = mod.ready && (!mod.enabled || mod.tables.every(t => t.ready))
              return (
                <div key={mod.id} className={cn(surfaceCard, "overflow-hidden")}>
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : mod.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-pg/50"
                  >
                    {modOk
                      ? <CheckCircle2 className="h-4 w-4 text-ok-ic shrink-0" />
                      : <XCircle className="h-4 w-4 text-dn shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-t1">{mod.label}</p>
                      <p className="type-helper text-t3 mt-0.5">
                        {mod.enabled ? "Reading from Supabase" : "SQLite (disabled or no service role)"}
                        {" · "}
                        {mod.tables.filter(t => t.ready).length}/{mod.tables.length} tables
                      </p>
                    </div>
                    <span className="type-helper type-drawing-number text-t4 shrink-0">{mod.envVar}</span>
                  </button>
                  {open && (
                    <div className="border-t border-bd bg-pg/30 px-4 py-3 text-xs space-y-2">
                      <p className="text-t3">
                        Migration: <span className="type-drawing-number text-t2">{mod.migration}</span>
                      </p>
                      <p className="text-t3">Sync: <span className="type-drawing-number text-t2">{mod.syncScript}</span></p>
                      {mod.tables.map(t => (
                        <div key={t.name} className="flex justify-between gap-2">
                          <span className="type-drawing-number text-t2">{t.name}</span>
                          <span className={t.ready ? "text-ok-tx" : "text-dn-tx"}>
                            {t.ready ? `${t.count ?? 0} rows` : (t.error ?? "missing")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <details className="mt-4">
            <summary className="text-xs font-medium text-t2 cursor-pointer hover:text-t1">
              Go-live checklist
            </summary>
            <ol className="mt-2 space-y-1.5 text-xs text-t3 list-decimal pl-5">
              {data.goLiveSteps.map(step => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </details>
        </>
      )}
    </div>
  )
}
