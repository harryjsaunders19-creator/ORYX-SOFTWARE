import { type ClassValue, clsx } from "clsx"
import { format } from "date-fns"
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

/** Safe formatter for bare YYYY-MM-DD fields — returns "—" on missing/invalid input. */
export function formatDisplayDate(dateStr: string | null | undefined, pattern = "d MMM yyyy"): string {
  if (!dateStr) return "—"
  try {
    const d = parseLocalDate(dateStr.slice(0, 10))
    if (isNaN(d.getTime())) return "—"
    return format(d, pattern)
  } catch {
    return "—"
  }
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

/** Job statuses where the required-by deadline no longer applies. */
const CLOSED_JOB_STATUSES = new Set(["ISSUED"])

/** Deadline info for a job row — suppresses overdue/today flags once complete. */
export function getJobDeadlineInfo(job: {
  requiredByDate?: string | null
  status?: string
}): DeadlineInfo {
  if (job.status && CLOSED_JOB_STATUSES.has(job.status)) {
    return {
      daysRemaining: null,
      isOverdue: false,
      isDueToday: false,
      isDueThisWeek: false,
      label: "—",
      severity: "none",
    }
  }
  return getDeadlineInfo(job.requiredByDate)
}

/**
 * Revision Target Due colour bands (Jobs inspector / register):
 * green >5 days · amber 3–5 · orange 0–2 · red overdue · grey completed.
 */
export type RevisionDueSeverity =
  | "none"
  | "ok"
  | "amber"
  | "orange"
  | "overdue"
  | "complete"

export type RevisionDueInfo = {
  daysRemaining: number | null
  severity: RevisionDueSeverity
  /** Absolute date e.g. "04 Aug 2026" */
  dateLabel: string
  /** Short date e.g. "04 Aug" */
  shortDateLabel: string
  /** Days remaining line e.g. "4 Days" / "Overdue" */
  daysLabel: string
  /** Compact register primary line */
  registerPrimary: string
  /** Compact register secondary line (overdue days only) */
  registerSecondary: string | null
}

export function getRevisionDueInfo(
  requiredByDate: string | null | undefined,
  opts?: { completed?: boolean },
): RevisionDueInfo {
  if (opts?.completed) {
    return {
      daysRemaining: null,
      severity: "complete",
      dateLabel: requiredByDate ? formatDisplayDate(requiredByDate, "dd MMM yyyy") : "—",
      shortDateLabel: requiredByDate ? formatDisplayDate(requiredByDate, "dd MMM") : "—",
      daysLabel: "Completed",
      registerPrimary: requiredByDate ? formatDisplayDate(requiredByDate, "dd MMM") : "No Due Date",
      registerSecondary: null,
    }
  }

  if (!requiredByDate) {
    return {
      daysRemaining: null,
      severity: "none",
      dateLabel: "—",
      shortDateLabel: "—",
      daysLabel: "No due date",
      registerPrimary: "No Due Date",
      registerSecondary: null,
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const deadline = parseLocalDate(requiredByDate.slice(0, 10))
  const days = Math.floor((deadline.getTime() - today.getTime()) / 86_400_000)
  const dateLabel = formatDisplayDate(requiredByDate, "dd MMM yyyy")
  const shortDateLabel = formatDisplayDate(requiredByDate, "dd MMM")

  if (days < 0) {
    const overdueDays = Math.abs(days)
    return {
      daysRemaining: days,
      severity: "overdue",
      dateLabel,
      shortDateLabel,
      daysLabel: `${overdueDays} Day${overdueDays === 1 ? "" : "s"} Overdue`,
      registerPrimary: "OVERDUE",
      registerSecondary: `${overdueDays} Day${overdueDays === 1 ? "" : "s"}`,
    }
  }

  let severity: RevisionDueSeverity = "ok"
  if (days <= 2) severity = "orange"
  else if (days <= 5) severity = "amber"

  const daysLabel =
    days === 0
      ? "Due Today"
      : `${days} Day${days === 1 ? "" : "s"} Remaining`

  return {
    daysRemaining: days,
    severity,
    dateLabel,
    shortDateLabel,
    daysLabel,
    registerPrimary: `Due: ${shortDateLabel}`,
    registerSecondary: null,
  }
}

/** Text/background classes for revision due colour bands. */
export function revisionDueToneClass(severity: RevisionDueSeverity): {
  text: string
  tint: string
  border: string
} {
  switch (severity) {
    case "ok":
      return { text: "text-ok-tx", tint: "bg-ok-bg", border: "border-ok-ic/25" }
    case "amber":
      return { text: "text-yl-tx", tint: "bg-yl-bg", border: "border-yl-bd" }
    case "orange":
      return { text: "text-wn-tx", tint: "bg-wn-bg", border: "border-wn-ic/40" }
    case "overdue":
      return { text: "text-dn-tx", tint: "bg-dn-bg", border: "border-dn/40" }
    case "complete":
      return { text: "text-t3", tint: "bg-gy-bg", border: "border-bd/50" }
    default:
      return { text: "text-t3", tint: "bg-transparent", border: "border-bd/40" }
  }
}

/**
 * Consistent due copy: absolute date + relative urgency.
 * e.g. "Due 08 Aug · 8 days", "Due 08 Aug · Overdue", "Due Today".
 */
export function formatRevisionDueCompact(due: RevisionDueInfo): string {
  if (due.severity === "none") return "No due date"
  if (due.severity === "complete") {
    return due.shortDateLabel !== "—" ? `Due ${due.shortDateLabel}` : "No due date"
  }
  if (due.severity === "overdue") {
    return `Due ${due.shortDateLabel} · Overdue`
  }
  if (due.daysRemaining === 0) return `Due ${due.shortDateLabel} · today`
  if (due.daysRemaining === 1) return `Due ${due.shortDateLabel} · 1 day`
  return `Due ${due.shortDateLabel} · ${due.daysRemaining} days`
}

/** Sum of quote value plus tracked variation and additional charges. */
export function totalJobCommercialValue(job: {
  quoteValue?: number | null
  variationFees?: number | null
  additionalCharges?: number | null
}): number | null {
  const base = job.quoteValue ?? 0
  const variation = job.variationFees ?? 0
  const additional = job.additionalCharges ?? 0
  if (job.quoteValue == null && job.variationFees == null && job.additionalCharges == null) {
    return null
  }
  return Math.round((base + variation + additional) * 100) / 100
}

/** Parse optional money from API/form input; null clears, undefined skips. */
export function parseOptionalMoney(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  const parsed = parseFloat(String(value).replace(/[£,\s]/g, ""))
  if (isNaN(parsed)) return null
  return Math.round(parsed * 100) / 100
}

/** Default turnaround when no required-by date is supplied at job creation. */
export const DEFAULT_JOB_TURNAROUND_DAYS = 7

/** ISO date (YYYY-MM-DD) for a calendar date + N days in local time. */
export function addDaysToIsoDate(base: Date, days: number): string {
  const d = new Date(base)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function defaultRequiredByDate(days = DEFAULT_JOB_TURNAROUND_DAYS): string {
  return addDaysToIsoDate(new Date(), days)
}

/** Today's date as YYYY-MM-DD in local time. */
export function todayIsoDate(): string {
  return addDaysToIsoDate(new Date(), 0)
}

/** Use explicit date when provided; otherwise default turnaround from today. */
export function resolveRequiredByDate(value: string | null | undefined): string {
  const trimmed = typeof value === "string" ? value.trim() : ""
  return trimmed || defaultRequiredByDate()
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

// ── Quote expiry utilities ──────────────────────────────────────────

export interface QuoteExpiryInfo {
  daysRemaining: number | null
  label: string
  severity: "none" | "expired" | "today" | "soon" | "normal"
}

const CLOSED_QUOTE_STATUSES = new Set(["ACCEPTED", "REJECTED"])

/** Expiry label for sent/open quotes — used in the quotes list. */
export function getQuoteExpiryInfo(
  expiryDate: string | null | undefined,
  status: string,
): QuoteExpiryInfo {
  if (!expiryDate) {
    return { daysRemaining: null, label: "—", severity: "none" }
  }

  if (CLOSED_QUOTE_STATUSES.has(status)) {
    return { daysRemaining: null, label: "—", severity: "none" }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = parseLocalDate(expiryDate)
  const diff = Math.floor((expiry.getTime() - today.getTime()) / 86_400_000)

  if (status === "EXPIRED" || diff < 0) {
    const days = Math.abs(diff)
    return {
      daysRemaining: diff,
      label: days === 0 ? "Expired today" : `Expired ${days}d ago`,
      severity: "expired",
    }
  }
  if (diff === 0) {
    return { daysRemaining: 0, label: "Expires today", severity: "today" }
  }
  if (diff <= 7) {
    return { daysRemaining: diff, label: `${diff}d left`, severity: "soon" }
  }
  return { daysRemaining: diff, label: `${diff}d left`, severity: "normal" }
}

export function quoteExpiryBadgeClass(severity: QuoteExpiryInfo["severity"]): string {
  switch (severity) {
    case "expired": return "bg-dn-bg text-dn-tx"
    case "today":   return "bg-wn-bg text-wn-tx"
    case "soon":    return "bg-wn-bg/80 text-wn-tx"
    case "normal":  return "bg-t1/[0.04] text-t3"
    default:        return ""
  }
}
