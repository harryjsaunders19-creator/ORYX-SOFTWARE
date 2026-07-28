"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Bell, AlertOctagon, Clock, AlertTriangle, Loader2, CalendarOff,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { cn } from "@/shared/utils/utils"
// Perf: SWR dedupes/caches /api/notifications; refreshInterval matches prior 5m poll.
import { useApi } from "@/shared/hooks/use-api"
import type { AppNotification, NotificationKind } from "../types/notifications-types"
import { isExperimentalEnabled } from "@/shared/experimental/experimental-features"

const POLL_MS = 5 * 60_000 // refresh when tab visible; no background polling when hidden
/** Stable SWR options — avoid a new config object every NotificationsMenu render. */
const NOTIFICATIONS_SWR = { refreshInterval: POLL_MS } as const
const CLEAR_KEY = "oryx.notifications.clearedAt"

const KIND_ICON: Record<NotificationKind, React.ElementType> = {
  job_overdue:    AlertOctagon,
  job_due_today:  Clock,
  client_on_hold: AlertTriangle,
  leave_pending:  CalendarOff,
}

const SEVERITY_DOT: Record<AppNotification["severity"], string> = {
  danger:  "bg-dn",
  warning: "bg-wn",
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

type NotificationsPayload = { notifications: AppNotification[]; unreadCount: number }

export function NotificationsMenu() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [clearedAtMs, setClearedAtMs] = useState(0)
  const { data, isLoading, mutate } = useApi<NotificationsPayload>(
    "/api/notifications",
    NOTIFICATIONS_SWR,
  )
  const allNotifications = useMemo(() => data?.notifications ?? [], [data?.notifications])
  const visibleNotifications = useMemo(() => {
    if (!clearedAtMs) return allNotifications
    return allNotifications.filter(n => {
      const t = Date.parse(n.at)
      return Number.isFinite(t) && t > clearedAtMs
    })
  }, [allNotifications, clearedAtMs])
  const unreadCount = visibleNotifications.length
  const loading = isLoading && !data
  const load = useCallback(() => { void mutate() }, [mutate])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CLEAR_KEY)
      if (!raw) return
      const ms = Number(raw)
      if (Number.isFinite(ms) && ms > 0) setClearedAtMs(ms)
    } catch {
      // localStorage can be blocked in some environments; "clear" won't persist.
    }
  }, [])

  const clearNotifications = useCallback(() => {
    const now = Date.now()
    setClearedAtMs(now)
    try { localStorage.setItem(CLEAR_KEY, String(now)) } catch { /* ignore */ }
    void mutate()
  }, [mutate])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") load()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [load])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative h-9 w-9 rounded-full flex items-center justify-center",
            "text-t3 hover:bg-pg hover:text-t2 transition-colors",
            open && "bg-pg text-t2",
          )}
          title="Notifications"
          aria-label={`Notifications${unreadCount ? `, ${unreadCount} items` : ""}`}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-dn text-white text-[10px] font-bold flex items-center justify-center leading-none"
              aria-hidden
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[min(100vw-2rem,380px)] p-0 max-h-[min(70vh,480px)] flex flex-col"
        sideOffset={8}
      >
        <div className="px-4 py-3 border-b border-bd flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold text-t1">Notifications</p>
            {unreadCount > 0 && (
              <span className="text-[11px] font-medium text-t3 tabular-nums">{unreadCount} active</span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={clearNotifications}
              className="text-xs text-ac hover:text-ach font-medium"
            >
              Clear
            </button>
          )}
        </div>

        <div className="overflow-y-auto thin-scroll flex-1">
          {loading && allNotifications.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-t4">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : visibleNotifications.length === 0 ? (
            <div className="py-10 px-4 text-center">
              <Bell className="h-5 w-5 text-t4 mx-auto mb-2 opacity-60" />
              <p className="text-sm text-t2 font-medium">All clear</p>
              <p className="text-xs text-t4 mt-1">
                {isExperimentalEnabled("leave")
                  ? "No overdue jobs, nothing due today, no clients on hold, and no leave awaiting acceptance."
                  : "No overdue jobs, nothing due today, and no clients on hold."}
              </p>
            </div>
          ) : (
            <ul className="py-1">
              {visibleNotifications.map(n => {
                const Icon = KIND_ICON[n.kind]
                return (
                  <li key={n.id}>
                    <Link
                      href={n.href}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-pg transition-colors border-b border-bd last:border-0"
                    >
                      <div className="relative mt-0.5 shrink-0">
                        <div className="w-8 h-8 rounded-lg bg-surface-low flex items-center justify-center">
                          <Icon className="h-4 w-4 text-t3" />
                        </div>
                        <span
                          className={cn(
                            "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-sr",
                            SEVERITY_DOT[n.severity],
                          )}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-t1 truncate">{n.title}</p>
                        <p className="text-[11px] text-t3 mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-[10px] text-t4 mt-1">{formatWhen(n.at)}</p>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-bd shrink-0 bg-surface-low/50">
          <button
            type="button"
            onClick={() => { setOpen(false); router.push("/jobs?deadline=overdue") }}
            className="text-xs text-ac hover:text-ach font-medium"
          >
            View overdue jobs ?
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
