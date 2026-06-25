import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format a number as GBP currency.
 * Whole numbers show no decimal places (£1,500).
 * Fractional values show exactly 2 decimal places (£1,234.50).
 */
export function formatGBP(value: number | null | undefined): string {
  if (value == null) return "—"
  const isWhole = Number.isInteger(value)
  return new Intl.NumberFormat("en-GB", {
    style:                 "currency",
    currency:              "GBP",
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/** Parse a user-typed string into a number (strips £, commas) or null */
export function parseGBP(s: string): number | null {
  const cleaned = s.replace(/[£,\s]/g, "").trim()
  if (cleaned === "") return null
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : Math.round(n * 100) / 100
}

// ── Deadline utilities ────────────────────────────────────────────

/**
 * Parses a bare "YYYY-MM-DD" calendar date (quoteDate, invoiceDate, requiredByDate,
 * dateCompleted, exportDate, etc.) as local midnight, the same way getDeadlineInfo()
 * does below. Plain `new Date("2026-06-18")` parses as UTC midnight — fine for storage,
 * but formatting that with date-fns (which renders in local time) can display the wrong
 * day on any server whose local timezone is behind UTC. Always use this — not `new Date()`
 * directly — before formatting a bare date field for display.
 */
export function parseLocalDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`)
}

export interface DeadlineInfo {
  daysRemaining: number | null   // null if no deadline set
  isOverdue:     boolean
  isDueToday:    boolean
  isDueThisWeek: boolean
  label:         string          // "3 days", "Today", "Overdue 2 days", "—"
  severity:      "overdue" | "today" | "soon" | "normal" | "none"
}

/** Calculate deadline info relative to today. */
export function getDeadlineInfo(requiredByDate: string | null | undefined): DeadlineInfo {
  if (!requiredByDate) {
    return { daysRemaining: null, isOverdue: false, isDueToday: false, isDueThisWeek: false, label: "—", severity: "none" }
  }

  // Use midnight local time to avoid TZ drift
  const today    = new Date(); today.setHours(0, 0, 0, 0)
  const deadline = parseLocalDate(requiredByDate)
  const diff     = Math.floor((deadline.getTime() - today.getTime()) / 86_400_000)

  const isOverdue     = diff < 0
  const isDueToday    = diff === 0
  const isDueThisWeek = diff >= 0 && diff <= 7

  let label: string
  let severity: DeadlineInfo["severity"]

  if (isOverdue) {
    const days = Math.abs(diff)
    label    = `Overdue ${days} day${days === 1 ? "" : "s"}`
    severity = "overdue"
  } else if (isDueToday) {
    label    = "Due today"
    severity = "today"
  } else if (diff <= 3) {
    label    = `${diff} day${diff === 1 ? "" : "s"}`
    severity = "soon"
  } else if (isDueThisWeek) {
    label    = `${diff} days`
    severity = "soon"
  } else {
    label    = `${diff} days`
    severity = "normal"
  }

  return { daysRemaining: diff, isOverdue, isDueToday, isDueThisWeek, label, severity }
}

export function deadlineBadgeClass(severity: DeadlineInfo["severity"]): string {
  switch (severity) {
    case "overdue": return "bg-dn-bg text-dn-tx border-dn-bd"
    case "today":   return "bg-wn-bg text-wn-tx border-wn-bd"
    case "soon":    return "bg-wn-bg/60 text-wn-tx border-wn-bd/60"
    case "normal":  return "bg-t1/[0.04] text-t3 border-bd"
    default:        return ""
  }
}
