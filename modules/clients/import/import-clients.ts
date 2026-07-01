/**
 * lib/import-clients.ts
 *
 * Parsing, header-mapping, and validation for bulk client import.
 * Reuses the SheetJS spreadsheet parser from import-jobs.ts.
 */

// ── Header mapping ──────────────────────────────────────────────────

export const CLIENT_IMPORT_FIELDS = [
  "name", "accountCode", "contactName", "phone", "email", "billingAddress", "notes",
] as const

export type ClientImportField = typeof CLIENT_IMPORT_FIELDS[number]

const HEADER_ALIASES: Record<string, ClientImportField> = {
  "company":            "name",
  "company name":       "name",
  "client":             "name",
  "client name":        "name",
  "customer":           "name",
  "customer name":      "name",
  "name":               "name",

  "customer id":        "accountCode",
  "account code":       "accountCode",
  "accountcode":        "accountCode",
  "account":            "accountCode",
  "code":               "accountCode",
  "client id":          "accountCode",
  "client code":        "accountCode",

  "contact":            "contactName",
  "contact name":       "contactName",
  "contactname":        "contactName",
  "main contact":       "contactName",

  "phone":              "phone",
  "telephone":          "phone",
  "tel":                "phone",
  "mobile":             "phone",
  "phone number":       "phone",

  "email":              "email",
  "email address":      "email",
  "e-mail":             "email",

  "address":            "billingAddress",
  "billing address":    "billingAddress",
  "billingaddress":     "billingAddress",
  "billing":            "billingAddress",

  "notes":              "notes",
  "note":               "notes",
  "comments":           "notes",
  "comment":            "notes",
}

export function detectClientHeaderMapping(rawHeaders: string[]): {
  mapping: Record<number, ClientImportField>
  unmapped: string[]
} {
  const mapping: Record<number, ClientImportField> = {}
  const unmapped: string[] = []
  const usedFields = new Set<ClientImportField>()

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

export interface ParsedClientRow {
  rowIndex: number
  name: string
  accountCode: string
  contactName: string
  phone: string
  email: string
  billingAddress: string
  notes: string
  errors: string[]
  warnings: string[]
}

function get(rawValues: (string | number | undefined)[], mapping: Record<number, ClientImportField>, field: ClientImportField): string {
  for (const [idx, f] of Object.entries(mapping)) {
    if (f === field) {
      const v = rawValues[parseInt(idx)]
      return v != null ? String(v).trim() : ""
    }
  }
  return ""
}

export function parseClientRow(
  rawValues: (string | number | undefined)[],
  mapping: Record<number, ClientImportField>,
  rowIndex: number,
): ParsedClientRow {
  const errors: string[] = []
  const warnings: string[] = []

  const name = get(rawValues, mapping, "name")
  const email = get(rawValues, mapping, "email")

  if (!name) errors.push("Company name is required")
  if (email && !email.includes("@")) warnings.push("Email format looks invalid")

  return {
    rowIndex,
    name,
    accountCode:    get(rawValues, mapping, "accountCode"),
    contactName:    get(rawValues, mapping, "contactName"),
    phone:          get(rawValues, mapping, "phone"),
    email,
    billingAddress: get(rawValues, mapping, "billingAddress"),
    notes:          get(rawValues, mapping, "notes"),
    errors,
    warnings,
  }
}

// ── File parsing ────────────────────────────────────────────────────

export interface ParseClientFileResult {
  headers: string[]
  mapping: Record<number, ClientImportField>
  unmappedHeaders: string[]
  rows: ParsedClientRow[]
  totalRawRows: number
}

export async function parseClientSpreadsheet(buffer: Buffer, filename: string): Promise<ParseClientFileResult> {
  const { readSpreadsheetRows } = await import("@/lib/spreadsheet-read")
  const rawData = await readSpreadsheetRows(buffer, filename)

  if (rawData.length === 0) return { headers: [], mapping: {}, unmappedHeaders: [], rows: [], totalRawRows: 0 }

  const headerRow = rawData[0].map((v: string | number | undefined) => String(v ?? "").trim())
  const { mapping, unmapped } = detectClientHeaderMapping(headerRow)

  const dataRows = rawData.slice(1)
  const rows: ParsedClientRow[] = []
  for (let i = 0; i < dataRows.length; i++) {
    const raw = dataRows[i]
    if (!raw.some((v: string | number | undefined) => v != null && String(v).trim() !== "")) continue
    rows.push(parseClientRow(raw, mapping, i + 2))
  }

  return { headers: headerRow, mapping, unmappedHeaders: unmapped, rows, totalRawRows: dataRows.length }
}

// ── Duplicate detection ─────────────────────────────────────────────

export function clientDedupKey(name: string): string {
  return name.toLowerCase().trim()
}

export function markInternalClientDuplicates(rows: ParsedClientRow[]): void {
  const seen = new Map<string, number>()
  for (const row of rows) {
    if (row.errors.length > 0 || !row.name) continue
    const key = clientDedupKey(row.name)
    const first = seen.get(key)
    if (first !== undefined) {
      row.warnings.push(`Duplicate of row ${first} (same company name)`)
    } else {
      seen.set(key, row.rowIndex)
    }
  }
}
