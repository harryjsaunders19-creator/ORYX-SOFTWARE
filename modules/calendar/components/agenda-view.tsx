"use client"

import { useMemo } from "react"
import { format, isSameDay, parseISO, isValid } from "date-fns"
import { ExternalLink } from "lucide-react"
import { cn } from "@/shared/utils/utils"
import { resolveEventDisplayColour, eventTypeLabel } from "../lib/calendar-display"

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
  jobId?: string | null
  jobDrawingNumber?: string | null
  location?: string | null
  clientName?: string | null
}

interface AgendaViewProps {
  currentDate: Date
  events: CalendarEvent[]
  onEventClick: (eventId: string) => void
  onDayClick: (date: Date) => void
}

function dayKey(iso: string): string {
  return iso.slice(0, 10)
}

export function AgendaView({ currentDate, events, onEventClick, onDayClick }: AgendaViewProps) {
  const today = new Date()

  const groups = useMemo(() => {
    const sorted = [...events].sort((a, b) =>
      a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title),
    )
    const map = new Map<string, CalendarEvent[]>()
    for (const e of sorted) {
      const key = dayKey(e.startDate)
      const list = map.get(key) ?? []
      list.push(e)
      map.set(key, list)
    }
    return [...map.entries()]
  }, [events])

  function timeLabel(e: CalendarEvent): string {
    if (e.allDay) return "All day"
    const t = e.startDate.slice(11, 16)
    return t && t !== "00:00" ? t : "All day"
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-bd bg-s1 px-6 py-16 text-center">
        <p className="text-sm font-medium text-t2">No upcoming events</p>
        <p className="mt-1 text-xs text-t3">
          Switch to Month or Week, or create an event for {format(currentDate, "d MMM yyyy")}.
        </p>
        <button
          type="button"
          onClick={() => onDayClick(currentDate)}
          className="mt-4 inline-flex h-9 items-center rounded-md border border-bd-strong bg-s1 px-3 text-sm font-medium text-t1 transition-colors hover:bg-hover-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ac/35"
        >
          New event
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4" role="list" aria-label="Agenda">
      {groups.map(([key, dayEvents]) => {
        let day: Date
        try {
          day = parseISO(key)
          if (!isValid(day)) day = new Date(key)
        } catch {
          day = new Date(key)
        }
        const isToday = isSameDay(day, today)

        return (
          <section
            key={key}
            className="overflow-hidden rounded-lg border border-bd-strong bg-s1"
            aria-labelledby={`agenda-${key}`}
          >
            <header
              className={cn(
                "flex items-center justify-between gap-3 border-b border-bd px-4 py-2.5",
                isToday && "bg-ac2-bg/40",
              )}
            >
              <div className="flex items-baseline gap-2">
                <h3
                  id={`agenda-${key}`}
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    isToday ? "text-ac2" : "text-t1",
                  )}
                >
                  {format(day, "EEEE d MMMM")}
                </h3>
                {isToday ? (
                  <span className="rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-ac2 bg-ac2-bg">
                    Today
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onDayClick(day)}
                className="text-xs font-medium text-t3 transition-colors hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ac/35 rounded"
              >
                Add event
              </button>
            </header>

            <ul className="divide-y divide-bd-subtle">
              {dayEvents.map(e => {
                const color = resolveEventDisplayColour({
                  categoryId: e.categoryId ?? "",
                  categoryColor: e.categoryColor,
                  status: e.status,
                  endDate: e.endDate,
                  overrideColor: e.displayColor,
                })
                const type = eventTypeLabel(e.categoryId ?? "", e.categoryName)

                return (
                  <li key={e.id} role="listitem">
                    <button
                      type="button"
                      onClick={() => onEventClick(e.id)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-150",
                        "hover:bg-hover-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ac/35",
                      )}
                    >
                      <span
                        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-xs font-medium tabular-nums text-t3">
                            {timeLabel(e)}
                          </span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-t4">
                            {type}
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm font-semibold tracking-tight text-t1">
                          {e.title}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-t3">
                          {e.clientName ? <span>{e.clientName}</span> : null}
                          {e.location ? <span>{e.location}</span> : null}
                          {e.jobDrawingNumber ? (
                            <span className="inline-flex items-center gap-1 font-medium text-t2">
                              <ExternalLink className="h-3 w-3" aria-hidden />
                              {e.jobDrawingNumber}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
