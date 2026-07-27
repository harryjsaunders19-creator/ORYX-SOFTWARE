/**
 * lib/global-export.ts
 *
 * Builds a multi-sheet Excel workbook containing all system data.
 * Reads via service layer so Supabase flags are respected.
 *
 * Sheets:
 *   1. Jobs              — every job/revision/survey on record
 *   2. Clients           — every client (active + archived)
 *   3. Quotes            — every quote and its status
 *   4. Invoicing Queue   — items awaiting accounts clearance
 *   5. Calendar          — site visits + meetings (next 90 days)
 *   6. Status History    — last 2,000 job status / note events
 *   7. Users             — staff accounts (no passwords)
 *   8. Account Passwords — shared business credentials (decrypted for export)
 */
import ExcelJS from "exceljs"
import { jobService }            from "@/lib/services/job-service"
import { clientService }         from "@/lib/services/client-service"
import { calendarService }       from "@/lib/services/calendar-service"
import { billingHandoffService } from "@/lib/services/billing-handoff-service"
import { quoteService }          from "@/lib/services/quote-service"
import { userService }           from "@/lib/services/user-service"
import { historyService }        from "@/lib/services/history-service"
import { passwordVaultService }  from "@/modules/password-vault"
import { getJobStatus, getWorkItemType } from "@/lib/constants"
import { format } from "date-fns"
import { MAX_GLOBAL_EXPORT_ROWS } from "../constants"
import { sanitizeSpreadsheetCell } from "@/shared/utils/spreadsheet-sanitize"

const SITE_VISIT_ID    = "cat_site_visit"
const TEAMS_MEETING_ID = "cat_teams_meeting"
const GBP_FMT          = '"£"#,##0.00'
const PCT_FMT          = '0.00"%"'

/** Sanitize string cells against Excel formula injection before writing a data row. */
function dataRow(values: unknown[]): (string | number | boolean | Date | null)[] {
  return values.map(sanitizeSpreadsheetCell)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function applyColFmt(sheet: ExcelJS.Worksheet, col: number, fmt: string, rowCount: number) {
  for (let r = 2; r <= rowCount + 1; r++) {
    const cell = sheet.getRow(r).getCell(col)
    if (typeof cell.value === "number") cell.numFmt = fmt
  }
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const row = sheet.getRow(1)
  row.font = { bold: true }
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0EFFE" } }
  row.eachCell(cell => {
    cell.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } }
  })
  row.commit()
}

// ── Workbook builder ──────────────────────────────────────────────────────────

export async function buildGlobalExportWorkbook(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.created  = new Date()
  wb.modified = new Date()

  // ── 1. Jobs ─────────────────────────────────────────────────────────────────
  const jobs = await jobService.findMany({
    orderBy: { field: "dateCreated", dir: "desc" },
    take: MAX_GLOBAL_EXPORT_ROWS,
  })

  const clientAccountCodes = new Map<string, string>()
  ;(await clientService.findManyWithMeta({ take: MAX_GLOBAL_EXPORT_ROWS })).forEach(c => {
    if (c.accountCode) clientAccountCodes.set(c.id, c.accountCode)
  })

  const jobSheet = wb.addWorksheet("Jobs")
  jobSheet.columns = [
    { width: 20 }, { width: 12 }, { width: 35 }, { width: 25 },
    { width: 25 }, { width: 12 }, { width: 18 }, { width: 18 }, { width: 18 },
    { width: 12 }, { width: 12 }, { width: 16 }, { width: 12 }, { width: 12 },
    { width: 14 }, { width: 14 }, { width: 30 },
  ]
  jobSheet.addRow([
    "Drawing Number", "Item Type", "Site Address", "Type of Works",
    "Client", "Customer ID", "Requested By", "Status", "Designer",
    "Quote Value (£)", "Variation Fees (£)", "Quote Reference",
    "Date Created", "Required By", "Date Completed", "Last Updated", "Notes",
  ])
  styleHeader(jobSheet)
  for (const j of jobs) {
    jobSheet.addRow(dataRow([
      j.drawingNumber,
      getWorkItemType(j.itemType).label,
      j.address,
      j.typeOfWorks === "Other" ? (j.customTypeDescription ?? "Other") : (j.typeOfWorks ?? ""),
      j.clientCompany,
      j.clientId ? (clientAccountCodes.get(j.clientId) ?? "") : "",
      j.requestedBy ?? "",
      getJobStatus(j.status).label,
      j.designer || "",
      j.quoteValue ?? "",
      j.variationFees ?? "",
      j.quoteReference ?? "",
      fmtDate(j.dateCreated),
      fmtDate(j.requiredByDate),
      fmtDate(j.dateCompleted),
      fmtDate(j.updatedAt),
      j.notes ?? "",
    ]))
  }
  applyColFmt(jobSheet, 10, GBP_FMT, jobs.length)
  applyColFmt(jobSheet, 11, GBP_FMT, jobs.length)

  // ── 2. Clients ──────────────────────────────────────────────────────────────
  const clients = await clientService.findManyWithMeta({ take: MAX_GLOBAL_EXPORT_ROWS })
  const clientSheet = wb.addWorksheet("Clients")
  clientSheet.columns = [
    { width: 28 }, { width: 12 }, { width: 20 }, { width: 16 },
    { width: 25 }, { width: 35 }, { width: 30 }, { width: 10 }, { width: 12 },
  ]
  clientSheet.addRow([
    "Company Name", "Customer ID", "Main Contact", "Phone",
    "Email", "Billing Address", "Notes", "Status", "Added",
  ])
  styleHeader(clientSheet)
  for (const c of clients) {
    clientSheet.addRow(dataRow([
      c.name, c.accountCode ?? "", c.contactName ?? "", c.phone ?? "",
      c.email ?? "", c.billingAddress ?? "", c.notes ?? "",
      c.active ? "Active" : "Archived", fmtDate(c.createdAt),
    ]))
  }

  // ── 3. Quotes ───────────────────────────────────────────────────────────────
  const quotes = await quoteService.findMany({ take: MAX_GLOBAL_EXPORT_ROWS })
  const quoteSheet = wb.addWorksheet("Quotes")
  quoteSheet.columns = [
    { width: 14 }, { width: 12 }, { width: 28 }, { width: 20 },
    { width: 35 }, { width: 30 }, { width: 12 }, { width: 10 },
    { width: 12 }, { width: 16 }, { width: 20 }, { width: 30 },
  ]
  quoteSheet.addRow([
    "Quote Number", "Status", "Client", "Contact",
    "Site Address", "Description", "Quote Value (£)", "VAT Rate (%)",
    "Quote Date", "Expiry Date", "Created By", "Notes",
  ])
  styleHeader(quoteSheet)
  for (const q of quotes) {
    quoteSheet.addRow(dataRow([
      q.quoteNumber,
      q.status,
      q.clientCompany,
      q.contactName ?? "",
      q.address,
      q.description,
      q.quoteValue,
      q.vatRate ?? "",
      fmtDate(q.quoteDate),
      fmtDate(q.expiryDate),
      q.createdBy,
      q.notes ?? "",
    ]))
  }
  applyColFmt(quoteSheet, 7, GBP_FMT, quotes.length)
  applyColFmt(quoteSheet, 8, PCT_FMT, quotes.length)

  // ── 4. Invoicing Queue ──────────────────────────────────────────────────────
  const handoffs = await billingHandoffService.findMany({ cleared: false })
  const invSheet = wb.addWorksheet("Invoicing Queue")
  invSheet.columns = [
    { width: 20 }, { width: 10 }, { width: 25 }, { width: 35 }, { width: 18 },
    { width: 12 }, { width: 16 }, { width: 14 }, { width: 14 },
  ]
  invSheet.addRow([
    "Drawing Number", "Type", "Client", "Site Address", "Designer",
    "Quote Value (£)", "Quote Reference", "Completion Date", "Added to Queue",
  ])
  styleHeader(invSheet)
  for (const h of handoffs) {
    invSheet.addRow(dataRow([
      h.drawingNumber,
      h.billingEventType === "REVISION_COMPLETED" ? "Revision" : "Job",
      h.clientCompany, h.address, h.designer ?? "", h.quoteValue,
      h.quoteReference ?? "", fmtDate(h.completionDate), fmtDate(h.addedToBillingQueueAt),
    ]))
  }
  applyColFmt(invSheet, 6, GBP_FMT, handoffs.length)

  // ── 5. Calendar ─────────────────────────────────────────────────────────────
  const todayStr  = format(new Date(), "yyyy-MM-dd")
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
  styleHeader(calSheet)
  for (const e of calEvents) {
    const start = fmtDateTime(e.startDate)
    const end   = fmtDateTime(e.endDate)
    calSheet.addRow(dataRow([
      e.categoryName, e.title, start.date, start.time, end.time,
      e.location ?? "", e.assignees.map(a => a.userName).join(", "),
      e.jobDrawingNumber ?? "", e.clientName ?? "", e.description ?? "",
    ]))
  }

  // ── 6. Status History ───────────────────────────────────────────────────────
  const historyRows = await historyService.recentForExport(2000)

  const histSheet = wb.addWorksheet("Status History")
  histSheet.columns = [
    { width: 20 }, { width: 16 }, { width: 14 }, { width: 14 },
    { width: 18 }, { width: 22 }, { width: 40 },
  ]
  histSheet.addRow([
    "Drawing Number", "Date", "Time", "Changed By",
    "From Status", "To Status", "Note",
  ])
  styleHeader(histSheet)
  for (const h of historyRows) {
    const dt = fmtDateTime(h.changedAt)
    histSheet.addRow(dataRow([
      h.drawingNumber ?? h.jobId,
      dt.date, dt.time,
      h.changedBy,
      h.fromStatus ?? "",
      h.toStatus   ?? "",
      h.note       ?? "",
    ]))
  }

  // ── 7. Users ────────────────────────────────────────────────────────────────
  // User ID enables Excel round-trip restore. Passwords are never written here —
  // use Export full data (JSON) when login hashes must be recovered.
  const users = await userService.findMany()
  const userSheet = wb.addWorksheet("Users")
  userSheet.columns = [
    { width: 28 }, { width: 24 }, { width: 28 }, { width: 12 }, { width: 10 }, { width: 20 },
  ]
  userSheet.addRow(["User ID", "Name", "Email", "Role", "Status", "Account Created"])
  styleHeader(userSheet)
  for (const u of users) {
    userSheet.addRow(dataRow([
      u.id,
      u.name,
      u.email ?? "",
      u.role,
      u.active ? "Active" : "Disabled",
      fmtDate(u.createdAt),
    ]))
  }

  // ── 8. Account Passwords ────────────────────────────────────────────────────
  const vaultEntries = await passwordVaultService.findMany({ sort: "asc", revealPasswords: true })
  const vaultSheet = wb.addWorksheet("Account Passwords")
  vaultSheet.columns = [
    { width: 28 }, { width: 28 }, { width: 24 }, { width: 40 },
    { width: 16 }, { width: 40 }, { width: 14 }, { width: 14 },
  ]
  vaultSheet.addRow([
    "Service Name", "Username / Email", "Password", "Login URL",
    "Category", "Notes", "Date Created", "Last Updated",
  ])
  styleHeader(vaultSheet)
  for (const e of vaultEntries) {
    vaultSheet.addRow(dataRow([
      e.serviceName,
      e.username ?? "",
      e.password,
      e.loginUrl ?? "",
      e.category ?? "",
      e.notes ?? "",
      fmtDate(e.createdAt),
      fmtDate(e.updatedAt),
    ]))
  }

  return wb
}

export async function globalExportToBuffer(): Promise<Buffer> {
  const wb  = await buildGlobalExportWorkbook()
  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
