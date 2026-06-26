/**
 * lib/global-export.ts
 *
 * Builds a multi-sheet Excel workbook containing all system data:
 *   Sheet 1: Jobs
 *   Sheet 2: Clients
 *   Sheet 3: Calendar (upcoming site visits + meetings only)
 *   Sheet 4: Ready For Invoicing
 */
import * as XLSX from "xlsx"
import { jobDb, clientDb, calendarDb, billingHandoffDb } from "@/lib/db"
import { getJobStatus, getWorkItemType } from "@/lib/constants"
import { format } from "date-fns"

const SITE_VISIT_ID = "cat_site_visit"
const TEAMS_MEETING_ID = "cat_teams_meeting"

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ""
  try { return format(new Date(iso), "dd/MM/yyyy") } catch { return iso }
}

function fmtDateTime(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" }
  try {
    const d = new Date(iso)
    return { date: format(d, "dd/MM/yyyy"), time: format(d, "HH:mm") }
  } catch { return { date: iso.slice(0, 10), time: iso.slice(11, 16) } }
}

export function buildGlobalExportWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Jobs ─────────────────────────────────────────────
  const jobs = jobDb.findMany({ orderBy: { field: "dateCreated", dir: "desc" } })
  const clientAccountCodes = new Map<string, string>()
  clientDb.findMany({ take: 10000 }).forEach(c => {
    if (c.accountCode) clientAccountCodes.set(c.id, c.accountCode)
  })

  const jobHeader = [
    "Drawing Number", "Item Type", "Site Address", "Type of Works",
    "Client", "Customer ID", "Requested By", "Status", "Designer",
    "Quote Value", "Quote Reference", "Date Created", "Required By",
    "Date Completed", "Notes",
  ]
  const jobRows = jobs.map(j => [
    j.drawingNumber,
    getWorkItemType(j.itemType).label,
    j.address,
    j.typeOfWorks === "Other" ? (j.customTypeDescription ?? "Other") : j.typeOfWorks,
    j.clientCompany,
    j.clientId ? (clientAccountCodes.get(j.clientId) ?? "") : "",
    j.requestedBy,
    getJobStatus(j.status).label,
    j.designer || "",
    j.quoteValue,
    j.quoteReference ?? "",
    fmtDate(j.dateCreated),
    fmtDate(j.requiredByDate),
    fmtDate(j.dateCompleted),
    j.notes ?? "",
  ])

  const jobSheet = XLSX.utils.aoa_to_sheet([jobHeader, ...jobRows])
  jobSheet["!cols"] = [
    { wch: 20 }, { wch: 12 }, { wch: 35 }, { wch: 25 },
    { wch: 25 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
    { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 12 },
    { wch: 14 }, { wch: 30 },
  ]
  // Format quote value column as currency
  for (let r = 1; r <= jobRows.length; r++) {
    const cell = jobSheet[XLSX.utils.encode_cell({ r, c: 9 })]
    if (cell && cell.t === "n") cell.z = "\"£\"#,##0.00"
  }
  XLSX.utils.book_append_sheet(wb, jobSheet, "Jobs")

  // ── Sheet 2: Clients ──────────────────────────────────────────
  const clients = clientDb.findMany({ take: 10000 })
  const clientHeader = [
    "Company Name", "Customer ID", "Main Contact", "Phone",
    "Email", "Billing Address", "Notes", "Status", "Added",
  ]
  const clientRows = clients.map(c => [
    c.name,
    c.accountCode ?? "",
    c.contactName ?? "",
    c.phone ?? "",
    c.email ?? "",
    c.billingAddress ?? "",
    c.notes ?? "",
    c.active ? "Active" : "Archived",
    fmtDate(c.createdAt),
  ])

  const clientSheet = XLSX.utils.aoa_to_sheet([clientHeader, ...clientRows])
  clientSheet["!cols"] = [
    { wch: 28 }, { wch: 12 }, { wch: 20 }, { wch: 16 },
    { wch: 25 }, { wch: 35 }, { wch: 30 }, { wch: 10 }, { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(wb, clientSheet, "Clients")

  // ── Sheet 3: Calendar (upcoming site visits + meetings only) ──
  const todayStr = format(new Date(), "yyyy-MM-dd")
  const futureStr = format(new Date(Date.now() + 90 * 86400000), "yyyy-MM-dd")
  const allEvents = calendarDb.findMany({ from: todayStr, to: futureStr })
  const calEvents = allEvents.filter(e =>
    e.categoryId === SITE_VISIT_ID || e.categoryId === TEAMS_MEETING_ID
  )

  const calHeader = [
    "Event Type", "Title", "Date", "Start Time", "End Time",
    "Location", "Assigned Staff", "Job Number", "Client", "Notes",
  ]
  const calRows = calEvents.map(e => {
    const start = fmtDateTime(e.startDate)
    const end   = fmtDateTime(e.endDate)
    return [
      e.categoryName,
      e.title,
      start.date,
      start.time,
      end.time,
      e.location ?? "",
      e.assignees.map(a => a.userName).join(", "),
      e.jobDrawingNumber ?? "",
      e.clientName ?? "",
      e.description ?? "",
    ]
  })

  const calSheet = XLSX.utils.aoa_to_sheet([calHeader, ...calRows])
  calSheet["!cols"] = [
    { wch: 16 }, { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
    { wch: 30 }, { wch: 25 }, { wch: 20 }, { wch: 25 }, { wch: 30 },
  ]
  XLSX.utils.book_append_sheet(wb, calSheet, "Calendar")

  // ── Sheet 4: Ready For Invoicing ──────────────────────────────
  const handoffs = billingHandoffDb.findMany({ cleared: false })
  const invHeader = [
    "Drawing Number", "Type", "Client", "Site Address", "Designer",
    "Quote Value", "Quote Reference", "Completion Date", "Added to Queue",
  ]
  const invRows = handoffs.map(h => [
    h.drawingNumber,
    h.billingEventType === "REVISION_COMPLETED" ? "Revision" : "Job",
    h.clientCompany,
    h.address,
    h.designer ?? "",
    h.quoteValue,
    h.quoteReference ?? "",
    fmtDate(h.completionDate),
    fmtDate(h.addedToBillingQueueAt),
  ])

  const invSheet = XLSX.utils.aoa_to_sheet([invHeader, ...invRows])
  invSheet["!cols"] = [
    { wch: 20 }, { wch: 10 }, { wch: 25 }, { wch: 35 }, { wch: 18 },
    { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
  ]
  for (let r = 1; r <= invRows.length; r++) {
    const cell = invSheet[XLSX.utils.encode_cell({ r, c: 5 })]
    if (cell && cell.t === "n") cell.z = "\"£\"#,##0.00"
  }
  XLSX.utils.book_append_sheet(wb, invSheet, "Ready For Invoicing")

  return wb
}

export function globalExportToBuffer(): Buffer {
  const wb = buildGlobalExportWorkbook()
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
}
