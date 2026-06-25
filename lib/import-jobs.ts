/**
 * lib/import-jobs.ts
 *
 * Parsing, header-mapping, and validation utilities for the bulk job import
 * feature. Handles both CSV and XLSX files via the SheetJS library (already
 * a project dependency). Runs server-side only — the client sends the raw
 * file, this module does the rest.
 *
 * Design decisions:
 *   - typeOfWorks values that don't match the controlled list are mapped to
 *     "Other" with the original text preserved as customTypeDescription,
 *     matching the same migration strategy used for legacy data in db.ts.
 *   - Drawing numbers are always auto-generated (the import never trusts
 *     user-supplied drawing numbers) — the sequence generator is the single
 *     source of truth.
 *   - Duplicate detection uses address + clientCompany + typeOfWorks as the
 *     compound key, since drawing numbers are auto-generated and can't be
 *     compared pre-import.
 */

import { WORKS_TYPES, isValidWorksType, OTHER_WORKS_TYPE, VALID_STATUSES } from "@/lib/constants"
import type { JobStatusValue } from "@/lib/constants"

// ── Header mapping ──────────────────────────────────────────────────

/** Canonical field names the import understands. */
export const IMPORT_FIELDS = [
  "address",
  "typeOfWorks",
  "clientCompany",
  "requestedBy",
  "designer",
  "status",
  "notes",
  "quoteValue",
  "quoteReference",
  "quoteDate",
  "commercialNotes",
  "requiredByDate",
  "requestedDate",
  "dateCompleted",
  "itemType",
] as const

export type ImportField = typeof IMPORT_FIELDS[number]

const HEADER_ALIASES: Record<string, ImportField> = {
  "address":            "address",
  "site address":       "address",
  "site":               "address",
  "location":           "address",
  "project address":    "address",

  "type of works":      "typeOfWorks",
  "typeofworks":        "typeOfWorks",
  "type":               "typeOfWorks",
  "works type":         "typeOfWorks",
  "work type":          "typeOfWorks",

  "client":             "clientCompany",
  "client company":     "clientCompany",
  "clientcompany":      "clientCompany",
  "company":            "clientCompany",
  "customer":           "clientCompany",
  "client name":        "clientCompany",

  "requested by":       "requestedBy",
  "requestedby":        "requestedBy",
  "contact":            "requestedBy",
  "contact name":       "requestedBy",
  "requester":          "requestedBy",

  "designer":           "designer",
  "designer / engineer":"designer",
  "engineer":           "designer",
  "assigned to":        "designer",
  "assigned":           "designer",

  "status":             "status",
  "completion status":  "status",
  "job status":         "status",

  "notes":              "notes",
  "note":               "notes",
  "comments":           "notes",
  "comment":            "notes",
  "description":        "notes",

  "quote value":        "quoteValue",
  "quotevalue":         "quoteValue",
  "value":              "quoteValue",
  "price":              "quoteValue",
  "fee":                "quoteValue",
  "quotation":          "quoteValue",
  "quote":              "quoteValue",

  "quote reference":    "quoteReference",
  "quotereference":     "quoteReference",
  "quote ref":          "quoteReference",
  "quote no":           "quoteReference",
  "quote number":       "quoteReference",

  "quote date":         "quoteDate",
  "quotedate":          "quoteDate",

  "commercial notes":   "commercialNotes",
  "commercialnotes":    "commercialNotes",
  "pricing notes":      "commercialNotes",

  "required by":        "requiredByDate",
  "requiredbydate":     "requiredByDate",
  "required by date":   "requiredByDate",
  "deadline":           "requiredByDate",
  "due date":           "requiredByDate",
  "due":                "requiredByDate",

  "requested date":     "requestedDate",
  "requesteddate":      "requestedDate",
  "request date":       "requestedDate",
  "date requested":     "requestedDate",

  "date completed":     "dateCompleted",
  "datecompleted":      "dateCompleted",
  "completed":          "dateCompleted",
  "completion date":    "dateCompleted",

  "item type":          "itemType",
  "itemtype":           "itemType",
  "work item type":     "itemType",
}

/** Maps raw spreadsheet headers to canonical field names. Returns the mapping
 *  and a list of headers that couldn't be matched. */
export function detectHeaderMapping(rawHeaders: string[]): {
  mapping: Record<number, ImportField>
  unmapped: string[]
} {
  const mapping: Record<number, ImportField> = {}
  const unmapped: string[] = []
  const usedFields = new Set<ImportField>()

  for (let i = 0; i < rawHeaders.length; i++) {
    const raw = rawHeaders[i]
    const normalised = raw.trim().toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ")
    const field = HEADER_ALIASES[normalised]
    if (field && !usedFields.has(field)) {
      mapping[i] = field
      usedFields.add(field)
    } else if (!field) {
      unmapped.push(raw)
    }
  }
  return { mapping, unmapped }
}

// ── Row parsing & validation ────────────────────────────────────────

export interface ParsedImportRow {
  rowIndex: number
  address: string
  typeOfWorks: string
  customTypeDescription: string | null
  clientCompany: string
  requestedBy: string
  designer: string
  status: string
  notes: string | null
  quoteValue: number | null
  quoteReference: string | null
  quoteDate: string | null
  commercialNotes: string | null
  requiredByDate: string | null
  requestedDate: string | null
  dateCompleted: string | null
  itemType: string
  errors: string[]
  warnings: string[]
}

const STATUS_ALIASES: Record<string, JobStatusValue> = {
  "new":              "NEW_REQUEST",
  "new request":      "NEW_REQUEST",
  "new_request":      "NEW_REQUEST",
  "in design":        "IN_DESIGN",
  "in_design":        "IN_DESIGN",
  "in progress":      "IN_DESIGN",
  "design":           "IN_DESIGN",
  "checking":         "CHECKING",
  "requires checking":"CHECKING",
  "review":           "CHECKING",
  "issued":           "ISSUED",
  "complete":         "ISSUED",
  "completed":        "ISSUED",
  "done":             "ISSUED",
}

function normaliseStatus(raw: string): string {
  if (!raw) return "NEW_REQUEST"
  const trimmed = raw.trim()
  if (VALID_STATUSES.includes(trimmed as JobStatusValue)) return trimmed
  return STATUS_ALIASES[trimmed.toLowerCase()] ?? "NEW_REQUEST"
}

function parseDate(raw: string | undefined | null): string | null {
  if (!raw || !raw.trim()) return null
  const s = raw.trim()

  // Try DD/MM/YYYY (common UK format)
  const ukMatch = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
  if (ukMatch) {
    const [, dd, mm, yyyy] = ukMatch
    const d = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd))
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }

  // Try YYYY-MM-DD (ISO)
  const isoMatch = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/)
  if (isoMatch) {
    const d = new Date(s)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }

  // Excel serial date (number of days since 1900-01-01)
  const num = parseFloat(s)
  if (!isNaN(num) && num > 30000 && num < 70000) {
    const d = new Date((num - 25569) * 86400000)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }

  // Fallback: let JS parse it
  const fallback = new Date(s)
  if (!isNaN(fallback.getTime())) return fallback.toISOString().slice(0, 10)

  return null
}

function parseQuoteValue(raw: string | undefined | null): number | null {
  if (raw == null) return null
  const cleaned = String(raw).replace(/[£$€,\s]/g, "").trim()
  if (!cleaned) return null
  const n = parseFloat(cleaned)
  if (isNaN(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

function normaliseTypeOfWorks(raw: string): { typeOfWorks: string; customTypeDescription: string | null; warning: string | null } {
  if (!raw || !raw.trim()) return { typeOfWorks: "", customTypeDescription: null, warning: null }
  const trimmed = raw.trim()

  if (isValidWorksType(trimmed)) {
    return { typeOfWorks: trimmed, customTypeDescription: null, warning: null }
  }

  // Try case-insensitive match
  const lower = trimmed.toLowerCase()
  const exactMatch = WORKS_TYPES.find(w => w.toLowerCase() === lower)
  if (exactMatch) {
    return { typeOfWorks: exactMatch, customTypeDescription: null, warning: null }
  }

  // Partial / fuzzy match — check if the input contains or is contained by an approved value
  const partialMatch = WORKS_TYPES.find(w =>
    w.toLowerCase().includes(lower) || lower.includes(w.toLowerCase())
  )
  if (partialMatch) {
    return { typeOfWorks: partialMatch, customTypeDescription: null, warning: `"${trimmed}" mapped to "${partialMatch}"` }
  }

  // No match — map to Other
  return {
    typeOfWorks: OTHER_WORKS_TYPE,
    customTypeDescription: trimmed,
    warning: `"${trimmed}" not in approved list — mapped to Other`,
  }
}

/** Converts one raw row (keyed by column index) into a validated ParsedImportRow. */
export function parseRow(
  rawValues: (string | number | undefined)[],
  mapping: Record<number, ImportField>,
  rowIndex: number,
): ParsedImportRow {
  const get = (field: ImportField): string => {
    for (const [idx, f] of Object.entries(mapping)) {
      if (f === field) {
        const v = rawValues[parseInt(idx)]
        return v != null ? String(v).trim() : ""
      }
    }
    return ""
  }

  const errors: string[] = []
  const warnings: string[] = []

  const address = get("address")
  const clientCompany = get("clientCompany")
  const requestedBy = get("requestedBy")
  const rawTypeOfWorks = get("typeOfWorks")
  const itemType = get("itemType").toUpperCase() || "DESIGN"

  if (!address) errors.push("Site address is required")
  if (!clientCompany) errors.push("Client company is required")
  if (!requestedBy) errors.push("Requested by is required")

  const { typeOfWorks, customTypeDescription, warning: towWarning } = normaliseTypeOfWorks(rawTypeOfWorks)
  if (towWarning) warnings.push(towWarning)

  if (itemType === "DESIGN" && !typeOfWorks) {
    errors.push("Type of works is required for Design items")
  }

  const status = normaliseStatus(get("status"))
  const rawQv = get("quoteValue")
  const quoteValue = parseQuoteValue(rawQv)
  if (rawQv && quoteValue === null) warnings.push(`Could not parse quote value "${rawQv}"`)

  return {
    rowIndex,
    address,
    typeOfWorks,
    customTypeDescription,
    clientCompany,
    requestedBy,
    designer: get("designer"),
    status,
    notes: get("notes") || null,
    quoteValue,
    quoteReference: get("quoteReference") || null,
    quoteDate: parseDate(get("quoteDate")),
    commercialNotes: get("commercialNotes") || null,
    requiredByDate: parseDate(get("requiredByDate")),
    requestedDate: parseDate(get("requestedDate")),
    dateCompleted: parseDate(get("dateCompleted")),
    itemType: ["DESIGN", "SITE_VISIT", "SURVEY", "INSPECTION"].includes(itemType) ? itemType : "DESIGN",
    errors,
    warnings,
  }
}

// ── File parsing ────────────────────────────────────────────────────

export interface ParseFileResult {
  headers: string[]
  mapping: Record<number, ImportField>
  unmappedHeaders: string[]
  rows: ParsedImportRow[]
  totalRawRows: number
}

/** Parses a CSV or XLSX file buffer into structured import rows. */
export function parseSpreadsheet(buffer: Buffer, filename: string): ParseFileResult {
  // Dynamic require to avoid bundling xlsx on the client
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx")

  const ext = filename.toLowerCase().split(".").pop()
  let workbook: import("xlsx").WorkBook

  if (ext === "csv") {
    const text = buffer.toString("utf-8")
    workbook = XLSX.read(text, { type: "string" })
  } else {
    workbook = XLSX.read(buffer, { type: "buffer" })
  }

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return { headers: [], mapping: {}, unmappedHeaders: [], rows: [], totalRawRows: 0 }
  }

  const sheet = workbook.Sheets[sheetName]
  const rawData = XLSX.utils.sheet_to_json<(string | number | undefined)[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  })

  if (rawData.length === 0) {
    return { headers: [], mapping: {}, unmappedHeaders: [], rows: [], totalRawRows: 0 }
  }

  const headerRow = rawData[0].map(v => String(v ?? "").trim())
  const { mapping, unmapped } = detectHeaderMapping(headerRow)

  const dataRows = rawData.slice(1)
  const totalRawRows = dataRows.length

  // Skip completely empty rows
  const rows: ParsedImportRow[] = []
  for (let i = 0; i < dataRows.length; i++) {
    const raw = dataRows[i]
    const hasData = raw.some(v => v != null && String(v).trim() !== "")
    if (!hasData) continue
    rows.push(parseRow(raw, mapping, i + 2)) // +2: 1-indexed, skip header
  }

  return {
    headers: headerRow,
    mapping,
    unmappedHeaders: unmapped,
    rows,
    totalRawRows,
  }
}

// ── Duplicate detection ─────────────────────────────────────────────

/** Builds a dedup key from the fields that meaningfully identify a job. */
export function dedupKey(row: { address: string; clientCompany: string; typeOfWorks: string }): string {
  return [
    row.address.toLowerCase().trim(),
    row.clientCompany.toLowerCase().trim(),
    row.typeOfWorks.toLowerCase().trim(),
  ].join("||")
}

/** Marks rows that duplicate each other within the import set. */
export function markInternalDuplicates(rows: ParsedImportRow[]): void {
  const seen = new Map<string, number>()
  for (const row of rows) {
    if (row.errors.length > 0) continue
    const key = dedupKey(row)
    const first = seen.get(key)
    if (first !== undefined) {
      row.warnings.push(`Duplicate of row ${first} (same address + client + type of works)`)
    } else {
      seen.set(key, row.rowIndex)
    }
  }
}
