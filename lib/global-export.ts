/**
 * lib/global-export.ts
 *
 * Builds a multi-sheet Excel workbook containing all system data.
 * Reads via service layer so Supabase flags are respected.
 */
import ExcelJS from "exceljs"
import { jobService } from "@/lib/services/job-service"
import { clientService } from "@/lib/services/client-service"
import { calendarService } from "@/lib/services/calendar-service"
import { billingHandoffService } from "@/lib/services/billing-handoff-service"
import { getJobStatus, getWorkItemType } from "@/lib/constants"
import { format } from "date-fns"

const SITE_VISIT_ID = "cat_site_visit"
const TEAMS_MEETING_ID = "cat_teams_meeting"
const GBP_FMT = '"£"#,##0.00'

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

function applyCurrencyFmt(sheet: ExcelJS.Worksheet, col: number, rowCount: number) {
  for (let r = 2; r <= rowCount + 1; r++) {
    const cell = sheet.getRow(r).getCell(col)
    if (typeof cell.value === "number") cell.numFmt = GBP_FMT
  }
}

export async function buildGlobalExportWorkbook(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()

  const jobs = await jobService.findMany({ orderBy: { field: "dateCreated", dir: "desc" } })
  const clientAccountCodes = new Map<string, string>()
  ;(await clientService.findManyWithMeta({ take: 10000 })).forEach(c => {
    if (c.accountCode) clientAccountCodes.set(c.id, c.accountCode)
  })

  const jobSheet = wb.addWorksheet("Jobs")
  jobSheet.columns = [
    { width: 20 }, { width: 12 }, { width: 35 }, { width: 25 },
    { width: 25 }, { width: 12 }, { width: 18 }, { width: 18 }, { width: 18 },
    { width: 12 }, { width: 16 }, { width: 12 }, { width: 12 },
    { width: 14 }, { width: 30 },
  ]
  jobSheet.addRow([
    "Drawing Number", "Item Type", "Site Address", "Type of Works",
    "Client", "Customer ID", "Requested By", "Status", "Designer",
    "Quote Value", "Quote Reference", "Date Created", "Required By",
    "Date Completed", "Notes",
  ])
  for (const j of jobs) {
    jobSheet.addRow([
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
  }
  applyCurrencyFmt(jobSheet, 10, jobs.length)

  const clients = await clientService.findManyWithMeta({ take: 10000 })
  const clientSheet = wb.addWorksheet("Clients")
  clientSheet.columns = [
    { width: 28 }, { width: 12 }, { width: 20 }, { width: 16 },
    { width: 25 }, { width: 35 }, { width: 30 }, { width: 10 }, { width: 12 },
  ]
  clientSheet.addRow([
    "Company Name", "Customer ID", "Main Contact", "Phone",
    "Email", "Billing Address", "Notes", "Status", "Added",
  ])
  for (const c of clients) {
    clientSheet.addRow([
      c.name, c.accountCode ?? "", c.contactName ?? "", c.phone ?? "",
      c.email ?? "", c.billingAddress ?? "", c.notes ?? "",
      c.active ? "Active" : "Archived", fmtDate(c.createdAt),
    ])
  }

  const todayStr = format(new Date(), "yyyy-MM-dd")
  const futureStr = format(new Date(Date.now() + 90 * 86400000), "yyyy-MM-dd")
  const calEvents = (await calendarService.findMany({ from: todayStr, to: futureStr }))
    .filter(e => e.categoryId === SITE_VISIT_ID || e.categoryId === TEAMS_MEETING_ID)

  const calSheet = wb.addWorksheet("Calendar")
  calSheet.columns = [
    { width: 16 }, { width: 30 }, { width: 12 }, { width: 10 }, { width: 10 },
    { width: 30 }, { width: 25 }, { width: 20 }, { width: 25 }, { width: 30 },
  ]
  calSheet.addRow([
    "Event Type", "Title", "Date", "Start Time", "End Time",
    "Location", "Assigned Staff", "Job Number", "Client", "Notes",
  ])
  for (const e of calEvents) {
    const start = fmtDateTime(e.startDate)
    const end   = fmtDateTime(e.endDate)
    calSheet.addRow([
      e.categoryName, e.title, start.date, start.time, end.time,
      e.location ?? "", e.assignees.map(a => a.userName).join(", "),
      e.jobDrawingNumber ?? "", e.clientName ?? "", e.description ?? "",
    ])
  }

  const handoffs = await billingHandoffService.findMany({ cleared: false })
  const invSheet = wb.addWorksheet("Ready For Invoicing")
  invSheet.columns = [
    { width: 20 }, { width: 10 }, { width: 25 }, { width: 35 }, { width: 18 },
    { width: 12 }, { width: 16 }, { width: 14 }, { width: 14 },
  ]
  invSheet.addRow([
    "Drawing Number", "Type", "Client", "Site Address", "Designer",
    "Quote Value", "Quote Reference", "Completion Date", "Added to Queue",
  ])
  for (const h of handoffs) {
    invSheet.addRow([
      h.drawingNumber,
      h.billingEventType === "REVISION_COMPLETED" ? "Revision" : "Job",
      h.clientCompany, h.address, h.designer ?? "", h.quoteValue,
      h.quoteReference ?? "", fmtDate(h.completionDate), fmtDate(h.addedToBillingQueueAt),
    ])
  }
  applyCurrencyFmt(invSheet, 6, handoffs.length)

  return wb
}

export async function globalExportToBuffer(): Promise<Buffer> {
  const wb = await buildGlobalExportWorkbook()
  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
