/**
 * Client-side CSV helpers — shared download + cell escaping.
 * Uses spreadsheet formula sanitization for Excel/Sheets safety.
 */
import { sanitizeSpreadsheetCell } from "./spreadsheet-sanitize"

/** Escape a single CSV cell (quoted, formula-safe). */
export function escapeCsvCell(value: unknown): string {
  const sanitized = sanitizeSpreadsheetCell(value)
  const text = sanitized == null ? "" : String(sanitized)
  return `"${text.replace(/"/g, '""')}"`
}

/** Build a CSV string from headers + row arrays. */
export function buildCsv(headers: string[], rows: unknown[][]): string {
  return [
    headers.map(escapeCsvCell).join(","),
    ...rows.map(row => row.map(escapeCsvCell).join(",")),
  ].join("\n")
}

/** Trigger a browser download of a CSV string. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
