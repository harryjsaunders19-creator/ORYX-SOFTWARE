import type ExcelJS from "exceljs"

/** Reliable row iteration — avoids getRows() edge cases on loaded workbooks. */
export function sheetDataRows(sheet: ExcelJS.Worksheet): ExcelJS.Row[] {
  const rows: ExcelJS.Row[] = []
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber >= 2) rows.push(row)
  })
  return rows
}
