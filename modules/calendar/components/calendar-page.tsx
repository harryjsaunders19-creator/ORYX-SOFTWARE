"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  format, addMonths, subMonths, addWeeks, subWeeks,
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
import { cn } from "@/shared/utils/utils"
import { MonthView } from "./month-view"
import { WeekView } from "./week-view"
import { AgendaView } from "./agenda-view"
import { EventDialog } from "./event-dialog"
import {
  LeaveEventDialog, isLeaveEvent, leaveDisplayColor,
  type LeaveCalendarEvent,
  LeaveAcceptancePanel,
} from "@/modules/leave/ui"
import { DataPanel, PageHeader, PageShell } from "@/shared/layouts/page-layout"
import { ListSkeleton } from "@/shared/ui/list-skeleton"
import { isExperimentalEnabled } from "@/shared/experimental/experimental-features"
import {
  CALENDAR_LEGEND_ITEMS,
} from "../config/category-config"
import {
  getCalendarRange,
  resolveEventDisplayColour,
  type CalendarViewMode,
} from "../lib/calendar-display"

const LEAVE_ENABLED = isExperimentalEnabled("leave")

interface CalendarEvent extends LeaveCalendarEvent {
  categoryName: string
  categoryColor: string
  categoryId: string
  allDay: number
  location: string | null
  priority: string
  status: string
  jobId: string | null
  clientId: string | null
  createdByName: string
  jobDrawingNumber?: string | null
  clientName?: string | null
}

interface Category { id: string; name: string; color: string }
interface UserOption { id: string; name: string }

const VIEW_OPTIONS: { id: CalendarViewMode; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "agenda", label: "Agenda" },
]

export default function CalendarPage() {
  const { toast } = useToast()
  const { isAdmin, user } = useUser()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<CalendarViewMode>("month")

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
    const { from, to } = getCalendarRange(currentDate, view)
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
  }, [currentDate, view, filterCategory, filterUser, showLeave, leaveStatus, filterDepartment, hideRejected])

  const { data: eventsData, error: eventsError, isLoading, mutate } = useApi<{ events: CalendarEvent[] }>(eventsKey)
  const { data: categoriesData } = useApi<{ categories: Category[] }>("/api/calendar/categories")
  const { data: usersData } = useApi<{ users: UserOption[] }>(
    canFilterStaff ? "/api/users" : null,
  )
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
      displayColor: LEAVE_ENABLED && isLeaveEvent(e)
        ? leaveDisplayColor(e)
        : resolveEventDisplayColour({
            categoryId: e.categoryId,
            categoryColor: e.categoryColor,
            status: e.status,
            endDate: e.endDate,
          }),
    })),
  [events])

  const legendItems = useMemo(() => {
    if (categories.length === 0) return []
    const leaveOn = LEAVE_ENABLED && showLeave
    return CALENDAR_LEGEND_ITEMS.filter(item => {
      if (item.id === "cat_leave") return leaveOn
      return categories.some(c => c.id === item.id)
        || item.id === "cat_client_meeting"
    })
  }, [categories, showLeave])

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

  const goPrev = () => {
    setCurrentDate(d => (view === "week" || view === "agenda" ? subWeeks(d, 1) : subMonths(d, 1)))
  }
  const goNext = () => {
    setCurrentDate(d => (view === "week" || view === "agenda" ? addWeeks(d, 1) : addMonths(d, 1)))
  }

  const monthTitle = view === "week"
    ? `Week of ${format(currentDate, "d MMM yyyy")}`
    : view === "agenda"
      ? `Agenda · ${format(currentDate, "d MMM yyyy")}`
      : format(currentDate, "MMMM yyyy")

  return (
    <PageShell wide>
      <PageHeader
        title="Calendar"
        description="Site visits, meetings, and deadlines"
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <div className="w-full sm:w-36">
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="h-8 text-[11px] text-t2" aria-label="Filter by category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All categories</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {canFilterStaff && users.length > 0 && (
              <div className="w-full sm:w-32">
                <Select value={filterUser} onValueChange={setFilterUser}>
                  <SelectTrigger className="h-8 text-[11px] text-t2" aria-label="Filter by staff">
                    <SelectValue />
                  </SelectTrigger>
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
              <div className="w-full sm:w-32">
                <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                  <SelectTrigger className="h-8 text-[11px] text-t2" aria-label="Filter by department">
                    <SelectValue placeholder="Department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All departments</SelectItem>
                    {departments.map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button variant="primary" size="sm" className="h-9" onClick={handleNewEvent}>
              <Plus className="h-3.5 w-3.5" /> New event
            </Button>
          </div>
        }
      />

      {/* Navigation + view switcher */}
      <div className="mb-3 flex flex-col gap-3 sm:mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={view === "month" ? "Previous month" : "Previous week"}
              onClick={goPrev}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="h-8 min-w-[4.5rem] px-3"
              onClick={() => setCurrentDate(new Date())}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={view === "month" ? "Next month" : "Next week"}
              onClick={goNext}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <h2 className="min-w-0 flex-1 text-xl font-semibold tracking-tight text-t1 sm:text-2xl">
            {monthTitle}
          </h2>

          <div
            className="inline-flex rounded-md border border-bd bg-s1 p-0.5"
            role="tablist"
            aria-label="Calendar view"
          >
            {VIEW_OPTIONS.map(opt => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={view === opt.id}
                onClick={() => setView(opt.id)}
                className={cn(
                  "h-8 rounded px-3 text-xs font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ac/35",
                  view === opt.id
                    ? "bg-t1 text-sr"
                    : "text-t3 hover:text-t1",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {LEAVE_ENABLED && (
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-t2">
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
                    <SelectTrigger className="h-8 w-28 text-[11px]" aria-label="Filter leave by status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All statuses</SelectItem>
                      <SelectItem value="APPROVED">Approved</SelectItem>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="REJECTED">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-t2">
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
            </div>
          )}
        </div>

        {/* Colour legend */}
        {legendItems.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-0.5"
            aria-label="Event category legend"
          >
            {legendItems.map(item => (
              <span key={item.id} className="inline-flex items-center gap-1.5 text-[11px] text-t3">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                  aria-hidden
                />
                <span className="font-medium">{item.label}</span>
              </span>
            ))}
            {LEAVE_ENABLED && showLeave && (
              <>
                <span className="hidden text-bd sm:inline" aria-hidden>|</span>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-t3">
                  <span className="h-2 w-2 rounded-sm bg-ok-ic" aria-hidden />
                  Approved leave
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-t3">
                  <span className="h-2 w-2 rounded-sm bg-yl" aria-hidden />
                  Pending leave
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {LEAVE_ENABLED && isAdmin && (
        <LeaveAcceptancePanel onAccepted={refreshEvents} />
      )}

      <DataPanel className="overflow-hidden p-0 sm:p-0">
        {loading && events.length === 0 ? (
          <ListSkeleton rows={8} className="p-6" />
        ) : view === "week" ? (
          <div className="p-2 sm:p-3">
            <WeekView
              currentDate={currentDate}
              events={displayEvents}
              onDayClick={handleDayClick}
              onEventClick={handleEventClick}
            />
          </div>
        ) : view === "agenda" ? (
          <div className="p-3 sm:p-4">
            <AgendaView
              currentDate={currentDate}
              events={displayEvents}
              onDayClick={handleDayClick}
              onEventClick={handleEventClick}
            />
          </div>
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
