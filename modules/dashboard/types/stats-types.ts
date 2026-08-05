import type { ClientHoldWithClient, Job } from "@/lib/types"

export interface DashboardWeekEvent {
  id: string
  title: string
  startDate: string
  endDate: string
  allDay: number
  categoryId: string
  categoryName: string
  categoryColor: string
  location: string | null
  jobId: string | null
  jobDrawingNumber: string | null
  clientName: string | null
  assignees: { userId: string; userName: string }[]
}

export interface StatsData {
  total:            number
  totalActiveJobs:  number
  activeRevisions:  number
  newRequest:       number
  inDesign:         number
  checking:         number
  readyToSend:      number
  issued:           number
  unassigned:       number
  // Commercial (Admin-only) — null when redacted for a role that can't view commercial values
  totalQuotedValue: number | null
  totalIssuedValue: number | null
  avgJobValue:      number | null
  clientsOnHold:        number
  holds:                ClientHoldWithClient[]
  overdueCount:         number
  dueTodayCount:        number
  dueThisWeekCount:     number
  // Ready For Invoicing — the accounts handoff queue (Admin-only module)
  readyForInvoicingCount: number | null
  readyForInvoicingValue: number | null
  clearedForInvoicingCount: number | null
  byItemType:       { itemType: string; count: number }[]
  byStatus:         { status: string; count: number }[]
  recentJobs:       Pick<Job, "id"|"drawingNumber"|"itemType"|"address"|"status"|"clientCompany"|"clientId"|"designer"|"quoteValue"|"invoiceId"|"parentJobId"|"revisionLetter"|"createdAt">[]
  /** Present when requested with calendarFrom & calendarTo query params. */
  overdueJobs?:      Job[]
  weekEvents?:        DashboardWeekEvent[]
}
