import ExcelJS from "exceljs"
import type { AccountsHandoverSnapshot } from "@/lib/db"
import { sanitizeSpreadsheetCell } from "@/shared/utils/spreadsheet-sanitize"

const GBP_FMT = '"£"#,##0.00'

/**
 * Builds the Accounts Handover workbook matching the company's standard
 * template layout. Single sheet named by export year.
 */
export async function buildAccountsHandoverWorkbook(
  snapshots: AccountsHandoverSnapshot[],
  meta: { batchNumber: string; exportDate: string; exportedBy: string },
): Promise<ExcelJS.Workbook> {
  if (!snapshots.length) {
    throw new Error("No export rows to write — snapshots are empty")
  }

  const wb = new ExcelJS.Workbook()
  const sheetYear = meta.exportDate.slice(0, 4)
  const sheet = wb.addWorksheet(sheetYear)

  sheet.columns = [
    { width: 2 },  { width: 22 }, { width: 2 },  { width: 40 },
    { width: 28 }, { width: 28 }, { width: 14 }, { width: 20 },
    { width: 16 }, { width: 24 },
  ]

  sheet.addRow([
    null, "Drawing Number", null, "Site Address", "Type of works",
    "Client Company", "Quote", "Requested By", "Date completed", "Designer completed by",
  ])

  for (const s of snapshots) {
    const typeOfWorks = s.project.typeOfWorks === "Other"
      ? (s.project.otherTypeDescription ?? "Other")
      : (s.project.typeOfWorks ?? "")

    const row = sheet.addRow([
      null,
      sanitizeSpreadsheetCell(s.project.drawingNumber),
      null,
      sanitizeSpreadsheetCell(s.project.siteAddress),
      sanitizeSpreadsheetCell(typeOfWorks),
      sanitizeSpreadsheetCell(s.client.clientName),
      sanitizeSpreadsheetCell(s.commercial.agreedFee ?? s.commercial.quotedFee),
      sanitizeSpreadsheetCell(s.request.requestedBy ?? ""),
      sanitizeSpreadsheetCell(s.project.completionDate || ""),
      sanitizeSpreadsheetCell(s.design.assignedDesigner ?? ""),
    ])

    const quoteCell = row.getCell(7)
    if (typeof quoteCell.value === "number") quoteCell.numFmt = GBP_FMT
  }

  return wb
}

export async function workbookToBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
