/**
 * lib/excel-import.ts
 *
 * Imports data from an Oryx Excel export workbook.
 * Matches the column layout produced by lib/global-export.ts.
 *
 * Strategy per sheet:
 *   Clients  — upsert by Customer ID (accountCode) then by exact company name
 *   Jobs     — upsert by Drawing Number (bulk Supabase upsert when linked)
 *   Quotes   — upsert by Quote Number (bulk Supabase upsert when linked)
 *
 * Sheets that are read-only / derived are skipped:
 *   Status History, Calendar, Invoicing Queue, Users
 */
import ExcelJS from "exceljs"
import { createId } from "@paralleldrive/cuid2"
import { parse, isValid } from "date-fns"
import { JOB_STATUSES, WORK_ITEM_TYPES } from "@/lib/constants"
import { clientService } from "@/lib/services/client-service"
import { jobService } from "@/lib/services/job-service"
import { quoteService } from "@/lib/services/quote-service"
import type { ClientRow } from "@/lib/db/client-types"
import { sheetDataRows } from "../utils/excel-import-rows"
import {
  buildClientRowFromImport,
  buildJobRowFromImport,
  buildQuoteRowFromImport,
  bulkImportClients,
  bulkImportJobs,
  bulkImportQuotes,
  formatImportError,
  shouldUseBulkImport,
} from "./import-excel-bulk"
import { useSupabaseClients, useSupabaseJobs, useSupabaseQuotes } from "@/lib/supabase/feature-flags"

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
  if (raw instanceof Date && isValid(raw)) return raw.toISOString()
  const d = parse(s, "dd/MM/yyyy", new Date())
  return isValid(d) ? d.toISOString() : null
}

/** Unwrap an ExcelJS Cell (API uploads load workbooks where Cell.toString() is empty). */
function cellVal(v: ExcelJS.CellValue | ExcelJS.Cell): ExcelJS.CellValue {
  if (v != null && typeof v === "object" && "value" in v && typeof (v as ExcelJS.Cell).row === "number") {
    return (v as ExcelJS.Cell).value
  }
  return v as ExcelJS.CellValue
}

/** Extract a plain string from a cell value (handles rich text, numbers, etc.). */
function str(v: ExcelJS.CellValue | ExcelJS.Cell): string {
  const raw = cellVal(v)
  if (raw == null) return ""
  if (typeof raw === "string") return raw.trim()
  if (typeof raw === "number") return String(raw)
  if (typeof raw === "boolean") return String(raw)
  if (raw instanceof Date) return raw.toISOString()
  if (typeof raw === "object" && "richText" in raw) {
    return (raw as ExcelJS.CellRichTextValue).richText.map(r => r.text).join("").trim()
  }
  if (typeof raw === "object" && "result" in raw) {
    return str((raw as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue)
  }
  return String(raw).trim()
}

function num(v: ExcelJS.CellValue | ExcelJS.Cell): number | null {
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

  let allClients: ClientRow[]
  try {
    allClients = await clientService.findManyWithMeta({ take: 10000 })
  } catch (err) {
    result.errors.push(`Could not load existing clients: ${formatImportError(err)}`)
    return result
  }

  const byAccountCode = new Map<string, ClientRow>()
  const byName = new Map<string, ClientRow>()
  for (const c of allClients) {
    if (c.accountCode) byAccountCode.set(c.accountCode, c)
    byName.set(c.name.toLowerCase(), c)
  }

  const toUpsert: ClientRow[] = []
  let createCount = 0
  let updateCount = 0

  for (const row of sheetDataRows(sheet)) {
    const name = str(row.getCell(1))
    if (!name) { result.skipped++; continue }

    const accountCode = str(row.getCell(2)) || null
    const contactName = str(row.getCell(3)) || null
    const phone = str(row.getCell(4)) || null
    const email = str(row.getCell(5)) || null
    const billingAddr = str(row.getCell(6)) || null
    const notes = str(row.getCell(7)) || null
    const statusLabel = str(row.getCell(8)).toLowerCase()
    const active = statusLabel === "archived" ? 0 : 1

    const existing =
      (accountCode ? byAccountCode.get(accountCode) : null) ??
      byName.get(name.toLowerCase()) ??
      null

    if (existing) updateCount++
    else createCount++

    toUpsert.push(buildClientRowFromImport({
      id: existing?.id ?? createId(),
      name, contactName, phone, email,
      billingAddress: billingAddr, notes, accountCode, active,
    }))
  }

  if (!toUpsert.length) return result

  if (useSupabaseClients()) {
    try {
      await bulkImportClients(toUpsert)
      result.created += createCount
      result.updated += updateCount
    } catch (err) {
      result.errors.push(`Bulk client import: ${formatImportError(err)}`)
      result.skipped += createCount + updateCount
    }
    return result
  }

  for (const client of toUpsert) {
    const existing = byName.get(client.name.toLowerCase())
    try {
      if (existing) {
        await clientService.update(existing.id, {
          name: client.name,
          contactName: client.contactName,
          phone: client.phone,
          email: client.email,
          billingAddress: client.billingAddress,
          notes: client.notes,
          accountCode: client.accountCode,
          active: client.active,
        })
        result.updated++
      } else {
        await clientService.create({
          id: client.id,
          name: client.name,
          contactName: client.contactName,
          phone: client.phone,
          email: client.email,
          billingAddress: client.billingAddress,
          notes: client.notes,
          accountCode: client.accountCode,
        })
        result.created++
      }
    } catch (err) {
      result.errors.push(`Client "${client.name}": ${formatImportError(err)}`)
      result.skipped++
    }
  }

  return result
}

// ── Job import ────────────────────────────────────────────────────────────────

async function importJobs(sheet: ExcelJS.Worksheet): Promise<SheetResult> {
  const result: SheetResult = { created: 0, updated: 0, skipped: 0, errors: [] }

  let allJobs: Awaited<ReturnType<typeof jobService.findMany>>
  try {
    allJobs = await jobService.findMany({ take: 50000 })
  } catch (err) {
    result.errors.push(`Could not load existing jobs: ${formatImportError(err)}`)
    return result
  }
  const jobByDrawingNumber = new Map(allJobs.map(j => [j.drawingNumber.toUpperCase(), j]))

  let allClients: Awaited<ReturnType<typeof clientService.findManyWithMeta>>
  try {
    allClients = await clientService.findManyWithMeta({ take: 10000 })
  } catch (err) {
    result.errors.push(`Could not load clients for job linking: ${formatImportError(err)}`)
    return result
  }
  const clientByName = new Map(allClients.map(c => [c.name.toLowerCase(), c]))

  const rows: ReturnType<typeof buildJobRowFromImport>[] = []
  let createCount = 0
  let updateCount = 0

  for (const row of sheetDataRows(sheet)) {
    const drawingNumber = str(row.getCell(1))
    if (!drawingNumber) { result.skipped++; continue }

    const itemTypeLabel = str(row.getCell(2)).toLowerCase()
    const address = str(row.getCell(3))
    const typeOfWorks = str(row.getCell(4)) || "Other"
    const clientCompany = str(row.getCell(5)) || ""
    const requestedBy = str(row.getCell(7)) || ""
    const statusLabel = str(row.getCell(8)).toLowerCase()
    const designer = str(row.getCell(9)) || ""
    const quoteValue = num(row.getCell(10))
    const variationFees = num(row.getCell(11))
    const quoteReference = str(row.getCell(12)) || null
    const dateCreated = parseDate(cellVal(row.getCell(13)))
    const requiredByDate = parseDate(cellVal(row.getCell(14)))
    const dateCompleted = parseDate(cellVal(row.getCell(15)))
    const notes = str(row.getCell(17)) || null

    const status = STATUS_BY_LABEL[statusLabel] ?? "NEW_REQUEST"
    const itemType = ITEM_TYPE_BY_LABEL[itemTypeLabel] ?? "DESIGN"
    const client = clientByName.get(clientCompany.toLowerCase())
    const clientId = client?.id ?? null

    const existing = jobByDrawingNumber.get(drawingNumber.toUpperCase())
    if (!existing && !address) { result.skipped++; continue }

    if (existing) updateCount++
    else createCount++

    rows.push(buildJobRowFromImport({
      id: existing?.id ?? createId(),
      drawingNumber,
      itemType,
      address,
      typeOfWorks,
      clientCompany,
      clientId,
      requestedBy,
      status,
      designer,
      quoteValue: quoteValue ?? null,
      variationFees: variationFees ?? null,
      quoteReference,
      requiredByDate,
      dateCreated,
      dateCompleted,
      notes,
    }))
  }

  if (!rows.length) return result

  if (useSupabaseJobs()) {
    try {
      await bulkImportJobs(rows)
      result.created += createCount
      result.updated += updateCount
    } catch (err) {
      result.errors.push(`Bulk job import: ${formatImportError(err)}`)
      result.skipped += createCount + updateCount
    }
    return result
  }

  for (const job of rows) {
    const existing = jobByDrawingNumber.get(job.drawingNumber.toUpperCase())
    try {
      if (existing) {
        await jobService.update(existing.id, {
          address: job.address,
          typeOfWorks: job.typeOfWorks,
          clientCompany: job.clientCompany,
          clientId: job.clientId,
          requestedBy: job.requestedBy,
          status: job.status,
          designer: job.designer,
          quoteValue: job.quoteValue,
          variationFees: job.variationFees,
          quoteReference: job.quoteReference,
          requiredByDate: job.requiredByDate,
          dateCompleted: job.dateCompleted,
          notes: job.notes,
          changedBy: "Excel Import",
        })
        result.updated++
      } else {
        await jobService.create({
          id: job.id,
          drawingNumber: job.drawingNumber,
          itemType: job.itemType,
          address: job.address,
          typeOfWorks: job.typeOfWorks,
          clientCompany: job.clientCompany,
          clientId: job.clientId,
          requestedBy: job.requestedBy,
          status: job.status,
          designer: job.designer,
          quoteValue: job.quoteValue,
          variationFees: job.variationFees,
          quoteReference: job.quoteReference,
          dateCompleted: job.dateCompleted,
          notes: job.notes,
          requiredByDate: job.requiredByDate,
          changedBy: "Excel Import",
        })
        result.created++
      }
    } catch (err) {
      result.errors.push(`Job "${job.drawingNumber}": ${formatImportError(err)}`)
      result.skipped++
    }
  }

  return result
}

// ── Quote import ──────────────────────────────────────────────────────────────

async function importQuotes(sheet: ExcelJS.Worksheet): Promise<SheetResult> {
  const result: SheetResult = { created: 0, updated: 0, skipped: 0, errors: [] }

  let allQuotes: Awaited<ReturnType<typeof quoteService.findMany>>
  try {
    allQuotes = await quoteService.findMany({ take: 50000 })
  } catch (err) {
    result.errors.push(`Could not load existing quotes: ${formatImportError(err)}`)
    return result
  }
  const quoteByNumber = new Map(allQuotes.map(q => [q.quoteNumber, q]))

  let allClients: Awaited<ReturnType<typeof clientService.findManyWithMeta>>
  try {
    allClients = await clientService.findManyWithMeta({ take: 10000 })
  } catch (err) {
    result.errors.push(`Could not load clients for quote linking: ${formatImportError(err)}`)
    return result
  }
  const clientByName = new Map(allClients.map(c => [c.name.toLowerCase(), c]))

  const rows: ReturnType<typeof buildQuoteRowFromImport>[] = []
  let createCount = 0
  let updateCount = 0

  for (const row of sheetDataRows(sheet)) {
    const quoteNumber = str(row.getCell(1))
    if (!quoteNumber) { result.skipped++; continue }

    const statusRaw = str(row.getCell(2)).toUpperCase()
    const clientCompany = str(row.getCell(3)) || ""
    const contactName = str(row.getCell(4)) || null
    const address = str(row.getCell(5)) || ""
    const description = str(row.getCell(6)) || ""
    const quoteValue = num(row.getCell(7)) ?? 0
    const vatRate = num(row.getCell(8))
    const quoteDate = parseDate(cellVal(row.getCell(9))) ?? new Date().toISOString()
    const expiryDate = parseDate(cellVal(row.getCell(10)))
    const notes = str(row.getCell(12)) || null

    const VALID_QUOTE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"]
    const status = VALID_QUOTE_STATUSES.includes(statusRaw) ? statusRaw : "DRAFT"
    const client = clientByName.get(clientCompany.toLowerCase())

    const existing = quoteByNumber.get(quoteNumber)
    if (!existing && (!address || !description)) { result.skipped++; continue }

    if (existing) updateCount++
    else createCount++

    rows.push(buildQuoteRowFromImport({
      id: existing?.id ?? createId(),
      quoteNumber,
      clientId: client?.id ?? null,
      clientCompany,
      contactName,
      address,
      description,
      quoteValue,
      quoteDate,
      expiryDate,
      status,
      notes,
      createdBy: "Excel Import",
      vatRate: vatRate ?? null,
    }))
  }

  if (!rows.length) return result

  if (useSupabaseQuotes()) {
    try {
      await bulkImportQuotes(rows)
      result.created += createCount
      result.updated += updateCount
    } catch (err) {
      result.errors.push(`Bulk quote import: ${formatImportError(err)}`)
      result.skipped += createCount + updateCount
    }
    return result
  }

  for (const quote of rows) {
    const existing = quoteByNumber.get(quote.quoteNumber)
    try {
      if (existing) {
        await quoteService.update(existing.id, {
          clientId: quote.clientId,
          clientCompany: quote.clientCompany,
          contactName: quote.contactName,
          address: quote.address,
          description: quote.description,
          quoteValue: quote.quoteValue,
          vatRate: quote.vatRate,
          quoteDate: quote.quoteDate,
          expiryDate: quote.expiryDate,
          status: quote.status,
          notes: quote.notes,
        })
        result.updated++
      } else {
        await quoteService.create({
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          clientId: quote.clientId,
          clientCompany: quote.clientCompany,
          contactName: quote.contactName,
          address: quote.address,
          description: quote.description,
          quoteValue: quote.quoteValue,
          vatRate: quote.vatRate,
          quoteDate: quote.quoteDate,
          expiryDate: quote.expiryDate,
          status: quote.status,
          notes: quote.notes,
          createdBy: quote.createdBy,
        })
        result.created++
      }
    } catch (err) {
      result.errors.push(`Quote "${quote.quoteNumber}": ${formatImportError(err)}`)
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
  const jobsSheet = wb.getWorksheet("Jobs")
  const quotesSheet = wb.getWorksheet("Quotes")

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

/** @deprecated used internally — exported for tests */
export { shouldUseBulkImport }
