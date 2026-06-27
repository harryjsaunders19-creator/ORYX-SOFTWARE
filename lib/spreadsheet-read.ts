/**
 * lib/spreadsheet-read.ts — read CSV/XLSX uploads (import flows).
 * Uses exceljs instead of the unmaintained xlsx (SheetJS) package.
 */
import ExcelJS from "exceljs"
import { Readable } from "stream"

export async function readSpreadsheetRows(
  buffer: Buffer,
  filename: string,
): Promise<(string | number | undefined)[][]> {
  const ext = filename.toLowerCase().split(".").pop()
  const wb = new ExcelJS.Workbook()

  if (ext === "csv") {
    await wb.csv.read(Readable.from(buffer))
  } else {
    await wb.xlsx.read(Readable.from(buffer))
  }

  const sheet = wb.worksheets[0]
  if (!sheet) return []

  const rows: (string | number | undefined)[][] = []
  sheet.eachRow({ includeEmpty: false }, row => {
    const vals = row.values as (string | number | undefined)[]
    rows.push(vals.slice(1).map(v => (v == null ? "" : v)))
  })
  return rows
}
