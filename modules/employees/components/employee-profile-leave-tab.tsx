"use client"
import { useCallback, useEffect, useState } from "react"
import { format } from "date-fns"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"
import { useToast } from "@/shared/ui/toast"
import { DataPanel, DetailPanel, KpiTile } from "@/shared/layouts/page-layout"
import { apiErrorDetail } from "@/shared/utils/error-message"
import type { EmployeeDetail } from "../services/employee-service"

export function LeaveTab({
  employeeId,
  emp,
  canRequest,
  canReview,
  onChange,
}: {
  employeeId: string
  emp: EmployeeDetail
  canRequest: boolean
  canReview: boolean
  onChange: () => void
}) {
  const { toast } = useToast()
  const [requests, setRequests] = useState<Array<{
    id: string; startDate: string; endDate: string; status: string
    leaveType: string; reason: string | null; userName: string
  }>>([])
  const [loadingReqs, setLoadingReqs] = useState(true)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const loadRequests = useCallback(() => {
    setLoadingReqs(true)
    fetch(`/api/leave/requests?userId=${employeeId}`)
      .then(r => r.ok ? r.json() as Promise<{ requests: typeof requests }> : null)
      .then(d => { if (d) setRequests(d.requests) })
      .catch(() => {})
      .finally(() => setLoadingReqs(false))
  }, [employeeId])

  useEffect(() => { loadRequests() }, [loadRequests, emp.leave.upcoming.length])

  const submitRequest = async () => {
    if (!startDate || !endDate) {
      toast("Start and end dates are required", "error")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/leave/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: employeeId, startDate, endDate, reason: reason || null }),
      })
      if (!res.ok) throw new Error(apiErrorDetail(await res.json().catch(() => null), res.status))
      toast("Leave request submitted", "success")
      setStartDate("")
      setEndDate("")
      setReason("")
      onChange()
      loadRequests()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Request failed", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const review = async (requestId: string, action: "approve" | "reject") => {
    try {
      const res = await fetch(`/api/leave/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error(apiErrorDetail(await res.json().catch(() => null), res.status))
      toast(action === "approve" ? "Leave accepted" : "Leave declined", "success")
      onChange()
      setRequests(prev => prev.map(r => r.id === requestId
        ? { ...r, status: action === "approve" ? "APPROVED" : "REJECTED" }
        : r))
    } catch (e) {
      toast(e instanceof Error ? e.message : "Action failed", "error")
    }
  }

  const pending = requests.filter(r => r.status === "PENDING")

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiTile label="Annual allowance" value={emp.leave.annualLeaveAllowance} accent="var(--color-ac)" />
        <KpiTile label="Taken" value={emp.leave.leaveTaken} accent="var(--color-t3)" />
        <KpiTile label="Remaining" value={emp.leave.remaining} accent="var(--color-ac2)" />
      </div>

      {canRequest && (
        <DetailPanel title="Request leave">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Start date</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1 h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">End date</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1 h-9 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Reason (optional)</Label>
              <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className="mt-1 text-sm" />
            </div>
          </div>
          <Button variant="primary" size="sm" className="mt-3" disabled={submitting} onClick={submitRequest}>
            {submitting ? "Submitting…" : "Submit request"}
          </Button>
        </DetailPanel>
      )}

      {canReview && pending.length > 0 && (
        <DataPanel noPadding>
          <div className="border-b border-bd px-4 py-3 font-semibold text-sm text-t1">Pending approval (admin)</div>
          <ul className="divide-y divide-bd">
            {pending.map(r => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span>
                  {format(new Date(r.startDate), "d MMM")} – {format(new Date(r.endDate), "d MMM yyyy")}
                  {r.reason && <span className="text-t3 ml-2">({r.reason})</span>}
                </span>
                <span className="flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => review(r.id, "approve")}>Accept</Button>
                  <Button size="sm" variant="outline" onClick={() => review(r.id, "reject")}>Decline</Button>
                </span>
              </li>
            ))}
          </ul>
        </DataPanel>
      )}

      <DataPanel noPadding>
        <div className="border-b border-bd px-4 py-3 font-semibold text-sm text-t1">Upcoming leave</div>
        {emp.leave.upcoming.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-t4">No upcoming leave</p>
        ) : (
          <ul className="divide-y divide-bd">
            {emp.leave.upcoming.map(e => (
              <li key={e.id} className="flex justify-between px-4 py-2.5 text-sm">
                <span>{e.title}</span>
                <span className="text-t3 tabular-nums">
                  {format(new Date(e.startDate), "d MMM")} – {format(new Date(e.endDate), "d MMM yyyy")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DataPanel>

      {!loadingReqs && requests.length > 0 && (
        <DataPanel noPadding>
          <div className="border-b border-bd px-4 py-3 font-semibold text-sm text-t1">All requests</div>
          <ul className="divide-y divide-bd">
            {requests.slice(0, 15).map(r => (
              <li key={r.id} className="flex justify-between px-4 py-2.5 text-sm">
                <span>{format(new Date(r.startDate), "d MMM")} – {format(new Date(r.endDate), "d MMM yyyy")}</span>
                <span className="type-label text-t3">{r.status}</span>
              </li>
            ))}
          </ul>
        </DataPanel>
      )}
    </div>
  )
}
