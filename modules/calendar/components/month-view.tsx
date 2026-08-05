"use client"

import { useMemo } from "react"
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, format, isWeekend,
} from "date-fns"
import { Plus } from "lucide-react"
import { cn } from "@/shared/utils/utils"
import { EventPill } from "./event-pill"
import { resolveEventDisplayColour } from "../lib/calendar-display"

interface CalendarEvent {
  id: string
  title: string
  startDate: string
  endDate: string
  allDay: number
  categoryColor: string
  categoryName: string
  categoryId?: string
  status?: string
  displayColor?: string
}

interface MonthViewProps {
  currentDate: Date
  events: CalendarEvent[]
  onDayClick: (date: Date) => void
  onEventClick: (eventId: string) => void
}

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const MAX_VISIBLE = 3

export function MonthView({ currentDate, events, onDayClick, onEventClick }: MonthViewProps) {
  const today = new Date()

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate)
    const monthEnd   = endOfMonth(currentDate)
    const gridStart  = startOfWeek(monthStart, { weekStartsOn: 1 })
    const gridEnd    = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
  }, [currentDate])

  const weekRows = useMemo(() => {
    const rows: Date[][] = []
    for (let i = 0; i < days.length; i += 7) {
      rows.push(days.slice(i, i + 7))
    }
    return rows
  }, [days])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const day of days) {
      map.set(format(day, "yyyy-MM-dd"), [])
    }
    for (const e of events) {
      const start = e.startDate.slice(0, 10)
      const end   = e.endDate.slice(0, 10)
      for (const day of days) {
        const dayStr = format(day, "yyyy-MM-dd")
        if (dayStr >= start && dayStr <= end) {
          map.get(dayStr)!.push(e)
        }
      }
    }
    return map
  }, [days, events])

  function eventTime(e: CalendarEvent): string | undefined {
    if (e.allDay) return undefined
    const t = e.startDate.slice(11, 16)
    return t && t !== "00:00" ? t : undefined
  }

  function pillColor(e: CalendarEvent): string {
    return resolveEventDisplayColour({
      categoryId: e.categoryId ?? "",
      categoryColor: e.categoryColor,
      status: e.status,
      endDate: e.endDate,
      overrideColor: e.displayColor,
    })
  }

  return (
    <div className="overflow-hidden rounded-lg bg-s1/40">
      {/* Day headers */}
      <div
        className="grid grid-cols-7 border-b border-bd-strong bg-s1"
        role="row"
      >
        {DAY_HEADERS.map(d => (
          <div
            key={d}
            role="columnheader"
            className="px-0.5 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-t2 sm:px-2 sm:py-2.5 sm:text-xs"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div role="grid" aria-label="Month calendar">
        {weekRows.map((week, weekIndex) => (
          <div
            key={weekIndex}
            role="row"
            className={cn(
              "grid grid-cols-7",
              weekIndex % 2 === 1 && "bg-s0/40",
            )}
          >
            {week.map(day => {
              const dayKey = format(day, "yyyy-MM-dd")
              const inMonth  = isSameMonth(day, currentDate)
              const isToday  = isSameDay(day, today)
              const weekend  = isWeekend(day)
              const dayEvents = eventsByDay.get(dayKey) ?? []
              const visible  = dayEvents.slice(0, MAX_VISIBLE)
              const overflow = dayEvents.length - MAX_VISIBLE

              return (
                <div
                  key={dayKey}
                  role="gridcell"
                  tabIndex={0}
                  aria-label={`${format(day, "EEEE d MMMM")}${isToday ? ", today" : ""}${dayEvents.length ? `, ${dayEvents.length} events` : ""}`}
                  onClick={() => onDayClick(day)}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onDayClick(day)
                    }
                  }}
                  className={cn(
                    "group/day relative min-h-[76px] cursor-pointer border-b border-r border-bd-strong p-1",
                    "transition-[background-color,box-shadow] duration-150 ease-out",
                    "hover:bg-hover-surface hover:shadow-[inset_0_0_0_1px_var(--color-bd-strong)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ac/35",
                    "sm:min-h-[108px] sm:p-1.5",
                    !inMonth && "bg-s0/50 text-t4",
                    weekend && inMonth && !isToday && "bg-nested-surface/40",
                    isToday && "bg-ac2-bg/50 shadow-[inset_0_0_0_1.5px_var(--color-ac2)]",
                  )}
                >
                  <div className="mb-1 flex items-center justify-between gap-1">
                    <span
                      className={cn(
                        "inline-flex min-w-[1.35rem] items-center justify-center tabular-nums",
                        isToday
                          ? "text-sm font-bold text-ac2"
                          : inMonth
                            ? "text-xs font-semibold text-t1 sm:text-[13px]"
                            : "text-xs font-medium text-t4",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {isToday ? (
                      <span className="rounded px-1 py-px text-[9px] font-bold uppercase tracking-wider text-ac2 bg-ac2-bg">
                        Today
                      </span>
                    ) : (
                      <Plus
                        className="h-3 w-3 text-t4 opacity-0 transition-opacity duration-150 group-hover/day:opacity-70 group-focus-visible/day:opacity-70"
                        aria-hidden
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    {visible.map(e => (
                      <EventPill
                        key={e.id}
                        title={e.title}
                        color={pillColor(e)}
                        time={eventTime(e)}
                        categoryName={e.categoryName}
                        onClick={() => onEventClick(e.id)}
                      />
                    ))}
                    {overflow > 0 && (
                      <p className="px-1.5 text-[10px] font-semibold text-t3">
                        +{overflow} more
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
