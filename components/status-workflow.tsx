"use client"
import { useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { JOB_STATUSES } from "@/lib/constants"
import { StatusBadge } from "@/components/status-badge"
import { useToast }    from "@/components/ui/toast"

export function StatusWorkflow({ jobId, currentStatus, onStatusChange, patchUrl }: {
  jobId: string
  currentStatus: string
  onStatusChange: (s: string) => void
  /** Override default PATCH /api/jobs/:id — used by work-items model. */
  patchUrl?: string
}) {
  const { toast }    = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  const currentIdx = JOB_STATUSES.findIndex(s => s.value === currentStatus)

  const moveTo = async (next: string) => {
    if (next === currentStatus || busy) return
    setBusy(next)
    try {
      const res = await fetch(patchUrl ?? `/api/jobs/${jobId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status: next }),
      })
      if (!res.ok) throw new Error()
      toast(`Status → ${JOB_STATUSES.find(s => s.value === next)?.label ?? next}`, "success")
      onStatusChange(next)
    } catch { toast("Failed to update status", "error") }
    finally  { setBusy(null) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center">
        {JOB_STATUSES.map((step, idx) => {
          const done    = currentIdx > idx
          const current = currentIdx === idx
          const isLast  = idx === JOB_STATUSES.length - 1
          const loading = busy === step.value

          return (
            <div key={step.value} className="flex items-center flex-1 min-w-0">
              <button
                onClick={() => moveTo(step.value)}
                disabled={!!busy || current}
                title={step.label}
                className={cn(
                  "group flex flex-col items-center gap-1 flex-1 min-w-0 py-1 rounded",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-ac focus-visible:ring-inset",
                  !current && !busy && "hover:bg-pg cursor-pointer",
                  current  && "cursor-default",
                  busy && !loading && "opacity-40 cursor-not-allowed",
                )}
              >
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center border-2 shrink-0",
                  done    && "bg-ac border-ac",
                  current && "bg-sr border-ac",
                  !done && !current && "bg-sr border-bd",
                )}>
                  {loading
                    ? <Loader2 className="h-3.5 w-3.5 text-t3 animate-spin" />
                    : done
                    ? <Check className="h-3.5 w-3.5 text-sr" strokeWidth={2.5} />
                    : <span className={cn("type-badge tabular-nums", current ? "text-ac" : "text-t4")}>
                        {idx + 1}
                      </span>}
                </div>
                <span className={cn(
                  "type-helper leading-tight text-center w-full truncate px-0.5",
                  done    && "font-medium text-t2",
                  current && "font-semibold text-t1",
                  !done && !current && "text-t4",
                )}>
                  {step.shortLabel}
                </span>
              </button>
              {!isLast && (
                <div className={cn("h-px w-3 shrink-0 mx-0.5", done ? "bg-ac" : "bg-bd")} />
              )}
            </div>
          )
        })}
      </div>

      {/* Current status */}
      <div className="flex items-center gap-2">
        <StatusBadge status={currentStatus} />
        {currentStatus === "ISSUED" && (
          <span className="text-xs text-t3 italic">Ready for invoicing</span>
        )}
      </div>
    </div>
  )
}
