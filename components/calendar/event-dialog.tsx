"use client"
import { useEffect, useState } from "react"
import { format } from "date-fns"
import { Trash2, MapPin, Video } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input }  from "@/components/ui/input"
import { Label }  from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogBody,
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { useUser } from "@/components/user-context"

const EVENT_TYPES = [
  { id: "cat_site_visit",    name: "Site Visit",     color: "#3B82F6", icon: MapPin },
  { id: "cat_teams_meeting", name: "Teams Meeting",  color: "#A855F7", icon: Video },
] as const

interface UserOption { id: string; name: string }
interface CalendarEvent {
  id: string; title: string; description: string | null
  categoryId: string; startDate: string; endDate: string; allDay: number
  location: string | null; priority: string; status: string
  jobId: string | null; clientId: string | null
  assignees: { userId: string; userName: string }[]
  categoryName: string; categoryColor: string
}

interface EventDialogProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  event?: CalendarEvent | null
  defaultDate?: string
  defaultCategoryId?: string
}

export function EventDialog({ open, onClose, onSaved, event, defaultDate, defaultCategoryId }: EventDialogProps) {
  const { toast } = useToast()
  const { isAdmin } = useUser()
  const isEdit = !!event

  const [users, setUsers]               = useState<UserOption[]>([])
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
    if (!open) return
    fetch("/api/users")
      .then(r => r.ok ? r.json() as Promise<{ users: (UserOption & { active?: number })[] }> : null)
      .then(d => { if (d) setUsers(d.users.filter(u => u.active !== 0)) })
      .catch(() => {})
  }, [open])

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

  const handleSave = async () => {
    if (!title.trim()) { toast("Title is required", "error"); return }
    if (!startDate || !endDate) { toast("Date is required", "error"); return }

    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        categoryId,
        startDate: `${startDate}T${startTime}:00`,
        endDate:   `${endDate}T${endTime}:00`,
        allDay: false,
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
              <div className="flex gap-2">
                {EVENT_TYPES.map(t => {
                  const Icon = t.icon
                  const active = categoryId === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setCategoryId(t.id)}
                      className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors"
                      style={{
                        borderColor: active ? t.color : "var(--color-bd)",
                        backgroundColor: active ? t.color + "12" : "transparent",
                        color: active ? t.color : "var(--color-t2)",
                      }}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {t.name}
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
                placeholder={categoryId === "cat_site_visit" ? "e.g. Survey — ABC Construction" : "e.g. Weekly Operations Meeting"}
                autoFocus
              />
            </div>

            {/* Date + Time row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Start date *</Label>
                <Input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); if (!endDate || endDate < e.target.value) setEndDate(e.target.value) }} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Start time *</Label>
                <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>End date *</Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>End time *</Label>
                <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>

            {/* Location */}
            <div className="flex flex-col gap-1.5">
              <Label>{categoryId === "cat_site_visit" ? "Site address" : "Location (optional)"}</Label>
              <Input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder={categoryId === "cat_site_visit" ? "e.g. 14 Clifton Road, Bristol" : "e.g. Teams / Meeting Room 2"}
              />
            </div>

            {/* Assigned staff */}
            {users.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>Assigned staff</Label>
                <div className="border border-bd rounded-md p-2 max-h-[120px] overflow-y-auto thin-scroll space-y-0.5" style={{ borderColor: "var(--color-bd)" }}>
                  {users.map(u => (
                    <label key={u.id} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-pg cursor-pointer text-xs text-t2">
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
