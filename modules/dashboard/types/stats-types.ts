import type { ClientHoldWithClient, Job } from "@/lib/types"

export interface StatsData {
  total:            number
  totalActiveJobs:  number
  totalRevisions:   number
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
  // Quote module — counts/rate stay visible to Engineers, money does not
  quotesSent:       number
  quotesAccepted:   number
  quotesRejected:   number
  quotesTotalValue: number | null
  quotesWonValue:   number | null
  quotesConversionRate: number
  byItemType:       { itemType: string; count: number }[]
  byStatus:         { status: string; count: number }[]
  recentJobs:       Pick<Job, "id"|"drawingNumber"|"itemType"|"address"|"status"|"clientCompany"|"clientId"|"designer"|"quoteValue"|"invoiceId"|"parentJobId"|"revisionLetter"|"createdAt">[]
}
