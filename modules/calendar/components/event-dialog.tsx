"use client"
import { useEffect, useState } from "react"
import { format } from "date-fns"
import Link from "next/link"
import { Trash2, MapPin, Video, CalendarOff, Users, ClipboardList, ExternalLink } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input }  from "@/shared/ui/input"
import { Label }  from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogBody,
} from "@/shared/ui/dialog"
import { useToast } from "@/shared/ui/toast"
import { useUser } from "@/shared/providers/user-context"
import { isExperimentalEnabled } from "@/shared/experimental/experimental-features"
import { CATEGORY_COLOUR_DEFAULTS } from "../config/category-config"

const EVENT_TYPES = [
  { id: "cat_site_visit", name: "Site Visit", color: CATEGORY_COLOUR_DEFAULTS.cat_site_visit.color, icon: MapPin },
  { id: "cat_client_meeting", name: "Client Meeting", color: CATEGORY_COLOUR_DEFAULTS.cat_client_meeting.color, icon: Users },
  { id: "cat_teams_meeting", name: "Meeting", color: CATEGORY_COLOUR_DEFAULTS.cat_teams_meeting.color, icon: Video },
  { id: "cat_internal_meeting", name: "Internal", color: CATEGORY_COLOUR_DEFAULTS.cat_internal_meeting.color, icon: ClipboardList },
  ...(isExperimentalEnabled("leave")
    ? [{ id: "cat_leave" as const, name: "Leave", color: CATEGORY_COLOUR_DEFAULTS.cat_leave.color, icon: CalendarOff }]
    : []),
]

interface UserOption { id: string; name: string }
interface CalendarEvent {
  id: string; title: string; description: string | null
  categoryId: string; startDate: string; endDate: string; allDay: number
  location: string | null; priority: string; status: string
  jobId: string | null; clientId: string | null
  assignees: { userId: string; userName: string }[]
  categoryName: string; categoryColor: string
  jobDrawingNumber?: string | null
}

interface EventDialogProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  event?: CalendarEvent | null
  defaultDate?: string
  defaultCategoryId?: string
  /** When provided by calendar page, skip a duplicate /api/users fetch. */
  users?: UserOption[]
}

export function EventDialog({
  open, onClose, onSaved, event, defaultDate, defaultCategoryId, users: usersProp,
}: EventDialogProps) {
  const { toast } = useToast()
  const { isAdmin } = useUser()
  const isEdit = !!event

  const [usersLocal, setUsersLocal]     = useState<UserOption[]>([])
  const users = usersProp ?? usersLocal
  const [saving, setSaving]             = useState(false)
  const [deleting, setDeleting]         = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [title, setTitle]           = useState("")
  const [categoryId, setCategoryId] = useState("cat_site_visit")
  const [startDate, setStartDate]   = useState("")
  const [startTime, setStartTime]   = useState("09:00")
  const [endDate, setEndDate]       = useState("")
  const [endTime, setEndTime]       = useState("10:00")
  const [description, setDescription] = useState("")
  const [location, setLocation]     = useState("")
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])

  useEffect(() => {
    if (!open || usersProp) return
    fetch("/api/users")
      .then(r => r.ok ? r.json() as Promise<{ users: (UserOption & { active?: number })[] }> : null)
      .then(d => { if (d) setUsersLocal(d.users.filter(u => u.active !== 0)) })
      .catch(() => {})
  }, [open, usersProp])

  useEffect(() => {
    if (!open) { setConfirmDelete(false); return }
    if (event) {
      setTitle(event.title)
      setCategoryId(event.categoryId)
      setStartDate(event.startDate.slice(0, 10))
      setStartTime(event.startDate.length > 10 ? event.startDate.slice(11, 16) : "09:00")
      setEndDate(event.endDate.slice(0, 10))
      setEndTime(event.endDate.length > 10 ? event.endDate.slice(11, 16) : "10:00")
      setDescription(event.description ?? "")
      setLocation(event.location ?? "")
      setAssigneeIds(event.assignees.map(a => a.userId))
    } else {
      const d = defaultDate ?? format(new Date(), "yyyy-MM-dd")
      setTitle(""); setDescription(""); setLocation("")
      setStartDate(d); setEndDate(d)
      setStartTime("09:00"); setEndTime("10:00")
      setCategoryId(defaultCategoryId ?? "cat_site_visit")
      setAssigneeIds([])
    }
  }, [open, event, defaultDate, defaultCategoryId])

  const _selectedType = EVENT_TYPES.find(t => t.id === categoryId) ?? EVENT_TYPES[0]

  const isLeave = categoryId === "cat_leave"

  const handleSave = async () => {
    if (!title.trim()) { toast("Title is required", "error"); return }
    if (!startDate || !endDate) { toast("Date is required", "error"); return }

    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        categoryId,
        startDate: isLeave
          ? `${startDate}T00:00:00.000Z`
          : `${startDate}T${startTime}:00`,
        endDate: isLeave
          ? `${endDate}T23:59:59.999Z`
          : `${endDate}T${endTime}:00`,
        allDay: isLeave,
        description: description.trim() || null,
        location:    location.trim() || null,
        priority: "MEDIUM",
        status: "SCHEDULED",
        assigneeIds,
      }

      const url = isEdit ? `/api/calendar/events/${event!.id}` : "/api/calendar/events"
      const method = isEdit ? "PATCH" : "POST"

      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { toast(data.error ?? "Failed to save", "error"); return }

      toast(isEdit ? "Event updated" : "Event created", "success")
      onSaved()
      onClose()
    } catch { toast("Network error", "error") }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!event) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/calendar/events/${event.id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        toast(data.error ?? "Failed to delete", "error"); return
      }
      toast("Event deleted", "success")
      onSaved()
      onClose()
    } catch { toast("Network error", "error") }
    finally { setDeleting(false) }
  }

  const toggleAssignee = (uid: string) => {
    setAssigneeIds(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid])
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !saving && !deleting) onClose() }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit event" : "New event"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">

            {/* Event type selector */}
            <div className="flex flex-col gap-1.5">
              <Label>Event type</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {EVENT_TYPES.map(t => {
                  const Icon = t.icon
                  const active = categoryId === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setCategoryId(t.id)}
                      className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition-colors sm:text-sm"
                      style={{
                        borderColor: active ? t.color : "var(--color-bd)",
                        backgroundColor: active ? t.color + "12" : "transparent",
                        color: active ? t.color : "var(--color-t2)",
                      }}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{t.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Title */}
            <div className="flex flex-col gap-1.5">
              <Label>Title *</Label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={
                  categoryId === "cat_site_visit"
                    ? "e.g. Survey — ABC Construction"
                    : categoryId === "cat_leave"
                      ? "e.g. John Smith — Annual Leave"
                      : "e.g. Weekly Operations Meeting"
                }
                autoFocus
              />
            </div>

            <div className={`grid gap-3 ${isLeave ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
              <div className="flex flex-col gap-1.5">
                <Label>Start date *</Label>
                <Input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); if (!endDate || endDate < e.target.value) setEndDate(e.target.value) }} />
              </div>
              {!isLeave && (
                <div className="flex flex-col gap-1.5">
                  <Label>Start time *</Label>
                  <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label>End date *</Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
              {!isLeave && (
                <div className="flex flex-col gap-1.5">
                  <Label>End time *</Label>
                  <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
                </div>
              )}
            </div>

            {/* Location */}
            {!isLeave && (
            <div className="flex flex-col gap-1.5">
              <Label>{categoryId === "cat_site_visit" ? "Site address" : "Location (optional)"}</Label>
              <Input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder={categoryId === "cat_site_visit" ? "e.g. 14 Clifton Road, Bristol" : "e.g. Teams / Meeting Room 2"}
              />
            </div>
            )}

            {/* Assigned staff */}
            {users.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>Assigned staff</Label>
                <div className="border border-bd rounded-md p-2 max-h-[120px] overflow-y-auto thin-scroll space-y-0.5" style={{ borderColor: "var(--color-bd)" }}>
                  {users.map(u => (
                    <label key={u.id} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-hover-surface cursor-pointer text-xs text-t2">
                      <input
                        type="checkbox"
                        checked={assigneeIds.includes(u.id)}
                        onChange={() => toggleAssignee(u.id)}
                        className="h-3.5 w-3.5 accent-ac rounded"
                      />
                      {u.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="flex flex-col gap-1.5">
              <Label>Notes</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Additional details…" />
            </div>

            {isEdit && event?.jobId ? (
              <Link
                href={`/jobs/${event.jobId}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-ac2 transition-colors hover:text-ac2h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ac/35 rounded"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                Open linked job{event.jobDrawingNumber ? ` · ${event.jobDrawingNumber}` : ""}
              </Link>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <div className="flex items-center gap-2 w-full">
            {isEdit && isAdmin && !confirmDelete && (
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} className="text-t4 hover:text-dn mr-auto">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            )}
            {isEdit && isAdmin && confirmDelete && (
              <div className="flex items-center gap-2 mr-auto">
                <Button variant="danger" size="sm" onClick={handleDelete} loading={deleting} disabled={deleting}>Confirm delete</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</Button>
              </div>
            )}
            {!confirmDelete && (
              <div className="flex items-center gap-2 ml-auto">
                <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                <Button variant="primary" onClick={handleSave} loading={saving} disabled={saving}>
                  {saving ? "Saving…" : isEdit ? "Update" : "Create"}
                </Button>
              </div>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
