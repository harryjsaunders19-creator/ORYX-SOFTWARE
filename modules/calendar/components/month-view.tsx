"use client"
import { useMemo } from "react"
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, format,
} from "date-fns"
import { EventPill } from "./event-pill"

interface CalendarEvent {
  id: string; title: string; startDate: string; endDate: string
  allDay: number; categoryColor: string; categoryName: string
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

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-bd">
        {DAY_HEADERS.map(d => (
          <div key={d} className="px-0.5 py-1.5 text-center type-badge text-t3 sm:px-2 sm:py-2 sm:type-helper">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {days.map(day => {
          const dayKey = format(day, "yyyy-MM-dd")
          const inMonth  = isSameMonth(day, currentDate)
          const isToday  = isSameDay(day, today)
          const dayEvents = eventsByDay.get(dayKey) ?? []
          const visible  = dayEvents.slice(0, MAX_VISIBLE)
          const overflow = dayEvents.length - MAX_VISIBLE

          return (
            <div
              key={dayKey}
              onClick={() => onDayClick(day)}
              className="min-h-[72px] border-b border-r border-bd p-1 cursor-pointer hover:bg-pg/50 transition-colors sm:min-h-[100px] sm:p-1.5"
              style={{
                backgroundColor: isToday ? "var(--color-ac-bg)" : undefined,
                borderColor: "var(--color-bd)",
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className="text-xs font-medium tabular-nums"
                  style={{
                    color: !inMonth ? "var(--color-t4)" : isToday ? "var(--color-ac)" : "var(--color-t2)",
                    fontWeight: isToday ? 700 : 500,
                  }}
                >
                  {format(day, "d")}
                </span>
                {isToday && (
                  <span className="type-badge" style={{ color: "var(--color-ac)" }}>
                    Today
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                {visible.map(e => (
                  <EventPill
                    key={e.id}
                    title={e.title}
                    color={e.displayColor ?? e.categoryColor}
                    time={eventTime(e)}
                    onClick={() => onEventClick(e.id)}
                  />
                ))}
                {overflow > 0 && (
                  <p className="type-helper text-t3 font-medium px-1.5">+{overflow} more</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
