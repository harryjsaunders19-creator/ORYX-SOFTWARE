/**
 * lib/excel-import.ts
 *
 * Imports data from an Oryx Excel export workbook.
 * Matches the column layout produced by lib/global-export.ts.
 *
 * Strategy per sheet:
 *   Clients  — upsert by Customer ID (accountCode) then by exact company name
 *   Jobs     — upsert by Drawing Number
 *   Quotes   — upsert by Quote Number
 *
 * Sheets that are read-only / derived are skipped:
 *   Status History, Calendar, Invoicing Queue, Users
 */
import ExcelJS from "exceljs"
import { createId } from "@paralleldrive/cuid2"
import { parse, isValid } from "date-fns"
import { JOB_STATUSES, WORK_ITEM_TYPES } from "@/lib/constants"
import { clientService } from "@/lib/services/client-service"
import { jobService }    from "@/lib/services/job-service"
import { quoteService }  from "@/lib/services/quote-service"

// ── Label → internal code maps ────────────────────────────────────────────────

const STATUS_BY_LABEL = Object.fromEntries(
  JOB_STATUSES.map(s => [s.label.toLowerCase(), s.value]),
)

const ITEM_TYPE_BY_LABEL = Object.fromEntries(
  WORK_ITEM_TYPES.map(t => [t.label.toLowerCase(), t.value]),
)

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Parse dd/MM/yyyy → ISO date string, or null if blank/invalid. */
function parseDate(raw: unknown): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  if (!s) return null
  // ExcelJS may give us a JS Date object already
  if (raw instanceof Date && isValid(raw)) return raw.toISOString()
  const d = parse(s, "dd/MM/yyyy", new Date())
  return isValid(d) ? d.toISOString() : null
}

/** Extract a plain string from a cell value (handles rich text, numbers, etc.). */
function str(v: ExcelJS.CellValue): string {
  if (v == null) return ""
  if (typeof v === "string") return v.trim()
  if (typeof v === "number") return String(v)
  if (typeof v === "boolean") return String(v)
  if (v instanceof Date) return v.toISOString()
  if (typeof v === "object" && "richText" in v) {
    return (v as ExcelJS.CellRichTextValue).richText.map(r => r.text).join("").trim()
  }
  if (typeof v === "object" && "result" in v) {
    return str((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue)
  }
  return String(v).trim()
}

function num(v: ExcelJS.CellValue): number | null {
  const s = str(v)
  if (!s) return null
  const n = parseFloat(s.replace(/[£,$,\s]/g, ""))
  return isNaN(n) ? null : n
}

// ── Per-sheet results ─────────────────────────────────────────────────────────

export interface SheetResult {
  created: number
  updated: number
  skipped: number
  errors:  string[]
}

export interface ImportResult {
  clients: SheetResult
  jobs:    SheetResult
  quotes:  SheetResult
}

// ── Client import ─────────────────────────────────────────────────────────────

async function importClients(sheet: ExcelJS.Worksheet): Promise<SheetResult> {
  const result: SheetResult = { created: 0, updated: 0, skipped: 0, errors: [] }

  // Pre-fetch all clients for matching by accountCode or name
  const allClients = await clientService.findManyWithMeta({ take: 10000 }).catch(() => [])
  const byAccountCode = new Map<string, { id: string; name: string }>(allClients.filter(c => c.accountCode).map(c => [c.accountCode!, c]))
  const byName        = new Map<string, { id: string; name: string }>(allClients.map(c => [c.name.toLowerCase(), c]))

  // Col layout (1-indexed): Company Name, Customer ID, Main Contact, Phone,
  //   Email, Billing Address, Notes, Status, Added
  const rows = sheet.getRows(2, sheet.rowCount - 1) ?? []

  for (const row of rows) {
    const name = str(row.getCell(1))
    if (!name) { result.skipped++; continue }

    const accountCode  = str(row.getCell(2)) || null
    const contactName  = str(row.getCell(3)) || null
    const phone        = str(row.getCell(4)) || null
    const email        = str(row.getCell(5)) || null
    const billingAddr  = str(row.getCell(6)) || null
    const notes        = str(row.getCell(7)) || null
    const statusLabel  = str(row.getCell(8)).toLowerCase()
    const active       = statusLabel === "archived" ? 0 : 1

    try {
      const existing =
        (accountCode ? byAccountCode.get(accountCode) : null) ??
        byName.get(name.toLowerCase()) ??
        null

      if (existing) {
        await clientService.update(existing.id, {
          name, contactName, phone, email,
          billingAddress: billingAddr, notes, accountCode, active,
        })
        result.updated++
      } else {
        const created = await clientService.create({
          id: createId(), name, contactName, phone, email,
          billingAddress: billingAddr, notes, accountCode,
        })
        // Keep in-memory maps current for subsequent rows in same file
        if (accountCode) byAccountCode.set(accountCode, created)
        byName.set(name.toLowerCase(), created)
        result.created++
      }
    } catch (err) {
      result.errors.push(`Client "${name}": ${err instanceof Error ? err.message : String(err)}`)
      result.skipped++
    }
  }

  return result
}

// ── Job import ────────────────────────────────────────────────────────────────

async function importJobs(sheet: ExcelJS.Worksheet): Promise<SheetResult> {
  const result: SheetResult = { created: 0, updated: 0, skipped: 0, errors: [] }

  // Pre-fetch all jobs once so we can look up by drawing number efficiently
  const allJobs = await jobService.findMany({ take: 50000 }).catch(() => [] as Awaited<ReturnType<typeof jobService.findMany>>)
  const jobByDrawingNumber = new Map(allJobs.map(j => [j.drawingNumber.toUpperCase(), j]))

  // Pre-fetch all clients so we can resolve clientId from company name
  const allClients = await clientService.findManyWithMeta({ take: 10000 }).catch(() => [])
  const clientByName = new Map(allClients.map(c => [c.name.toLowerCase(), c]))

  // Col layout (1-indexed): Drawing Number, Item Type, Site Address, Type of Works,
  //   Client, Customer ID, Requested By, Status, Designer, Quote Value, Variation Fees,
  //   Quote Reference, Date Created, Required By, Date Completed, Last Updated, Notes
  const rows = sheet.getRows(2, sheet.rowCount - 1) ?? []

  for (const row of rows) {
    const drawingNumber = str(row.getCell(1))
    if (!drawingNumber) { result.skipped++; continue }

    const itemTypeLabel  = str(row.getCell(2)).toLowerCase()
    const address        = str(row.getCell(3))
    const typeOfWorks    = str(row.getCell(4)) || "Other"
    const clientCompany  = str(row.getCell(5)) || ""
    const requestedBy    = str(row.getCell(7)) || ""
    const statusLabel    = str(row.getCell(8)).toLowerCase()
    const designer       = str(row.getCell(9)) || ""
    const quoteValue     = num(row.getCell(10))
    const variationFees  = num(row.getCell(11))
    const quoteReference = str(row.getCell(12)) || null
    const requiredByDate = parseDate(row.getCell(14).value)
    const dateCompleted  = parseDate(row.getCell(15).value)
    const notes          = str(row.getCell(17)) || null

    const status   = STATUS_BY_LABEL[statusLabel]    ?? "NEW_REQUEST"
    const itemType = ITEM_TYPE_BY_LABEL[itemTypeLabel] ?? "DESIGN"

    const client   = clientByName.get(clientCompany.toLowerCase())
    const clientId = client?.id ?? null

    try {
      const existing = jobByDrawingNumber.get(drawingNumber.toUpperCase())

      if (existing) {
        await jobService.update(existing.id, {
          address, typeOfWorks, clientCompany, clientId,
          requestedBy, status, designer,
          quoteValue, variationFees, quoteReference,
          requiredByDate, dateCompleted, notes,
          changedBy: "Excel Import",
        })
        result.updated++
      } else {
        if (!address) { result.skipped++; continue }
        await jobService.create({
          id: createId(), drawingNumber, itemType,
          address, typeOfWorks, clientCompany, clientId,
          requestedBy, status, designer,
          quoteValue: quoteValue ?? null, variationFees: variationFees ?? null,
          quoteReference: quoteReference ?? null,
          dateCompleted: null, notes: notes ?? null,
          requiredByDate: requiredByDate ?? null,
          changedBy: "Excel Import",
        })
        result.created++
      }
    } catch (err) {
      result.errors.push(`Job "${drawingNumber}": ${err instanceof Error ? err.message : String(err)}`)
      result.skipped++
    }
  }

  return result
}

// ── Quote import ──────────────────────────────────────────────────────────────

async function importQuotes(sheet: ExcelJS.Worksheet): Promise<SheetResult> {
  const result: SheetResult = { created: 0, updated: 0, skipped: 0, errors: [] }

  // Pre-fetch all quotes for lookup by quoteNumber
  const allQuotes = await quoteService.findMany({ take: 50000 }).catch(() => [] as Awaited<ReturnType<typeof quoteService.findMany>>)
  const quoteByNumber = new Map(allQuotes.map(q => [q.quoteNumber, q]))

  // Col layout (1-indexed): Quote Number, Status, Client, Contact,
  //   Site Address, Description, Quote Value, VAT Rate,
  //   Quote Date, Expiry Date, Created By, Notes
  const rows = sheet.getRows(2, sheet.rowCount - 1) ?? []

  for (const row of rows) {
    const quoteNumber = str(row.getCell(1))
    if (!quoteNumber) { result.skipped++; continue }

    const statusRaw    = str(row.getCell(2)).toUpperCase()
    const clientCompany = str(row.getCell(3)) || ""
    const contactName  = str(row.getCell(4)) || null
    const address      = str(row.getCell(5)) || ""
    const description  = str(row.getCell(6)) || ""
    const quoteValue   = num(row.getCell(7)) ?? 0
    const vatRate      = num(row.getCell(8))
    const quoteDate    = parseDate(row.getCell(9).value) ?? new Date().toISOString()
    const expiryDate   = parseDate(row.getCell(10).value)
    const notes        = str(row.getCell(12)) || null

    const VALID_QUOTE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"]
    const status = VALID_QUOTE_STATUSES.includes(statusRaw) ? statusRaw : "DRAFT"

    try {
      const existing = quoteByNumber.get(quoteNumber)

      if (existing) {
        await quoteService.update(existing.id, {
          clientCompany, contactName, address, description,
          quoteValue, vatRate, quoteDate, expiryDate, status, notes,
        })
        result.updated++
      } else {
        if (!address || !description) { result.skipped++; continue }
        await quoteService.create({
          clientCompany, contactName, address, description,
          quoteValue, vatRate: vatRate ?? null,
          quoteDate, expiryDate: expiryDate ?? null,
          status, notes: notes ?? null,
          createdBy: "Excel Import",
        })
        result.created++
      }
    } catch (err) {
      result.errors.push(`Quote "${quoteNumber}": ${err instanceof Error ? err.message : String(err)}`)
      result.skipped++
    }
  }

  return result
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function importFromExcelBuffer(buffer: ArrayBuffer): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)

  const clientsSheet = wb.getWorksheet("Clients")
  const jobsSheet    = wb.getWorksheet("Jobs")
  const quotesSheet  = wb.getWorksheet("Quotes")

  // Import clients first — jobs may reference client IDs
  const clients = clientsSheet
    ? await importClients(clientsSheet)
    : { created: 0, updated: 0, skipped: 0, errors: ["No 'Clients' sheet found"] }

  const jobs = jobsSheet
    ? await importJobs(jobsSheet)
    : { created: 0, updated: 0, skipped: 0, errors: ["No 'Jobs' sheet found"] }

  const quotes = quotesSheet
    ? await importQuotes(quotesSheet)
    : { created: 0, updated: 0, skipped: 0, errors: ["No 'Quotes' sheet found"] }

  return { clients, jobs, quotes }
}
