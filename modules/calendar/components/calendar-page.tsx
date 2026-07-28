"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths,
} from "date-fns"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/ui/select"
import { useToast } from "@/shared/ui/toast"
import { useUser } from "@/shared/providers/user-context"
import { useApi } from "@/shared/hooks/use-api"
import { MonthView } from "./month-view"
import { EventDialog } from "./event-dialog"
import {
  LeaveEventDialog, isLeaveEvent, leaveDisplayColor,
  type LeaveCalendarEvent,
  LeaveAcceptancePanel,
} from "@/modules/leave/ui"
import { DataPanel, PageHeader, PageShell } from "@/shared/layouts/page-layout"
import { ListSkeleton } from "@/shared/ui/list-skeleton"
import { isExperimentalEnabled } from "@/shared/experimental/experimental-features"

const LEAVE_ENABLED = isExperimentalEnabled("leave")

interface CalendarEvent extends LeaveCalendarEvent {
  categoryName: string
  categoryColor: string
  allDay: number
  location: string | null
  priority: string
  jobId: string | null
  clientId: string | null
  createdByName: string
}

interface Category { id: string; name: string; color: string }
interface UserOption { id: string; name: string }

function getRange(date: Date) {
  const monthStart = startOfMonth(date)
  const monthEnd   = endOfMonth(date)
  const from = format(startOfWeek(monthStart, { weekStartsOn: 1 }), "yyyy-MM-dd")
  const to   = format(endOfWeek(monthEnd, { weekStartsOn: 1 }), "yyyy-MM-dd")
  return { from, to }
}

export default function CalendarPage() {
  const { toast } = useToast()
  const { isAdmin, user } = useUser()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [currentDate, setCurrentDate] = useState(new Date())

  const [filterCategory, setFilterCategory] = useState("ALL")
  const [filterUser, setFilterUser]         = useState("ALL")
  const [showLeave, setShowLeave]           = useState(true)
  const [leaveStatus, setLeaveStatus]       = useState("ALL")
  const [filterDepartment, setFilterDepartment] = useState("ALL")
  const [hideRejected, setHideRejected]     = useState(true)

  const [dialogOpen, setDialogOpen]     = useState(false)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [editEvent, setEditEvent]       = useState<CalendarEvent | null>(null)
  const [leaveEvent, setLeaveEvent]     = useState<CalendarEvent | null>(null)
  const [defaultDate, setDefaultDate]   = useState<string | undefined>()
  const [defaultCategoryId, setDefaultCategoryId] = useState<string | undefined>()

  const canFilterStaff = isAdmin

  useEffect(() => {
    const create = searchParams.get("new")
    if (!create) return
    setEditEvent(null)
    setDefaultDate(format(new Date(), "yyyy-MM-dd"))
    setDefaultCategoryId(create === "site-visit" ? "cat_site_visit" : undefined)
    setDialogOpen(true)
    const next = new URLSearchParams(searchParams.toString())
    next.delete("new")
    const qs = next.toString()
    router.replace(qs ? `/calendar?${qs}` : "/calendar", { scroll: false })
  }, [searchParams, router])

  const eventsKey = useMemo(() => {
    const { from, to } = getRange(currentDate)
    const params = new URLSearchParams({ from, to })
    if (filterCategory !== "ALL") params.set("categoryId", filterCategory)
    if (filterUser !== "ALL") params.set("userId", filterUser)
    if (LEAVE_ENABLED) {
      params.set("showLeave", showLeave ? "true" : "false")
      params.set("hideRejected", hideRejected ? "true" : "false")
      if (leaveStatus !== "ALL") params.set("leaveStatus", leaveStatus)
      if (filterDepartment !== "ALL") params.set("department", filterDepartment)
    }
    return `/api/calendar/events?${params}`
  }, [currentDate, filterCategory, filterUser, showLeave, leaveStatus, filterDepartment, hideRejected])

  const { data: eventsData, error: eventsError, isLoading, mutate } = useApi<{ events: CalendarEvent[] }>(eventsKey)
  const { data: categoriesData } = useApi<{ categories: Category[] }>("/api/calendar/categories")
  const { data: usersData } = useApi<{ users: UserOption[] }>("/api/users")
  const { data: employeesData } = useApi<{ departments: string[] }>(
    LEAVE_ENABLED ? "/api/employees?limit=1" : null,
  )

  const events = useMemo(() => eventsData?.events ?? [], [eventsData?.events])
  const categories = categoriesData?.categories ?? []
  const users = usersData?.users ?? []
  const departments = employeesData?.departments ?? []
  const loading = isLoading && !eventsData

  const refreshEvents = useCallback(() => { void mutate() }, [mutate])

  useEffect(() => {
    if (eventsError) toast("Failed to load events", "error")
  }, [eventsError, toast])

  const displayEvents = useMemo(() =>
    events.map(e => ({
      ...e,
      displayColor: LEAVE_ENABLED && isLeaveEvent(e) ? leaveDisplayColor(e) : e.categoryColor,
    })),
  [events])

  const handleDayClick = (date: Date) => {
    setEditEvent(null)
    setDefaultDate(format(date, "yyyy-MM-dd"))
    setDefaultCategoryId(undefined)
    setDialogOpen(true)
  }

  const handleEventClick = (eventId: string) => {
    const ev = events.find(e => e.id === eventId)
    if (!ev) return
    if (LEAVE_ENABLED && isLeaveEvent(ev)) {
      setLeaveEvent(ev)
      setLeaveDialogOpen(true)
      return
    }
    setEditEvent(ev)
    setDefaultDate(undefined)
    setDialogOpen(true)
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
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <div className="w-full sm:w-40">
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
            {canFilterStaff && users.length > 0 && (
              <div className="w-full sm:w-36">
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
            {LEAVE_ENABLED && departments.length > 0 && (isAdmin || user) && (
              <div className="w-full sm:w-36">
                <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                  <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Department" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All departments</SelectItem>
                    {departments.map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
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

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
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

        {LEAVE_ENABLED && (
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <label className="flex items-center gap-1.5 text-xs text-t2 cursor-pointer">
            <input
              type="checkbox"
              checked={showLeave}
              onChange={e => setShowLeave(e.target.checked)}
              className="rounded border-bd"
            />
            Annual leave
          </label>
          {showLeave && (
            <>
              <Select value={leaveStatus} onValueChange={setLeaveStatus}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1.5 text-xs text-t2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideRejected}
                  onChange={e => setHideRejected(e.target.checked)}
                  className="rounded border-bd"
                />
                Hide rejected
              </label>
            </>
          )}
          <div className="flex items-center gap-3 text-[10px] text-t3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-ok-ic" /> Approved
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-yl" /> Pending
            </span>
          </div>
        </div>
        )}
      </div>

      {LEAVE_ENABLED && isAdmin && (
        <LeaveAcceptancePanel onAccepted={refreshEvents} />
      )}

      <DataPanel>
        {loading && events.length === 0 ? (
          <ListSkeleton rows={8} className="p-6" />
        ) : (
          <MonthView
            currentDate={currentDate}
            events={displayEvents}
            onDayClick={handleDayClick}
            onEventClick={handleEventClick}
          />
        )}
      </DataPanel>

      <EventDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditEvent(null); setDefaultCategoryId(undefined) }}
        onSaved={refreshEvents}
        event={editEvent}
        defaultDate={defaultDate}
        defaultCategoryId={defaultCategoryId}
      />

      {LEAVE_ENABLED && (
      <LeaveEventDialog
        open={leaveDialogOpen}
        onClose={() => { setLeaveDialogOpen(false); setLeaveEvent(null) }}
        event={leaveEvent}
      />
      )}
    </PageShell>
  )
}
