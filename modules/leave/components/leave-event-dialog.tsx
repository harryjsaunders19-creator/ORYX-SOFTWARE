"use client"
import Link from "next/link"
import { format } from "date-fns"
import { ExternalLink, CalendarOff } from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody,
} from "@/shared/ui/dialog"
import { ANNUAL_LEAVE_CATEGORY_ID, LEAVE_STATUS_COLORS, leaveTypeLabel } from "../constants"

export interface LeaveCalendarEvent {
  id: string
  title: string
  description: string | null
  categoryId: string
  startDate: string
  endDate: string
  status: string
  assignees: { userId: string; userName: string }[]
  leaveRequestId?: string | null
  leaveType?: string | null
  leaveReason?: string | null
  leaveReviewStatus?: string | null
  leaveUserId?: string | null
  employeeDepartment?: string | null
  managerName?: string | null
  reviewedByName?: string | null
}

interface LeaveEventDialogProps {
  open: boolean
  onClose: () => void
  event: LeaveCalendarEvent | null
}

function statusLabel(status: string): string {
  if (status === "LEAVE_APPROVED" || status === "APPROVED") return "Approved"
  if (status === "LEAVE_PENDING" || status === "PENDING") return "Pending"
  if (status === "LEAVE_REJECTED" || status === "REJECTED") return "Rejected"
  return status
}

function statusColor(status: string): string {
  return LEAVE_STATUS_COLORS[status] ?? LEAVE_STATUS_COLORS.LEAVE_APPROVED
}

export function isLeaveEvent(event: { categoryId: string }): boolean {
  return event.categoryId === ANNUAL_LEAVE_CATEGORY_ID
}

export function leaveDisplayColor(event: LeaveCalendarEvent): string {
  const s = event.leaveReviewStatus ?? event.status
  if (s === "APPROVED" || event.status === "LEAVE_APPROVED") return LEAVE_STATUS_COLORS.LEAVE_APPROVED
  if (s === "PENDING" || event.status === "LEAVE_PENDING") return LEAVE_STATUS_COLORS.LEAVE_PENDING
  return LEAVE_STATUS_COLORS.LEAVE_REJECTED
}

export function LeaveEventDialog({ open, onClose, event }: LeaveEventDialogProps) {
  if (!event) return null

  const employeeName = event.assignees[0]?.userName ?? event.title.split(" — ")[0] ?? "Employee"
  const leaveType = event.leaveType ? leaveTypeLabel(event.leaveType) : "Annual Leave"
  const reviewStatus = event.leaveReviewStatus ?? event.status
  const color = statusColor(reviewStatus === "APPROVED" || event.status === "LEAVE_APPROVED"
    ? "LEAVE_APPROVED"
    : reviewStatus === "PENDING" || event.status === "LEAVE_PENDING"
      ? "LEAVE_PENDING"
      : "LEAVE_REJECTED")

  const profileHref = event.leaveUserId ?? event.assignees[0]?.userId
    ? `/employees/${event.leaveUserId ?? event.assignees[0]?.userId}`
    : null

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarOff className="h-4 w-4" style={{ color }} />
            Leave request
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 type-badge"
              style={{ backgroundColor: color + "20", color }}
            >
              {statusLabel(reviewStatus === "APPROVED" || event.status === "LEAVE_APPROVED"
                ? "APPROVED"
                : reviewStatus === "PENDING" || event.status === "LEAVE_PENDING"
                  ? "PENDING"
                  : "REJECTED")}
            </span>
            {event.employeeDepartment && (
              <span className="text-xs text-t3">{event.employeeDepartment}</span>
            )}
          </div>

          <dl className="grid gap-2 text-sm">
            <Row label="Employee" value={employeeName} />
            <Row label="Leave type" value={leaveType} />
            <Row label="Start" value={format(new Date(event.startDate.slice(0, 10)), "EEE d MMM yyyy")} />
            <Row label="End" value={format(new Date(event.endDate.slice(0, 10)), "EEE d MMM yyyy")} />
            {event.leaveReason && <Row label="Reason" value={event.leaveReason} />}
            {event.managerName && <Row label="Manager" value={event.managerName} />}
            {event.reviewedByName && <Row label="Reviewed by" value={event.reviewedByName} />}
          </dl>

          {profileHref && (
            <Button variant="outline" size="sm" asChild className="w-full">
              <Link href={profileHref}>
                View employee profile <ExternalLink className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-bd pb-2 last:border-0">
      <dt className="text-t3 shrink-0">{label}</dt>
      <dd className="text-t1 text-right font-medium">{value}</dd>
    </div>
  )
}
