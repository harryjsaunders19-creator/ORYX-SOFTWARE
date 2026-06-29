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
import { sheetDataRows } from "@/lib/excel-import-rows"
import type { JobRow, UpdateJobData } from "@/lib/db/job-types"
import type { QuoteRow, UpdateQuoteData } from "@/lib/db/quote-types"
import {
  buildJobRowFromImport,
  buildQuoteRowFromImport,
  bulkImportClients,
  bulkImportJobs,
  bulkImportQuotes,
  mergeJobForImport,
  mergeQuoteForImport,
  shouldUseBulkImport,
} from "@/lib/import-excel-bulk"
import { useSupabaseClients, useSupabaseJobs, useSupabaseQuotes } from "@/lib/supabase/feature-flags"
import type { CreateClientData, UpdateClientData } from "@/lib/db/client-types"

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

  const allClients = await clientService.findMany({ take: 10000 }).catch(() => [])
  const byAccountCode = new Map<string, ClientRow>()
  const byName = new Map<string, ClientRow>()
  for (const c of allClients) {
    if (c.accountCode) byAccountCode.set(c.accountCode, c)
    byName.set(c.name.toLowerCase(), c)
  }

  const toCreate: Array<CreateClientData & { active: number }> = []
  const updates: Array<{ id: string; name: string; data: UpdateClientData }> = []

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

    if (existing) {
      updates.push({
        id: existing.id,
        name,
        data: {
          name, contactName, phone, email,
          billingAddress: billingAddr, notes, accountCode, active,
        },
      })
    } else {
      toCreate.push({
        id: createId(), name, contactName, phone, email,
        billingAddress: billingAddr, notes, accountCode, active,
      })
    }
  }

  if (useSupabaseClients() && toCreate.length) {
    try {
      const created = await bulkImportClients(toCreate)
      result.created += created.length
      for (const c of created) {
        if (c.accountCode) byAccountCode.set(c.accountCode, c)
        byName.set(c.name.toLowerCase(), c)
      }
    } catch (err) {
      result.errors.push(`Bulk client import: ${err instanceof Error ? err.message : String(err)}`)
      result.skipped += toCreate.length
    }
  } else {
    for (const data of toCreate) {
      try {
        const created = await clientService.create(data)
        if (data.accountCode) byAccountCode.set(data.accountCode, created)
        byName.set(data.name.toLowerCase(), created)
        result.created++
      } catch (err) {
        result.errors.push(`Client "${data.name}": ${err instanceof Error ? err.message : String(err)}`)
        result.skipped++
      }
    }
  }

  for (const { id, name, data } of updates) {
    try {
      await clientService.update(id, data)
      result.updated++
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

  const allJobs = await jobService.findMany({ take: 50000 }).catch(() => [] as Awaited<ReturnType<typeof jobService.findMany>>)
  const jobByDrawingNumber = new Map(allJobs.map(j => [j.drawingNumber.toUpperCase(), j]))

  const allClients = await clientService.findMany({ take: 10000 }).catch(() => [])
  const clientByName = new Map(allClients.map(c => [c.name.toLowerCase(), c]))

  const toCreate: ReturnType<typeof buildJobRowFromImport>[] = []
  const updates: Array<{ existing: JobRow; drawingNumber: string; data: UpdateJobData }> = []

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
    if (existing) {
      updates.push({
        existing,
        drawingNumber,
        data: {
          address, typeOfWorks, clientCompany, clientId,
          requestedBy, status, designer,
          quoteValue, variationFees, quoteReference,
          requiredByDate, dateCompleted, notes,
          changedBy: "Excel Import",
        },
      })
    } else {
      if (!address) { result.skipped++; continue }
      toCreate.push(buildJobRowFromImport({
        id: createId(),
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
  }

  if (useSupabaseJobs() && toCreate.length) {
    try {
      await bulkImportJobs(toCreate)
      result.created += toCreate.length
    } catch (err) {
      result.errors.push(`Bulk job import: ${err instanceof Error ? err.message : String(err)}`)
      result.skipped += toCreate.length
    }
  } else {
    for (const job of toCreate) {
      try {
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
      } catch (err) {
        result.errors.push(`Job "${job.drawingNumber}": ${err instanceof Error ? err.message : String(err)}`)
        result.skipped++
      }
    }
  }

  if (useSupabaseJobs() && updates.length) {
    try {
      await bulkImportJobs(updates.map(({ existing, data }) => mergeJobForImport(existing, data)))
      result.updated += updates.length
    } catch (err) {
      result.errors.push(`Bulk job update: ${err instanceof Error ? err.message : String(err)}`)
      result.skipped += updates.length
    }
  } else {
    for (const { existing, drawingNumber, data } of updates) {
      try {
        await jobService.update(existing.id, data)
        result.updated++
      } catch (err) {
        result.errors.push(`Job "${drawingNumber}": ${err instanceof Error ? err.message : String(err)}`)
        result.skipped++
      }
    }
  }

  return result
}

// ── Quote import ──────────────────────────────────────────────────────────────

async function importQuotes(sheet: ExcelJS.Worksheet): Promise<SheetResult> {
  const result: SheetResult = { created: 0, updated: 0, skipped: 0, errors: [] }

  const allQuotes = await quoteService.findMany({ take: 50000 }).catch(() => [] as Awaited<ReturnType<typeof quoteService.findMany>>)
  const quoteByNumber = new Map(allQuotes.map(q => [q.quoteNumber, q]))

  const allClients = await clientService.findMany({ take: 10000 }).catch(() => [])
  const clientByName = new Map(allClients.map(c => [c.name.toLowerCase(), c]))

  const toCreate: ReturnType<typeof buildQuoteRowFromImport>[] = []
  const updates: Array<{ existing: QuoteRow; quoteNumber: string; data: UpdateQuoteData }> = []

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
    if (existing) {
      updates.push({
        existing,
        quoteNumber,
        data: {
          clientId: client?.id ?? null,
          clientCompany, contactName, address, description,
          quoteValue, vatRate, quoteDate, expiryDate, status, notes,
        },
      })
    } else {
      if (!address || !description) { result.skipped++; continue }
      toCreate.push(buildQuoteRowFromImport({
        id: createId(),
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
  }

  if (useSupabaseQuotes() && toCreate.length) {
    try {
      await bulkImportQuotes(toCreate)
      result.created += toCreate.length
    } catch (err) {
      result.errors.push(`Bulk quote import: ${err instanceof Error ? err.message : String(err)}`)
      result.skipped += toCreate.length
    }
  } else {
    for (const quote of toCreate) {
      try {
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
      } catch (err) {
        result.errors.push(`Quote "${quote.quoteNumber}": ${err instanceof Error ? err.message : String(err)}`)
        result.skipped++
      }
    }
  }

  if (useSupabaseQuotes() && updates.length) {
    try {
      await bulkImportQuotes(updates.map(({ existing, data }) => mergeQuoteForImport(existing, data)))
      result.updated += updates.length
    } catch (err) {
      result.errors.push(`Bulk quote update: ${err instanceof Error ? err.message : String(err)}`)
      result.skipped += updates.length
    }
  } else {
    for (const { existing, quoteNumber, data } of updates) {
      try {
        await quoteService.update(existing.id, data)
        result.updated++
      } catch (err) {
        result.errors.push(`Quote "${quoteNumber}": ${err instanceof Error ? err.message : String(err)}`)
        result.skipped++
      }
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
