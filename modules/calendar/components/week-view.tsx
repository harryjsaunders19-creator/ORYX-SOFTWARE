"use client"

import { useMemo } from "react"
import {
  startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, format, isWeekend,
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
  jobDrawingNumber?: string | null
  location?: string | null
}

interface WeekViewProps {
  currentDate: Date
  events: CalendarEvent[]
  onDayClick: (date: Date) => void
  onEventClick: (eventId: string) => void
}

export function WeekView({ currentDate, events, onDayClick, onEventClick }: WeekViewProps) {
  const today = new Date()

  const days = useMemo(() => {
    const from = startOfWeek(currentDate, { weekStartsOn: 1 })
    const to = endOfWeek(currentDate, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: from, end: to })
  }, [currentDate])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const day of days) map.set(format(day, "yyyy-MM-dd"), [])
    for (const e of events) {
      const start = e.startDate.slice(0, 10)
      const end = e.endDate.slice(0, 10)
      for (const day of days) {
        const key = format(day, "yyyy-MM-dd")
        if (key >= start && key <= end) map.get(key)!.push(e)
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startDate.localeCompare(b.startDate))
    }
    return map
  }, [days, events])

  function eventTime(e: CalendarEvent): string | undefined {
    if (e.allDay) return "All day"
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
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[640px] grid-cols-7 gap-px overflow-hidden rounded-lg border border-bd-strong bg-bd-strong"
        role="grid"
        aria-label="Week calendar"
      >
        {days.map(day => {
          const key = format(day, "yyyy-MM-dd")
          const isToday = isSameDay(day, today)
          const weekend = isWeekend(day)
          const dayEvents = eventsByDay.get(key) ?? []

          return (
            <div
              key={key}
              role="gridcell"
              tabIndex={0}
              aria-label={`${format(day, "EEEE d MMMM")}${isToday ? ", today" : ""}`}
              onClick={() => onDayClick(day)}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onDayClick(day)
                }
              }}
              className={cn(
                "group/day flex min-h-[280px] cursor-pointer flex-col bg-s1 p-2 transition-colors duration-150",
                "hover:bg-hover-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ac/35",
                weekend && !isToday && "bg-nested-surface/50",
                isToday && "bg-ac2-bg/40 shadow-[inset_0_0_0_1.5px_var(--color-ac2)]",
              )}
            >
              <div className="mb-2 flex items-start justify-between gap-1 border-b border-bd-subtle pb-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-t3">
                    {format(day, "EEE")}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 tabular-nums",
                      isToday ? "text-lg font-bold text-ac2" : "text-base font-semibold text-t1",
                    )}
                  >
                    {format(day, "d")}
                  </p>
                  {isToday ? (
                    <span className="mt-0.5 inline-block rounded px-1 py-px text-[9px] font-bold uppercase tracking-wider text-ac2 bg-ac2-bg">
                      Today
                    </span>
                  ) : null}
                </div>
                <Plus
                  className="mt-0.5 h-3.5 w-3.5 text-t4 opacity-0 transition-opacity group-hover/day:opacity-70"
                  aria-hidden
                />
              </div>

              <div className="flex flex-1 flex-col gap-1.5">
                {dayEvents.length === 0 ? (
                  <p className="px-0.5 pt-4 text-center text-[11px] text-t4">
                    No events
                  </p>
                ) : (
                  dayEvents.map(e => (
                    <EventPill
                      key={e.id}
                      title={e.title}
                      color={pillColor(e)}
                      time={eventTime(e)}
                      categoryName={e.categoryName}
                      onClick={() => onEventClick(e.id)}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
