"use client"
import { useCallback, useEffect, useState } from "react"
import { format } from "date-fns"
import { Check, Loader2, X } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { useToast } from "@/shared/ui/toast"
import { apiErrorDetail } from "@/shared/utils/error-message"
import { leaveTypeLabel } from "../constants"

interface PendingLeave {
  id: string
  userId: string
  userName: string
  leaveType: string
  startDate: string
  endDate: string
  reason: string | null
  department: string | null
}

interface LeaveAcceptancePanelProps {
  onAccepted: () => void
}

export function LeaveAcceptancePanel({ onAccepted }: LeaveAcceptancePanelProps) {
  const { toast } = useToast()
  const [pending, setPending] = useState<PendingLeave[]>([])
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/leave/requests?status=PENDING")
      if (!res.ok) throw new Error()
      const data = await res.json() as { requests: PendingLeave[] }
      setPending(data.requests)
    } catch {
      toast("Failed to load pending leave", "error")
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const review = async (requestId: string, action: "approve" | "reject") => {
    setActingId(requestId)
    try {
      const res = await fetch(`/api/leave/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error(apiErrorDetail(await res.json().catch(() => null), res.status))
      toast(action === "approve" ? "Leave accepted" : "Leave declined", "success")
      setPending(prev => prev.filter(r => r.id !== requestId))
      onAccepted()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Action failed", "error")
    } finally {
      setActingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-bd bg-surface px-4 py-3 text-sm text-t3">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading pending leave…
      </div>
    )
  }

  if (pending.length === 0) return null

  return (
    <div className="rounded-lg border border-bd bg-surface mb-4 overflow-hidden">
      <div className="border-b border-bd px-4 py-2.5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-t1">Pending leave — admin acceptance</h2>
        <span className="text-xs font-medium text-t3 tabular-nums">{pending.length} awaiting</span>
      </div>
      <ul className="divide-y divide-bd">
        {pending.map(r => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-t1">{r.userName}</p>
              <p className="text-xs text-t3 mt-0.5">
                {leaveTypeLabel(r.leaveType)}
                {r.department ? ` · ${r.department}` : ""}
                {" · "}
                {format(new Date(r.startDate), "d MMM")} – {format(new Date(r.endDate), "d MMM yyyy")}
              </p>
              {r.reason && <p className="text-xs text-t2 mt-1 truncate">{r.reason}</p>}
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                variant="primary"
                disabled={actingId === r.id}
                onClick={() => review(r.id, "approve")}
              >
                <Check className="h-3.5 w-3.5" /> Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={actingId === r.id}
                onClick={() => review(r.id, "reject")}
              >
                <X className="h-3.5 w-3.5" /> Decline
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
