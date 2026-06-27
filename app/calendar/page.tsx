"use client"
import { useCallback, useEffect, useState } from "react"
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths,
} from "date-fns"
import { ChevronLeft, ChevronRight, Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { MonthView } from "@/components/calendar/month-view"
import { EventDialog } from "@/components/calendar/event-dialog"
import { DataPanel, PageHeader, PageShell } from "@/components/page-layout"

interface CalendarEvent {
  id: string; title: string; description: string | null
  categoryId: string; startDate: string; endDate: string; allDay: number
  location: string | null; priority: string; status: string
  jobId: string | null; clientId: string | null
  categoryName: string; categoryColor: string
  assignees: { userId: string; userName: string }[]
  createdByName: string
}

interface Category { id: string; name: string; color: string }
interface UserOption { id: string; name: string }

export default function CalendarPage() {
  const { toast } = useToast()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents]           = useState<CalendarEvent[]>([])
  const [loading, setLoading]         = useState(true)
  const [categories, setCategories]   = useState<Category[]>([])
  const [users, setUsers]             = useState<UserOption[]>([])

  const [filterCategory, setFilterCategory] = useState("ALL")
  const [filterUser, setFilterUser]         = useState("ALL")

  const [dialogOpen, setDialogOpen]     = useState(false)
  const [editEvent, setEditEvent]       = useState<CalendarEvent | null>(null)
  const [defaultDate, setDefaultDate]   = useState<string | undefined>()

  const getRange = useCallback((date: Date) => {
    const monthStart = startOfMonth(date)
    const monthEnd   = endOfMonth(date)
    const from = format(startOfWeek(monthStart, { weekStartsOn: 1 }), "yyyy-MM-dd")
    const to   = format(endOfWeek(monthEnd, { weekStartsOn: 1 }), "yyyy-MM-dd")
    return { from, to }
  }, [])

  const loadEvents = useCallback(async () => {
    setLoading(true)
    const { from, to } = getRange(currentDate)
    const params = new URLSearchParams({ from, to })
    if (filterCategory !== "ALL") params.set("categoryId", filterCategory)
    if (filterUser !== "ALL") params.set("userId", filterUser)

    try {
      const res = await fetch(`/api/calendar/events?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json() as { events: CalendarEvent[] }
      setEvents(data.events)
    } catch { toast("Failed to load events", "error") }
    finally { setLoading(false) }
  }, [currentDate, filterCategory, filterUser, getRange, toast])

  useEffect(() => { loadEvents() }, [loadEvents])

  useEffect(() => {
    fetch("/api/calendar/categories")
      .then(r => r.json() as Promise<{ categories: Category[] }>)
      .then(d => setCategories(d.categories))
      .catch(() => {})
    fetch("/api/users")
      .then(r => r.ok ? r.json() as Promise<{ users: UserOption[] }> : null)
      .then(d => { if (d) setUsers(d.users) })
      .catch(() => {})
  }, [])

  const handleDayClick = (date: Date) => {
    setEditEvent(null)
    setDefaultDate(format(date, "yyyy-MM-dd"))
    setDialogOpen(true)
  }

  const handleEventClick = (eventId: string) => {
    const ev = events.find(e => e.id === eventId)
    if (ev) {
      setEditEvent(ev)
      setDefaultDate(undefined)
      setDialogOpen(true)
    }
  }

  const handleNewEvent = () => {
    setEditEvent(null)
    setDefaultDate(format(new Date(), "yyyy-MM-dd"))
    setDialogOpen(true)
  }

  return (
    <PageShell wide>
      <PageHeader
        title="Calendar"
        description="Site visits, meetings, and deadlines"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-40">
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All categories</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {users.length > 0 && (
              <div className="w-36">
                <Select value={filterUser} onValueChange={setFilterUser}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All staff</SelectItem>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button variant="primary" size="sm" onClick={handleNewEvent}>
              <Plus className="h-3.5 w-3.5" /> New event
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-2 mb-4">
        <Button variant="outline" size="icon-sm" onClick={() => setCurrentDate(d => subMonths(d, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
          Today
        </Button>
        <Button variant="outline" size="icon-sm" onClick={() => setCurrentDate(d => addMonths(d, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <p className="text-lg font-semibold text-t1 ml-1 tracking-tight">
          {format(currentDate, "MMMM yyyy")}
        </p>
      </div>

      <DataPanel>
        {loading && events.length === 0 ? (
          <div className="flex items-center justify-center py-24 text-t3 gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading calendar…</span>
          </div>
        ) : (
          <MonthView
            currentDate={currentDate}
            events={events}
            onDayClick={handleDayClick}
            onEventClick={handleEventClick}
          />
        )}
      </DataPanel>

      <EventDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditEvent(null) }}
        onSaved={loadEvents}
        event={editEvent}
        defaultDate={defaultDate}
      />
    </PageShell>
  )
}
